import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function parseHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    error: params.get('error'),
    error_description: params.get('error_description'),
  };
}

// Sentinel error thrown when the sign-in request exceeds our timeout window.
const TIMEOUT_MESSAGE = 'Sign-in request timed out';

// Translate the raw error coming back from Supabase (or the network layer) into
// an accurate, user-friendly message. Supabase intentionally returns the generic
// "Invalid login credentials" for several distinct situations (wrong password,
// no such user, etc.), and network/timeout failures should never be reported as
// a credentials problem.
function mapAuthError(err: unknown): string {
  // Supabase auth errors carry a numeric `status` and sometimes a `code`.
  const anyErr = err as { message?: string; status?: number; code?: string; name?: string } | null;
  const rawMessage = anyErr?.message ?? '';
  const message = rawMessage.toLowerCase();
  const code = (anyErr?.code ?? '').toLowerCase();
  const status = anyErr?.status;

  // Our own timeout sentinel, or generic network/fetch failures. These are the
  // cases that were previously masquerading as "invalid credentials".
  if (
    rawMessage === TIMEOUT_MESSAGE ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return 'The sign-in request timed out. Please check your internet connection and try again.';
  }
  if (
    anyErr?.name === 'TypeError' ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed') ||
    code === 'fetch_error'
  ) {
    return 'Unable to reach the authentication server. Please check your connection and try again.';
  }

  // Email not yet confirmed — distinct from bad credentials.
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Your email address has not been confirmed yet. Please check your inbox for the confirmation link.';
  }

  // Too many attempts / rate limiting.
  if (status === 429 || code === 'over_request_rate_limit' || message.includes('rate limit')) {
    return 'Too many sign-in attempts. Please wait a moment and try again.';
  }

  // Genuine bad-credentials case. Supabase lumps wrong-password and
  // no-such-account together here, so we keep it clear but honest.
  if (
    code === 'invalid_credentials' ||
    message.includes('invalid login credentials') ||
    status === 400
  ) {
    return 'Incorrect email or password. If you recently signed up, make sure your email is confirmed.';
  }

  // Anything else: show the underlying message if present, otherwise a generic
  // fallback. We never want to silently mislabel an unknown failure.
  return rawMessage || 'Sign-in failed. Please try again.';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { enterWithoutLogin } = useAuth();

  useEffect(() => {
    const { access_token, refresh_token, error_description } = parseHash(window.location.hash);

    if (error_description) {
      setError(decodeURIComponent(error_description));
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }

    if (access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(() => navigate('/dashboard'))
        .catch(() => setError('Unable to complete invite sign-in.'));
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation before we ever call Supabase. Empty submissions
    // would otherwise come back as a generic credentials error.
    const trimmedEmail = email.trim();
    if (!trimmedEmail && !password) {
      setError('Please enter your email address and password.');
      return;
    }
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    // A stale recovery/invite hash left in the URL can interfere with a fresh
    // password sign-in. Clear it before attempting login.
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    setLoading(true);

    try {
      const signInPromise = supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), 15000)
      );

      const result: any = await Promise.race([signInPromise, timeoutPromise]);
      console.log('signIn result', result);

      if (result?.error) {
        // Log the full underlying error for debugging, but only show the user
        // a mapped, friendly message.
        console.error('Login auth error:', result.error);
        setError(mapAuthError(result.error));
        return;
      }

      // ensure loading state is cleared before navigation
      setLoading(false);
      navigate('/dashboard');
    } catch (err) {
      // Timeouts and network/fetch failures land here.
      console.error('Login error:', err);
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-8 space-y-8">
        <div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            Sign in to your account
          </h2>
        </div>
        <form className="space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-300 dark:border-slate-600 placeholder-slate-500 dark:placeholder-slate-400 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-300 dark:border-slate-600 placeholder-slate-500 dark:placeholder-slate-400 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="block">Don't have an account?{' '}
                <Link to="/signup" className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300">
                  Sign up
                </Link>
              </span>
              <span className="block mt-2">
                <Link to="/forgot-password" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300">
                  Forgot your password?
                </Link>
              </span>
            </p>
          </div>

          <div className="text-center border-t border-slate-200 dark:border-slate-700 pt-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Just browsing?</p>
            <button
              type="button"
              onClick={() => {
                enterWithoutLogin();
                navigate('/dashboard');
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-slate-800 dark:hover:text-slate-100"
            >
              Continue as guest
            </button>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Sample data only — log in to see your own save file data.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
