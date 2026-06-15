import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDate } from '../context/DateContext';
import { useDevice } from '../context/DeviceContext';
import CharacterSelector from './CharacterSelector';
import LoadSaveFile from './LoadSaveFile';
import DatePicker from './DatePicker';
import finQuotes from '../data/finQuotes.json';

const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'] as const;

const navItems = [
  { to: '/tips', label: 'Tips' },
  { to: '/dashboard', label: 'Stats' },
  { to: '/ref', label: 'Ref' },
  { to: '/faq', label: 'FAQ' },
  { to: '/dashboard-overview', label: 'Dashboard' },
  { to: '/settings', label: 'Settings' },
];

export default function Header() {
  const { user, loading, logout, isGuestSession, selectedCharacter } = useAuth();
  const { setSeason, setDay } = useDate();
  const { isNarrowScreen } = useDevice();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const showAuthenticatedNav = !loading && Boolean(user);

  // Ghost nav measures whether all items fit at their natural width.
  const centerRef = useRef<HTMLDivElement>(null);
  const ghostNavRef = useRef<HTMLDivElement>(null);
  const [useHamburger, setUseHamburger] = useState(false);

  useEffect(() => {
    if (!showAuthenticatedNav) return;

    const check = () => {
      const center = centerRef.current;
      const ghost = ghostNavRef.current;
      if (!center || !ghost) return;
      // Small buffer so the hamburger kicks in before overflow-hidden clips the last nav item.
      setUseHamburger(ghost.scrollWidth + 12 > center.clientWidth);
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

  // On narrow screens the hamburger is always shown; on wider screens only when items overflow.
  const showHamburgerButton = isNarrowScreen || useHamburger;
  const showFullNav = !isNarrowScreen && !useHamburger;

  useEffect(() => {
    if (!showHamburgerButton) setMenuOpen(false);
  }, [showHamburgerButton]);

  // Close menu when screen widens past mobile breakpoint.
  useEffect(() => {
    if (!isNarrowScreen) setMenuOpen(false);
  }, [isNarrowScreen]);

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
    setMenuOpen(false);
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

      {/* Ghost nav — measures natural nav width to decide hamburger vs. full nav */}
      {showAuthenticatedNav && (
        <div
          ref={ghostNavRef}
          aria-hidden
          className="pointer-events-none absolute flex flex-nowrap gap-1 xl:gap-2"
          style={{ top: -9999, left: 0, visibility: 'hidden' }}
        >
          {navItems.map((item) => (
            <span key={item.to} className="rounded-lg px-3 xl:px-4 py-3 text-lg whitespace-nowrap">
              {item.label}
            </span>
          ))}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-5xl xl:max-w-6xl 2xl:max-w-[1400px] 3xl:max-w-[1800px] 4xl:max-w-[2300px] items-center gap-3 md:gap-6 px-4 md:px-8 py-3 md:py-4">

        {/* Logo — smaller on mobile */}
        <NavLink
          to={user ? '/dashboard' : '/'}
          className="flex flex-none items-center"
        >
          <img
            src="/lighter-eyes-askfin.png"
            alt="AskFin"
            className="h-[64px] md:h-[124px] w-auto object-contain"
          />
        </NavLink>

        {/* Center: quote + full nav or hamburger button */}
        <div ref={centerRef} className="flex min-w-0 flex-1 flex-col justify-between overflow-hidden md:self-stretch">
          <p className="hidden md:block pt-3 pb-1 text-[1.05rem] italic text-white/70">"{quote}"</p>

          {showAuthenticatedNav ? (
            <>
              {showFullNav && (
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

              {showHamburgerButton && (
                <button
                  type="button"
                  aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                  className="self-start flex flex-col justify-center gap-[5px] rounded-md p-2 text-slate-200 transition-colors hover:bg-slate-600 md:mt-1"
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

        {/* CharacterSelector — always visible when authenticated */}
        {showAuthenticatedNav && (
          <div className="flex flex-none flex-col items-end justify-between self-stretch gap-1">
            <div className="flex items-center">
              {isGuestSession && isNarrowScreen && (
                <span className="mr-2 rounded-full bg-yellow-300 px-2 py-0.5 text-xs font-semibold text-slate-900">
                  Guest
                </span>
              )}
              <CharacterSelector />
            </div>
            <button
              type="button"
              className="flex items-center justify-center rounded-lg border border-transparent px-6 py-[15px] text-sm text-white transition-colors bg-[#8B5523] hover:bg-[#6E1414] hover:border-[#F5F0E8]"
            >
              ISSUES
            </button>
          </div>
        )}

        {/* Right column: LoadSaveFile + Logout + DatePicker — desktop only */}
        {showAuthenticatedNav && (
          <div className="hidden md:flex flex-none flex-col items-end justify-between gap-1 self-stretch">
            <div className="flex items-center gap-5 pb-1">
              {isGuestSession && (
                <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-semibold text-slate-900">
                  Guest mode
                </span>
              )}
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
        )}

      </div>

      {/* Hamburger dropdown */}
      {menuOpen && showHamburgerButton && showAuthenticatedNav && (
        <div className="border-t border-slate-900/40 dark:border-slate-800">
          <div className="mx-auto flex w-full max-w-5xl xl:max-w-6xl 2xl:max-w-[1400px] 3xl:max-w-[1800px] 4xl:max-w-[2300px] flex-col gap-1 px-4 md:px-8 py-3">

            {/* Nav links — always in dropdown */}
            <nav className="flex flex-col gap-1">
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

            {/* Mobile-only controls: Load Files, Date Picker, Logout */}
            {isNarrowScreen && (
              <>
                <div className="my-2 border-t border-slate-600" />
                <div className="px-2 pb-1">
                  <LoadSaveFile />
                </div>
                <div className="px-2 pb-1">
                  <DatePicker />
                </div>
                <button
                  onClick={handleLogout}
                  className="rounded-lg px-5 py-3 text-lg text-left text-slate-200 transition-colors hover:bg-slate-600 hover:text-white"
                >
                  Logout
                </button>
              </>
            )}

          </div>
        </div>
      )}
    </header>
  );
}
