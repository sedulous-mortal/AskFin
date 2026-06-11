import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDate } from '../context/DateContext';
import CharacterSelector from './CharacterSelector';
import LoadSaveFile from './LoadSaveFile';
import DatePicker from './DatePicker';
import finQuotes from '../data/finQuotes.json';

const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'] as const;

const navItems = [
  { to: '/tips', label: 'Tips' },
  { to: '/dashboard', label: 'Stats' },
  { to: '/critters', label: 'Critters' },
  { to: '/forageables', label: 'Forageables' },
  { to: '/quests', label: 'Quests' },
  { to: '/events', label: 'Events' },
  { to: '/faq', label: 'FAQ' },
  { to: '/dashboard-overview', label: 'Dashboard' },
  { to: '/settings', label: 'Settings' },
];

export default function Header() {
  const { user, loading, logout, isGuestSession, selectedCharacter } = useAuth();
  const { setSeason, setDay } = useDate();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // --- Dynamic hamburger detection ---
  // We render a hidden "ghost" nav (position:absolute, off-screen) that always has all
  // nav items at their natural width. A ResizeObserver on the center column tells us
  // whether there's room for the real nav. No fixed breakpoint needed.
  const showAuthenticatedNav = !loading && Boolean(user);

  const centerRef = useRef<HTMLDivElement>(null);
  const ghostNavRef = useRef<HTMLDivElement>(null);
  const [useHamburger, setUseHamburger] = useState(false);

  useEffect(() => {
    if (!showAuthenticatedNav) return;

    const check = () => {
      const center = centerRef.current;
      const ghost = ghostNavRef.current;
      if (!center || !ghost) return;
      setUseHamburger(ghost.scrollWidth > center.clientWidth);
    };

    const ro = new ResizeObserver(check);
    if (centerRef.current) ro.observe(centerRef.current);
    window.addEventListener('resize', check);
    check();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [showAuthenticatedNav]);

  // Close the dropdown whenever we switch back to full-nav mode.
  useEffect(() => {
    if (!useHamburger) setMenuOpen(false);
  }, [useHamburger]);

  // Sync date picker to character's in-game date on character change.
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
    <header className="sticky top-0 z-50 border-b border-slate-900/40 bg-slate-700 shadow-md dark:bg-slate-950 dark:border-slate-800">

      {/*
        Ghost nav — direct child of <header> so it is NEVER inside an overflow:hidden
        container. This lets ghost.scrollWidth always reflect the nav's true natural
        width, which is what we compare against center.clientWidth to decide whether
        to show the hamburger.
      */}
      {showAuthenticatedNav && (
        <div
          ref={ghostNavRef}
          aria-hidden
          className="pointer-events-none absolute flex flex-nowrap gap-1"
          style={{ top: -9999, left: 0, visibility: 'hidden' }}
        >
          {navItems.map((item) => (
            <span key={item.to} className="rounded-lg px-3 py-3 text-lg whitespace-nowrap">
              {item.label}
            </span>
          ))}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-5xl xl:max-w-6xl 2xl:max-w-[1400px] 3xl:max-w-[1800px] 4xl:max-w-[2300px] items-stretch gap-6 px-8 py-4">

        {/* Logo */}
        <NavLink
          to={user ? '/dashboard' : '/'}
          className="flex flex-none items-center"
        >
          <img src="/lighter-eyes-askfin.png" alt="AskFin" className="h-[124px] w-auto object-contain" />
        </NavLink>

        {/* Center: quote + real nav or hamburger button */}
        <div ref={centerRef} className="flex min-w-0 flex-1 flex-col justify-between overflow-hidden">
          <p className="pt-3 pb-1 text-[1.05rem] italic text-white/70">"{quote}"</p>

          {showAuthenticatedNav ? (
            <>
              {/* Full nav — shown when all items fit */}
              {!useHamburger && (
                <nav className="flex items-center gap-1 xl:gap-2 pt-1">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `rounded-lg px-3 xl:px-4 py-3 text-lg transition-colors ${
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
              )}

              {/* Hamburger button — shown when items would overflow */}
              {useHamburger && (
                <button
                  type="button"
                  aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                  className="self-start mt-1 flex flex-col justify-center gap-[5px] rounded-md p-2 text-slate-200 transition-colors hover:bg-slate-600"
                >
                  <span className={`block h-0.5 w-6 bg-current transition-transform duration-200 ${menuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
                  <span className={`block h-0.5 w-6 bg-current transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
                  <span className={`block h-0.5 w-6 bg-current transition-transform duration-200 ${menuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
                </button>
              )}
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
                className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-sans text-slate-200 transition-colors hover:border-slate-300 hover:bg-slate-600 hover:text-white"
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

      {/* Hamburger dropdown — normal flow, sticky with the header */}
      {menuOpen && useHamburger && showAuthenticatedNav && (
        <div className="border-t border-slate-900/40 dark:border-slate-800">
          <nav className="mx-auto flex w-full max-w-5xl xl:max-w-6xl 2xl:max-w-[1400px] 3xl:max-w-[1800px] 4xl:max-w-[2300px] flex-col gap-1 px-8 py-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-5 py-3 text-lg transition-colors ${
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
