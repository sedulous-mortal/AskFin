import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';

// Prevent unhandled WebSocket / network errors (e.g. Supabase realtime
// reconnection failures) from crashing the server process.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
import { createRequire } from 'module';
import { toClientCritters } from './helpers/critterReformatter.js';
import { parseSaveFile } from './helpers/parseSaveFile.js';

const require = createRequire(import.meta.url);
const gameIdMaps = require('./helpers/game_id_maps.json');
const ediblesRaw = require('./helpers/edibles_ids.json');
const questsFile = require('./helpers/quests.json');
const craftingItemsFile = require('./helpers/crafting_items.json');
const cookingRecipesFile = require('./helpers/cooking_recipes.json');
const forageablesFile = require('./helpers/forageables_schedule.json');
const forageablesList = forageablesFile.forageables || [];
const questsList = questsFile.quests || [];
const itemNames = gameIdMaps['InventoryItems_en'] || {};
const plantNames = gameIdMaps['PlantDataTable_en'] || {};
const allFishIds = new Set(gameIdMaps['fish_ids'] || []);

// Build ID → category/diet maps for recipes
const craftingCategoryById = {};
for (const item of craftingItemsFile) craftingCategoryById[item.id] = item.category;
const cookingDietById = {};
for (const item of cookingRecipesFile) cookingDietById[item.id] = item.diet;

// Build a Map of edible item id → source category
const allEdibles = new Map();
for (const id of (ediblesRaw.forageable || [])) allEdibles.set(id, 'forageable');
for (const id of (ediblesRaw.farmable || [])) allEdibles.set(id, 'farmable');
for (const id of (ediblesRaw.both || [])) allEdibles.set(id, 'both');

function resolveIds(ids) {
  return (ids || []).map(id => ({ id, name: itemNames[id] ?? null }));
}

function resolveCraftingRecipes(discoveredIds) {
  const discoveredSet = new Set(discoveredIds || []);
  const discovered = (discoveredIds || []).map(id => ({
    id,
    name: itemNames[id] ?? null,
    category: craftingCategoryById[id] ?? null,
  }));
  const undiscovered = craftingItemsFile
    .filter(item => !discoveredSet.has(item.id))
    .map(item => ({ id: item.id, name: item.name, category: item.category }));
  return { discovered, undiscovered };
}

function resolveCookingRecipes(discoveredIds) {
  const discoveredSet = new Set(discoveredIds || []);
  const discovered = (discoveredIds || []).map(id => ({
    id,
    name: itemNames[id] ?? null,
    diet: cookingDietById[id] ?? null,
  }));
  const undiscovered = cookingRecipesFile
    .filter(item => !discoveredSet.has(item.id))
    .map(item => ({ id: item.id, name: item.name, diet: item.diet }));
  return { discovered, undiscovered };
}

function resolveFishUndiscovered(discoveredIds) {
  const discovered = new Set(discoveredIds || []);
  return [...allFishIds]
    .filter(id => !discovered.has(id))
    .sort((a, b) => a - b)
    .map(id => ({ id, name: itemNames[id] ?? null }));
}

function resolveEdibles(discoveredItemIds) {
  const discoveredSet = new Set(discoveredItemIds || []);
  const discovered = [];
  const undiscovered = [];
  for (const [id, source] of allEdibles) {
    // Some forageable plant items are only named in PlantDataTable_en, not InventoryItems_en.
    const name = itemNames[id] ?? plantNames[id] ?? null;
    const item = { id, name, source };
    if (discoveredSet.has(id)) {
      discovered.push(item);
    } else {
      undiscovered.push(item);
    }
  }
  discovered.sort((a, b) => a.id - b.id);
  undiscovered.sort((a, b) => a.id - b.id);
  return { discovered, undiscovered, total: allEdibles.size };
}

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

const DEFAULT_PREFERENCES = {
  timezone: 'America/New_York',
  dark_mode: false,
  spoilers: {
    show_undiscovered_fish: true,
    show_undiscovered_cooking_recipes: true,
    show_undiscovered_crafting_recipes: true,
    show_undiscovered_items: true,
    show_undiscovered_forageables: true,
    show_undiscovered_quests: true,
    show_undiscovered_critters: true,
  },
};

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
// Limit raised to 20 MB to accommodate base64-encoded .grimshire save files.
app.use(express.json({ limit: '20mb' }));

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
      .insert({ id: userId, username: username || null, preferences: DEFAULT_PREFERENCES })
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

