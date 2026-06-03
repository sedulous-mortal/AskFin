import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
import { toClientCritters } from './helpers/critterReformatter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  realtime: { transport: ws },
});

console.log('Supabase client initialized with URL:', supabaseUrl);

// Simple in-memory email invite rate limiter (per-server instance)
const EMAIL_RATE_LIMIT_MAX = parseInt(process.env.EMAIL_RATE_LIMIT_MAX || '2', 10); // max auth email queries
const EMAIL_RATE_LIMIT_WINDOW = parseInt(process.env.EMAIL_RATE_LIMIT_WINDOW || '3600', 10); // seconds
const RATE_LIMIT_MARKER_EMAIL = '__RATE_LIMIT_EXCEEDED__';
const RATE_LIMIT_INFO_PREFIX = '__SUPABASE_RATE_INFO__:';
let inviteTimestamps = [];
let latestSupabaseRateInfo = null;

function pruneInvites() {
  const cutoff = Date.now() - EMAIL_RATE_LIMIT_WINDOW * 1000;
  inviteTimestamps = inviteTimestamps.filter((ts) => ts >= cutoff);
}

function parseRateHeaders(headers) {
  const hasRateHeaders =
    headers.has('x-ratelimit-limit') ||
    headers.has('x-ratelimit-remaining') ||
    headers.has('x-ratelimit-reset') ||
    headers.has('retry-after');

  // Log all headers for debugging
  console.log('Supabase response headers:', {
    'x-ratelimit-limit': headers.get('x-ratelimit-limit'),
    'x-ratelimit-remaining': headers.get('x-ratelimit-remaining'),
    'x-ratelimit-reset': headers.get('x-ratelimit-reset'),
    'retry-after': headers.get('retry-after'),
  });

  if (!hasRateHeaders) {
    console.warn('No rate limit headers found from Supabase');
    return null;
  }

  const limit = Number(headers.get('x-ratelimit-limit') || '0');
  const remaining = Number(headers.get('x-ratelimit-remaining') || '0');
  const resetHeader = headers.get('x-ratelimit-reset');
  const retryAfter = Number(headers.get('retry-after') || '0');

  let resetIn = 0;
  if (resetHeader) {
    const parsed = Number(resetHeader);
    if (!Number.isNaN(parsed)) {
      // Supabase may return a timestamp or a seconds-until-reset value.
      const now = Date.now();
      resetIn = parsed > 9999999999 ? Math.max(0, Math.ceil((parsed * 1000 - now) / 1000)) : parsed;
    }
  } else if (retryAfter) {
    resetIn = retryAfter;
  } else {
    // If no reset time header, estimate from window duration
    console.warn('No reset time in headers, using window duration as estimate');
    resetIn = EMAIL_RATE_LIMIT_WINDOW;
  }

  return {
    max: limit,
    window: EMAIL_RATE_LIMIT_WINDOW,
    remaining,
    resetIn,
    allowed: remaining > 0,
    source: 'supabase',
  };
}

