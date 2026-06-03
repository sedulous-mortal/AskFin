import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CharacterSelector from './CharacterSelector';
import LoadSaveFile from './LoadSaveFile';
import DatePicker from './DatePicker';
import RateLimitIndicator from './RateLimitIndicator';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/events', label: 'Events' },
  { to: '/forageables', label: 'Forageables' },
  { to: '/critters', label: 'Critters' },
  { to: '/quests', label: 'Quests' },
];

export default function Header() {
  const { user, loading, logout, isGuestSession } = useAuth();
  const navigate = useNavigate();
  const showAuthenticatedNav = !loading && Boolean(user);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      navigate('/login');
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/40 bg-slate-700 shadow-md">
      {/* Top strip — Supabase tracker pinned to the top-left */}
      <div className="flex px-8 pt-1.5">
        <RateLimitIndicator />
      </div>

      {/* Main nav row */}
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-8 pb-3 pt-1">
        <NavLink to={user ? '/dashboard' : '/'} className="mr-6 flex items-center">
          <img src="/grimshire-logo.png" alt="Grimshire" className="h-20 w-auto" />
        </NavLink>

        {showAuthenticatedNav && (
          <>
            <div className="flex flex-1 items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-5 py-3 text-base font-semibold transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-200 hover:bg-slate-600 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-3">
              {isGuestSession && (
                <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-semibold text-slate-900">
                  Guest mode
                </span>
              )}
              <DatePicker />
              <CharacterSelector />
              <LoadSaveFile />
              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-300 hover:bg-slate-600 hover:text-white"
              >
                Logout
              </button>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