// Get source types (foraging, farming, etc.) for a given edible by name.
// Mirrors: SELECT st.id, st.name FROM edibles e
//          JOIN edibles_source es ON es.edible_id = e.id
//          JOIN source_types st ON st.id = es.source_id
//          WHERE LOWER(e.name) = LOWER(:name) ORDER BY st.name
app.get('/api/edibles/:name/sources', async (req, res) => {
  const edibleName = req.params.name;

  try {
    const { data: edible, error: edibleError } = await supabase
      .from('edibles')
      .select('id, name')
      .ilike('name', edibleName)
      .maybeSingle();

    if (edibleError) {
      console.error('Supabase error (edibles lookup):', edibleError.message);
      return res.status(500).json({ error: edibleError.message });
    }

    if (!edible) {
      return res.status(404).json({ error: `No edible found with name "${edibleName}".` });
    }

    const { data: junctionRows, error: sourcesError } = await supabase
      .from('edibles_source')
      .select('source_types ( id, name )')
      .eq('edible_id', edible.id);

    if (sourcesError) {
      console.error('Supabase error (edibles_source):', sourcesError.message);
      return res.status(500).json({ error: sourcesError.message });
    }

    const sources = (junctionRows || [])
      .filter((row) => row.source_types)
      .map((row) => row.source_types)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ edible: { id: edible.id, name: edible.name }, sources });
  } catch (err) {
    console.error('Server error (edible sources):', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all quests — served from local quests.json (extracted from game files)
app.get('/api/quests', (req, res) => {
  res.json(questsList);
});

// Returns forageables available on a given in-game date, plus the next 3 upcoming.
// Query params: season (0-3), day (1-28)
app.get('/api/forageables', (req, res) => {
  const season = parseInt(req.query.season, 10);
  const day = parseInt(req.query.day, 10);

  if (isNaN(season) || isNaN(day) || season < 0 || season > 3 || day < 1 || day > 28) {
    return res.status(400).json({ error: 'season (0-3) and day (1-28) query params are required.' });
  }

  const TOTAL_DAYS = 112;
  const currentAbs = season * 28 + (day - 1);

  function toAbs(s, d) { return s * 28 + (d - 1); }

  function isAvailable(f) {
    const start = toAbs(f.start_season, f.start_day);
    const end   = toAbs(f.end_season,   f.end_day);
    if (end >= start) return currentAbs >= start && currentAbs <= end;
    return currentAbs >= start || currentAbs <= end;
  }

  function daysUntilAvailable(f) {
    const start = toAbs(f.start_season, f.start_day);
    if (start === currentAbs) return 0;
    if (start > currentAbs) return start - currentAbs;
    return TOTAL_DAYS - currentAbs + start;
  }

  const available = forageablesList.filter(isAvailable);

  const upcoming = forageablesList
    .filter((f) => !isAvailable(f))
    .map((f) => ({ ...f, days_until: daysUntilAvailable(f) }))
    .sort((a, b) => a.days_until - b.days_until)
    .slice(0, 3);

  res.json({ available, upcoming });
});

// Parse a .grimshire save file and (optionally) upsert character data into Supabase.
// Body: { fileData: string (base64), userId?: string }
// Returns: { character: CharacterData, saved: boolean }
app.post('/api/save/parse', async (req, res) => {
  const { fileData, userId } = req.body;

  if (!fileData) {
    return res.status(400).json({ error: 'fileData is required.' });
  }

  let buffer;
  try {
    buffer = Buffer.from(fileData, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 file data.' });
  }

  let character;
  try {
    character = parseSaveFile(buffer);
  } catch (err) {
    console.error('Save file parse error:', err);
    return res.status(422).json({ error: 'Failed to parse save file.' });
  }

  if (!character.playerName) {
    return res.status(422).json({ error: 'Could not extract player name from save file.' });
  }

  if (userId) {
    try {
      // Look up by (user_id, save_file_name) — the fileName field is embedded
      // in the save file by the game itself and is stable regardless of what
      // the user names the file on disk. Fall back to character name only when
      // save_file_name is absent (e.g. rows created before this field existed).
      let existing = null;
      if (character.fileName) {
        const { data } = await supabase
          .from('characters')
          .select('id')
          .eq('user_id', userId)
          .eq('save_file_name', character.fileName)
          .maybeSingle();
        existing = data;
      }
      if (!existing) {
        const { data } = await supabase
          .from('characters')
          .select('id')
          .eq('user_id', userId)
          .eq('character_name', character.playerName)
          .maybeSingle();
        existing = data;
      }

      const payload = {
        user_id: userId,
        save_file_name: character.fileName ?? null,
        farm_name: character.farmName,
        exp: character.exp,
        player_species_id: character.playerSpeciesId,
        difficulty: character.difficulty,
        total_play_time_seconds: character.totalPlayTimeSeconds,
        player_pronouns: character.playerPronouns,
        save_file_version: character.saveFileVersion,
        updated_at: new Date().toISOString(),
        fish_discovered: character.fishDiscovered,
        critters_discovered: character.crittersDiscovered,
        items_discovered: character.itemsDiscovered,
        unlocked_crafting_recipes: character.unlockedCraftingRecipes,
        unlocked_cooking_recipes: character.unlockedCookingRecipes,
        quest_data: character.questData,
        donated_specimen_count: character.donatedMuseumItemsCount ?? 0,
        current_day: character.currentDateDay ?? null,
        current_season: character.currentDateSeason ?? null,
        current_year: character.currentDateYear ?? null,
      };

      let characterId;
      if (existing) {
        const { error: updateError } = await supabase
          .from('characters')
          .update(payload)
          .eq('id', existing.id);
        if (updateError) throw updateError;
        characterId = existing.id;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('characters')
          .insert({ character_name: character.playerName, ...payload })
          .select('id')
          .single();
        if (insertError) throw insertError;
        characterId = inserted?.id;
      }

      return res.json({ character, saved: true, characterId });
    } catch (err) {
      console.error('Failed to save character to Supabase:', err);
      return res.json({ character, saved: false, error: 'Parsed OK but failed to save to database.' });
    }
  }

  return res.json({ character, saved: false });
});

// Get a single character's full data with integer IDs resolved to item names.
app.get('/api/characters/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('id', id)
      .single();

    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Character not found.' });
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Character not found.' });

    const fishDiscovered = resolveIds(data.fish_discovered);
    const edibles = resolveEdibles(data.items_discovered);
    const craftingRecipes = resolveCraftingRecipes(data.unlocked_crafting_recipes);
    const cookingRecipes = resolveCookingRecipes(data.unlocked_cooking_recipes);
    return res.json({
      id: data.id,
      character_name: data.character_name,
      farm_name: data.farm_name,
      exp: data.exp,
      player_pronouns: data.player_pronouns,
      total_play_time_seconds: data.total_play_time_seconds,
      fish_discovered: fishDiscovered,
      fish_undiscovered: resolveFishUndiscovered(data.fish_discovered),
      fish_total: allFishIds.size,
      critters_discovered: data.critters_discovered || [],
      items_discovered: resolveIds(data.items_discovered),
      unlocked_crafting_recipes: craftingRecipes.discovered,
      unlocked_crafting_recipes_undiscovered: craftingRecipes.undiscovered,
      unlocked_cooking_recipes: cookingRecipes.discovered,
      unlocked_cooking_recipes_undiscovered: cookingRecipes.undiscovered,
      edibles_discovered: edibles.discovered,
      edibles_undiscovered: edibles.undiscovered,
      edibles_total: edibles.total,
      quest_data: data.quest_data || [],
      donated_specimen_count: data.donated_specimen_count ?? 0,
      current_day: data.current_day ?? null,
      current_season: data.current_season ?? null,
      current_year: data.current_year ?? null,
      difficulty: data.difficulty ?? null,
      updated_at: data.updated_at ?? null,
    });
  } catch (err) {
    console.error('Failed to fetch character detail:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/api/settings/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    const prefs = { ...DEFAULT_PREFERENCES, ...(data?.preferences || {}) };
    prefs.spoilers = { ...DEFAULT_PREFERENCES.spoilers, ...(prefs.spoilers || {}) };
    res.json(prefs);
  } catch (err) {
    console.error('Failed to fetch settings:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.patch('/api/settings/:userId', async (req, res) => {
  const { userId } = req.params;
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    const current = { ...DEFAULT_PREFERENCES, ...(existing?.preferences || {}) };
    current.spoilers = { ...DEFAULT_PREFERENCES.spoilers, ...(current.spoilers || {}) };

    if (updates.timezone !== undefined) current.timezone = updates.timezone;
    if (updates.dark_mode !== undefined) current.dark_mode = updates.dark_mode;
    if (updates.spoilers && typeof updates.spoilers === 'object') {
      current.spoilers = { ...current.spoilers, ...updates.spoilers };
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ preferences: current })
      .eq('id', userId);
    if (updateErr) throw updateErr;
    res.json(current);
  } catch (err) {
    console.error('Failed to update settings:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Test Supabase: http://localhost:${PORT}/api/test-supabase`);
  console.log(`Quests endpoint: http://localhost:${PORT}/api/quests`);
  console.log(`Critters endpoint: http://localhost:${PORT}/api/critters`);
  console.log(`Edible sources: http://localhost:${PORT}/api/edibles/:name/sources`);
});