// Try to compute rate info from Supabase DB table `email_invites`.
// Falls back to in-memory timestamps if DB access fails.
async function getInviteRateInfo() {
  const now = Date.now();
  const cutoffDate = new Date(now - EMAIL_RATE_LIMIT_WINDOW * 1000).toISOString();

  try {
    console.log('Querying email_invites from Supabase...');
    const { data, count, error } = await supabase
      .from('email_invites')
      .select('created_at', { count: 'exact' })
      .neq('email', RATE_LIMIT_MARKER_EMAIL)
      .not('email', 'like', `${RATE_LIMIT_INFO_PREFIX}%`)
      .gte('created_at', cutoffDate);

    if (error) {
      console.error('Supabase returned error:', error);
      throw error;
    }

    console.log('Supabase query successful. Count:', count, 'Data length:', data?.length);

    const { data: markerData, error: markerError } = await supabase
      .from('email_invites')
      .select('created_at')
      .eq('email', RATE_LIMIT_MARKER_EMAIL)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .limit(1);

    if (markerError) {
      console.error('Supabase marker query failed:', markerError);
      throw markerError;
    }

    const { data: infoData, error: infoError } = await supabase
      .from('email_invites')
      .select('created_at,email')
      .ilike('email', `${RATE_LIMIT_INFO_PREFIX}%`)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .limit(1);

    if (infoError) {
      console.error('Supabase rate info query failed:', infoError);
      throw infoError;
    }

    const used = typeof count === 'number' ? count : (data || []).length;
    const markerRow = markerData?.[0];
    const markerTs = markerRow ? new Date(markerRow.created_at).getTime() : null;
    const markerActive = markerTs ? markerTs >= Date.now() - EMAIL_RATE_LIMIT_WINDOW * 1000 : false;

    let remaining = Math.max(0, EMAIL_RATE_LIMIT_MAX - used);
    let resetIn = 0;
    let allowed = remaining > 0;

    if (markerActive) {
      allowed = false;
      remaining = 0;
      resetIn = Math.ceil((EMAIL_RATE_LIMIT_WINDOW * 1000 - (now - markerTs)) / 1000);
      if (resetIn < 0) resetIn = 0;
    } else if (used >= EMAIL_RATE_LIMIT_MAX) {
      // find the oldest timestamp within the window to compute reset
      const oldestRow = (data || []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
      if (oldestRow) {
        const oldest = new Date(oldestRow.created_at).getTime();
        resetIn = Math.ceil((EMAIL_RATE_LIMIT_WINDOW * 1000 - (now - oldest)) / 1000);
      }
      allowed = false;
    }

    let persistedSupabaseInfo = null;
    if (infoData?.length) {
      try {
        const raw = infoData[0].email;
        const json = raw.slice(RATE_LIMIT_INFO_PREFIX.length);
        const parsed = JSON.parse(json);
        persistedSupabaseInfo = { ...parsed, source: 'supabase' };
      } catch (e) {
        console.error('Failed to parse persisted Supabase rate info:', e);
      }
    }

    return { max: EMAIL_RATE_LIMIT_MAX, window: EMAIL_RATE_LIMIT_WINDOW, remaining, resetIn, allowed, persistedSupabaseInfo };
  } catch (err) {
    console.error('DB rate-info failed, falling back to memory:');
    console.error('  Error:', err);
    console.error('  Message:', err?.message);
    console.error('  Stack:', err?.stack);
    // fallback to in-memory
    pruneInvites();
    const remaining = Math.max(0, EMAIL_RATE_LIMIT_MAX - inviteTimestamps.length);
    let resetIn = 0;
    if (inviteTimestamps.length >= EMAIL_RATE_LIMIT_MAX) {
      const oldest = Math.min(...inviteTimestamps);
      resetIn = Math.ceil((EMAIL_RATE_LIMIT_WINDOW * 1000 - (now - oldest)) / 1000);
    }
    return { max: EMAIL_RATE_LIMIT_MAX, window: EMAIL_RATE_LIMIT_WINDOW, remaining, resetIn, allowed: remaining > 0 };
  }
}

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test Supabase connectivity
app.get('/api/test-supabase', async (req, res) => {
  try {
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase.from('email_invites').select('count', { count: 'exact' }).limit(1);
    
    if (error) {
      console.error('Supabase test failed:', error);
      return res.status(500).json({ status: 'failed', error: error.message || error });
    }
    
    console.log('Supabase connection successful');
    res.json({ status: 'ok', message: 'Supabase connection working' });
  } catch (err) {
    console.error('Supabase test error:', err);
    res.status(500).json({ status: 'error', error: err.message || err.toString() });
  }
});

// Signup endpoint: create auth user and profile in one server-controlled flow
app.options('/api/signup', cors());
app.post('/api/signup', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // Check server-side email invite rate limit before creating user
  const rateInfo = await getInviteRateInfo();
  if (!rateInfo.allowed) {
    return res.status(429).json({ error: 'Email invite rate limit exceeded. Try again later.', rate: rateInfo });
  }

  let userId;

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { username: username || null },
      email_confirm: false,
    });

    if (authError) {
      console.error('Auth create error:', authError.message);
      return res.status(400).json({ error: authError.message });
    }

    userId = authData.user?.id;
    if (!userId) {
      return res.status(500).json({ error: 'Failed to create auth user.' });
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert({ id: userId, username: username || null })
      .select()
      .single();

    if (profileError) {
      console.error('Profile insert failed:', profileError.message);
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (delErr) {
        console.error('Failed to delete auth user after profile insert failure:', delErr);
      }
      return res.status(500).json({ error: 'Signup failed while creating profile.' });
    }

    const inviteUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/invite`;
    const inviteResponse = await fetch(inviteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        email,
        redirect_to: `${frontendUrl}/login`,
        data: { username: username || null },
      }),
    });

    const inviteResponseBody = await inviteResponse.json().catch(() => ({}));
    const inviteRateInfo = parseRateHeaders(inviteResponse.headers);
    if (inviteRateInfo) {
      latestSupabaseRateInfo = inviteRateInfo;
    }

    if (!inviteResponse.ok) {
      console.error('Invite email failed:', inviteResponseBody?.error || inviteResponseBody?.msg || inviteResponse.statusText);
      if (inviteResponse.status === 429) {
        console.log('Supabase invite rate limit exceeded; recording sticky marker in DB');
        try {
          const { error: markerError } = await supabase.from('email_invites').insert({
            email: RATE_LIMIT_MARKER_EMAIL,
            created_at: new Date().toISOString(),
          });
          if (markerError) {
            console.error('Failed to record rate-limit marker:', markerError.message || markerError);
          }
        } catch (markerErr) {
          console.error('Failed to record rate-limit marker:', markerErr);
        }
      }
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (delErr) {
        console.error('Failed to delete auth user after invite failure:', delErr);
      }
      try {
        await supabase.from('profiles').delete().eq('id', userId);
      } catch (delProfileErr) {
        console.error('Failed to delete profile after invite failure:', delProfileErr);
      }
      return res.status(500).json({ error: 'Signup failed while sending invite email.', rate: inviteRateInfo });
    }

    // Record successful invite timestamp for rate-limiting (persist to DB, fallback to memory)
    try {
      const { error: tsError } = await supabase.from('email_invites').insert({ email, created_at: new Date().toISOString() });
      if (tsError) throw tsError;
    } catch (tsErr) {
      console.error('Failed to record invite timestamp in DB, falling back to memory:', tsErr.message || tsErr);
      try {
        inviteTimestamps.push(Date.now());
        pruneInvites();
      } catch (memErr) {
        console.error('Failed to record invite timestamp in memory:', memErr);
      }
    }

    return res.status(200).json({ message: 'Signup successful. Check your email to complete registration.', user: authData.user, rate: inviteRateInfo });
  } catch (err) {
    console.error('Signup server error:', err);
    if (userId) {
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (delErr) {
        console.error('Failed to delete auth user during error handling:', delErr);
      }
      try {
        await supabase.from('profiles').delete().eq('id', userId);
      } catch (delProfileErr) {
        console.error('Failed to delete profile during error handling:', delProfileErr);
      }
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/signup', (req, res) => {
  res.status(405).json({ error: 'POST /api/signup is required to create an account.' });
});

// Expose current email invite rate limit info
app.get('/api/email-rate-limit', async (req, res) => {
  try {
    const info = await getInviteRateInfo();
    const supabaseInfo = latestSupabaseRateInfo || info.persistedSupabaseInfo || undefined;
    const response = { db: info, supabase: supabaseInfo };
    return res.json(response);
  } catch (err) {
    console.error('Failed to get rate info:', err);
    res.status(500).json({ error: 'Failed to get rate info' });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  console.log('Processing forgot-password request for:', email);
  console.log('Using frontend URL:', frontendUrl);

  const recoverUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/recover`;
  try {
    const response = await fetch(recoverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({ email, redirect_to: `${frontendUrl}/reset-password` }),
    });

    const responseBody = await response.json().catch(() => ({}));
    const rateInfo = parseRateHeaders(response.headers);
    console.log('Forgot-password response rate info:', rateInfo);
    if (rateInfo) {
      latestSupabaseRateInfo = rateInfo;
      console.log('Updated latestSupabaseRateInfo');
      try {
        const { error: infoError } = await supabase.from('email_invites').insert({
          email: `${RATE_LIMIT_INFO_PREFIX}${JSON.stringify({
            max: rateInfo.max,
            remaining: rateInfo.remaining,
            resetIn: rateInfo.resetIn,
            timestamp: new Date().toISOString(),
          })}`,
          created_at: new Date().toISOString(),
        });
        if (infoError) {
          console.error('Failed to persist Supabase rate info:', infoError.message || infoError);
        }
      } catch (persistErr) {
        console.error('Failed to persist Supabase rate info:', persistErr);
      }
    }

    if (!response.ok) {
      if (response.status === 429) {
        console.log('Supabase forgot-password rate limit exceeded; recording sticky marker in DB');
        try {
          const { error: markerError } = await supabase.from('email_invites').insert({
            email: RATE_LIMIT_MARKER_EMAIL,
            created_at: new Date().toISOString(),
          });
          if (markerError) {
            console.error('Failed to record rate-limit marker:', markerError.message || markerError);
          }
        } catch (markerErr) {
          console.error('Failed to record rate-limit marker:', markerErr);
        }
      }

      return res.status(response.status).json({
        error: responseBody?.error || responseBody?.msg || 'Failed to send reset email.',
        rate: rateInfo,
      });
    }

    // If the reset request was accepted, track it in the DB so rate limit data reflects both invite and reset emails.
    try {
      const { error: tsError } = await supabase.from('email_invites').insert({ email, created_at: new Date().toISOString() });
      if (tsError) {
        console.error('Failed to record password reset email timestamp:', tsError.message || tsError);
      }
    } catch (err) {
      console.error('Failed to record password reset email timestamp:', err);
    }

    return res.json({ message: 'If that email exists, a password reset link has been sent.', rate: rateInfo });
  } catch (err) {
    console.error('Forgot password proxy error:', err);
    return res.status(500).json({ error: 'Unable to send password reset email.', rate: null });
  }
});

