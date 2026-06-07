import { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CharacterSelector from './CharacterSelector';
import LoadSaveFile from './LoadSaveFile';
import DatePicker from './DatePicker';
import finQuotes from '../data/finQuotes.json';

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
  const quote = useMemo(
    () => finQuotes[Math.floor(Math.random() * finQuotes.length)],
    [],
  );

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
        Three-column grid: [logo | nav/center | controls]
        Logo spans both rows so it fills the full header height.
        Center col: row 1 = spacer, row 2 = nav links.
        Right col:  row 1 = user controls, row 2 = DatePicker.
      */}
      <div className="mx-auto grid w-full max-w-screen-xl grid-cols-[auto_1fr_auto] px-6 py-4">

        {/* Col 1, rows 1+2 — Logo fills full header height */}
        <NavLink
          to={user ? '/dashboard' : '/'}
          className="row-span-2 mr-8 flex items-center self-stretch"
        >
          <img src="/askfinlogo1.png" alt="AskFin" className="h-full max-h-40 w-auto" />
        </NavLink>

        {/* Col 2, row 1 — Fin quote */}
        <p className="flex items-end pb-1 text-[1.05rem] italic text-white/70">
          "{quote}"
        </p>

        {/* Col 3, row 1 — user controls */}
        {showAuthenticatedNav ? (
          <div className="flex items-center gap-5 pb-1">
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

        {/* Col 2, row 2 — nav links */}
        {showAuthenticatedNav ? (
          <nav className="flex items-center gap-1 pt-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-5 py-3 text-base font-semibold transition-colors ${isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-200 hover:bg-slate-600 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : (
          <div />
        )}

        {/* Col 3, row 2 — DatePicker */}
        {showAuthenticatedNav ? (
          <div className="flex items-center justify-end pt-1">
            <DatePicker />
          </div>
        ) : (
          <div />
        )}

      </div>
    </header>
  );
}
