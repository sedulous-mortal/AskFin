import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DateProvider } from './context/DateContext';
import { SettingsProvider } from './context/SettingsContext';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import Forageables from './pages/Forageables';
import Critters from './pages/Critters';
import Quests from './pages/Quests';
import Settings from './pages/Settings';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Capture the URL hash exactly once, at module load — before React mounts and
// before the Supabase client's detectSessionInUrl can consume/clear it. Supabase
// recovery emails land on the root route ("/") with the recovery tokens in the
// hash fragment (#access_token=...&type=recovery). We must preserve this so the
// reset-password flow can pick the tokens up.
const initialHash = typeof window !== 'undefined' ? window.location.hash : '';

function hashIsRecovery(hash: string): boolean {
  if (!hash) return false;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('type') === 'recovery' && !!params.get('access_token');
}

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // A recovery link lands on "/" with the tokens in the hash. Forward to the
  // reset-password page, keeping the hash intact so ResetPassword can consume it.
  // Check both the live hash and the hash captured at module load (in case
  // Supabase's detectSessionInUrl already stripped it).
  const recoveryHash = hashIsRecovery(location.hash)
    ? location.hash
    : hashIsRecovery(initialHash)
      ? initialHash
      : '';

  if (recoveryHash) {
    return <Navigate to={`/reset-password${recoveryHash}`} replace />;
  }

  if (loading) {
    return <Spinner />;
  }

  return user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

// Redirects already-authenticated users away from auth-only pages (login/signup)
// to the dashboard. Shows the page itself while auth state is still resolving or
// when the user is logged out.
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <Spinner />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <DateProvider>
        <AuthProvider>
          <SettingsProvider>
          <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#b88968] to-white text-slate-900">
            <Header />
            <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-10">
              <Routes>
                <Route
                  path="/login"
                  element={
                    <PublicOnlyRoute>
                      <Login />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/signup"
                  element={
                    <PublicOnlyRoute>
                      <SignUp />
                    </PublicOnlyRoute>
                  }
                />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/" element={<HomeRedirect />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/events"
                  element={
                    <ProtectedRoute>
                      <Events />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/forageables"
                  element={
                    <ProtectedRoute>
                      <Forageables />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/critters"
                  element={
                    <ProtectedRoute>
                      <Critters />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/quests"
                  element={
                    <ProtectedRoute>
                      <Quests />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </main>
            <Footer />
          </div>
          </SettingsProvider>
        </AuthProvider>
      </DateProvider>
    </BrowserRouter>
  );
}