// Get all critters with their taming foods.
// Two explicit queries are used instead of a single embedded-resource select so
// that the join works regardless of what the FK column in critter_foods is named.
app.get('/api/critters', async (req, res) => {
  try {
    // 1. Base critter rows
    const { data: critters, error: crittersError } = await supabase
      .from('critters')
      .select('id, critter_type, subtype, sprite, habitat, active_at, description')
      .order('critter_type', { ascending: true })
      .order('subtype', { ascending: true });

    if (crittersError) {
      console.error('Supabase error (critters):', crittersError.message);
      return res.status(500).json({ error: crittersError.message });
    }

    // 2. Junction rows joined to edibles for name + image_location
    const { data: critterFoods, error: foodsError } = await supabase
      .from('critter_foods')
      .select('critter_id, edibles ( id, name, image_path )');

    if (foodsError) {
      console.error('Supabase error (critter_foods):', foodsError.message);
      return res.status(500).json({ error: foodsError.message });
    }

    // 3. Index foods by critter_id, keeping the shape toClientCritters expects
    const foodsByCritterId = (critterFoods || []).reduce((acc, cf) => {
      if (!cf.edibles) return acc;
      if (!acc[cf.critter_id]) acc[cf.critter_id] = [];
      acc[cf.critter_id].push({ edibles: cf.edibles });
      return acc;
    }, {});

    // 4. Attach foods, then reformat into the client-facing Critter shape
    const crittersWithFoods = (critters || []).map((c) => ({
      ...c,
      critter_foods: foodsByCritterId[c.id] ?? [],
    }));

    res.json(toClientCritters(crittersWithFoods));
  } catch (err) {
    console.error('Server error (critters):', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Diagnostic: returns raw critters + critter_foods + edibles data before any
// reformatting, so you can verify IDs match up correctly in the DB.
// Remove this endpoint once the data has been confirmed correct.
app.get('/api/debug/critter-foods', async (req, res) => {
  try {
    const { data: critters, error: e1 } = await supabase
      .from('critters')
      .select('id, critter_type, subtype')
      .order('critter_type', { ascending: true })
      .order('subtype', { ascending: true });
    if (e1) return res.status(500).json({ error: e1.message });

    const { data: junctionRows, error: e2 } = await supabase
      .from('critter_foods')
      .select('critter_id, edibles ( id, name )');
    if (e2) return res.status(500).json({ error: e2.message });

    // Show each critter alongside the food rows the junction table maps to it
    const foodsByCritterId = (junctionRows || []).reduce((acc, cf) => {
      if (!acc[cf.critter_id]) acc[cf.critter_id] = [];
      if (cf.edibles) acc[cf.critter_id].push(cf.edibles);
      return acc;
    }, {});

    const report = (critters || []).map((c) => ({
      critter_id: c.id,
      critter_type: c.critter_type,
      subtype: c.subtype,
      foods_from_junction: foodsByCritterId[c.id] ?? [],
    }));

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all quests
app.get('/api/quests', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('quests')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Supabase error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Test Supabase: http://localhost:${PORT}/api/test-supabase`);
  console.log(`Quests endpoint: http://localhost:${PORT}/api/quests`);
  console.log(`Critters endpoint: http://localhost:${PORT}/api/critters`);
});
