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
      {/*
        Two-row grid: left column takes all remaining space, right column is
        auto-sized to its widest row — this keeps the controls and DatePicker
        in the same right-side column without any manual width guessing.
      */}
      <div className="mx-auto grid w-full max-w-screen-xl grid-cols-[1fr_auto] px-6 pt-1">

        {/* Row 1 left — Supabase tracker */}
        <div className="flex items-center pt-2 pb-1">
          <RateLimitIndicator />
        </div>

        {/* Row 1 right — user controls */}
        {showAuthenticatedNav ? (
          <div className="flex items-center gap-5 pt-2 pb-1">
            {isGuestSession && (
              <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-semibold text-slate-900">
                Guest mode
              </span>
            )}
            <CharacterSelector />
            <LoadSaveFile />
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-300 hover:bg-slate-600 hover:text-white"
            >
              Logout
            </button>
          </div>
        ) : (
          <div />
        )}

        {/* Row 2 left — logo + nav */}
        <nav className="flex items-center gap-2 pb-3 pt-1">
          <NavLink to={user ? '/dashboard' : '/'} className="mr-6 flex shrink-0 items-center">
            <img src="/grimshire-logo.png" alt="Grimshire" className="h-20 w-auto" />
          </NavLink>

          {showAuthenticatedNav && (
            <div className="flex items-center gap-1">
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
          )}
        </nav>

        {/* Row 2 right — DatePicker, aligned under the user controls */}
        {showAuthenticatedNav ? (
          <div className="flex items-center justify-end pb-3 pt-1">
            <DatePicker />
          </div>
        ) : (
          <div />
        )}

      </div>
    </header>
  );
}
