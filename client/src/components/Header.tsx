import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDate } from '../context/DateContext';
import CharacterSelector from './CharacterSelector';
import LoadSaveFile from './LoadSaveFile';
import DatePicker from './DatePicker';
import finQuotes from '../data/finQuotes.json';

const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'] as const;

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/events', label: 'Events' },
  { to: '/forageables', label: 'Forageables' },
  { to: '/critters', label: 'Critters' },
  { to: '/quests', label: 'Quests' },
  { to: '/settings', label: 'Settings' },
];

export default function Header() {
  const { user, loading, logout, isGuestSession, selectedCharacter } = useAuth();
  const { setSeason, setDay } = useDate();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (
      selectedCharacter?.current_season != null &&
      selectedCharacter?.current_day != null
    ) {
      const seasonName = SEASON_NAMES[selectedCharacter.current_season];
      if (seasonName) {
        setSeason(seasonName);
        setDay(selectedCharacter.current_day);
      }
    }
  }, [selectedCharacter?.id]);

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
        Flex row: [logo | center (quote + nav/hamburger) | right (controls + datepicker)]
        No overflow property — flex-none on the logo guarantees it never disappears,
        and omitting overflow lets the character dropdown escape below the header.
      */}
      <div className="mx-auto flex w-full max-w-screen-xl items-stretch gap-6 px-6 py-4">

        {/* Logo — flex-none: can never be shrunk or displaced */}
        <NavLink
          to={user ? '/dashboard' : '/'}
          className="flex flex-none items-center"
        >
          <img src="/askfinlogo1.png" alt="AskFin" className="h-24 w-auto object-contain" />
        </NavLink>

        {/* Center: quote (top) + nav links or hamburger button (bottom) */}
        <div className="flex min-w-0 flex-1 flex-col justify-between overflow-hidden">
          <p className="pb-1 text-[1.05rem] italic text-white/70">"{quote}"</p>
          {showAuthenticatedNav ? (
            <>
              {/* Full nav — visible at 1300 px and above */}
              <nav className="hidden min-[1300px]:flex items-center gap-1 pt-1">
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
              </nav>

              {/* Hamburger button — visible below 1300 px */}
              <button
                type="button"
                aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="min-[1300px]:hidden self-start mt-1 flex flex-col justify-center gap-[5px] rounded-md p-2 text-slate-200 transition-colors hover:bg-slate-600"
              >
                <span
                  className={`block h-0.5 w-6 bg-current transition-transform duration-200 ${
                    menuOpen ? 'translate-y-[7px] rotate-45' : ''
                  }`}
                />
                <span
                  className={`block h-0.5 w-6 bg-current transition-opacity duration-200 ${
                    menuOpen ? 'opacity-0' : ''
                  }`}
                />
                <span
                  className={`block h-0.5 w-6 bg-current transition-transform duration-200 ${
                    menuOpen ? '-translate-y-[7px] -rotate-45' : ''
                  }`}
                />
              </button>
            </>
          ) : (
            <div />
          )}
        </div>

        {/* Right: user controls (top) + DatePicker (bottom) */}
        {showAuthenticatedNav ? (
          <div className="flex flex-none flex-col items-end justify-between gap-1">
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
            <div className="flex items-center justify-end pt-1">
              <DatePicker />
            </div>
          </div>
        ) : (
          <div />
        )}

      </div>

      {/*
        Hamburger dropdown — normal document flow (not absolute), so the sticky
        header simply expands downward to include it and stays fully on-screen.
        Hidden at 1300 px and above via min-[1300px]:hidden.
      */}
      {menuOpen && showAuthenticatedNav && (
        <div className="border-t border-slate-900/40 min-[1300px]:hidden">
          <nav className="mx-auto flex max-w-screen-xl flex-col gap-1 px-6 py-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
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
          </nav>
        </div>
      )}
    </header>
  );
}
