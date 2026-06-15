import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { DeviceProvider } from './context/DeviceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DateProvider } from './context/DateContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import EnrollmentQuestionnaire from './components/EnrollmentQuestionnaire';
import Dashboard from './pages/Dashboard';
import DashboardOverview from './pages/DashboardOverview';
import Ref from './pages/Ref';
import Tips from './pages/Tips';
import FAQ from './pages/FAQ';
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

  return user ? <Navigate to="/tips" replace /> : <Navigate to="/login" replace />;
}

function EnrollmentGate() {
  const { user, loading: authLoading, isGuestSession } = useAuth();
  const { preferences, loading: settingsLoading } = useSettings();

  if (authLoading || settingsLoading || !user || isGuestSession) return null;
  if (preferences.onboarded) return null;

  return <EnrollmentQuestionnaire />;
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
        <DeviceProvider>
        <AuthProvider>
          <SettingsProvider>
          <TooltipPrimitive.Provider delayDuration={400}>
          <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#b88968] to-white text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
            <EnrollmentGate />
            <Header />
            <main className="mx-auto w-full max-w-5xl xl:max-w-6xl 2xl:max-w-[1400px] 3xl:max-w-[1800px] 4xl:max-w-[2300px] flex-1 px-4 py-6 md:px-8 md:py-10">
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
                  path="/dashboard-overview"
                  element={
                    <ProtectedRoute>
                      <DashboardOverview />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/ref"
                  element={
                    <ProtectedRoute>
                      <Ref />
                    </ProtectedRoute>
                  }
                />
                <Route path="/events" element={<Navigate to="/ref" replace />} />
                <Route path="/forageables" element={<Navigate to="/ref" replace />} />
                <Route path="/critters" element={<Navigate to="/ref" replace />} />
                <Route path="/quests" element={<Navigate to="/ref" replace />} />
                <Route
                  path="/tips"
                  element={
                    <ProtectedRoute>
                      <Tips />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/faq"
                  element={
                    <ProtectedRoute>
                      <FAQ />
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
          </TooltipPrimitive.Provider>
          </SettingsProvider>
        </AuthProvider>
        </DeviceProvider>
      </DateProvider>
    </BrowserRouter>
  );
}
