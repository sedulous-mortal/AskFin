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
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-8 py-4">
        <RateLimitIndicator />
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

            <div className="flex items-center gap-4 ml-auto">
              {isGuestSession && (
                <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-semibold text-slate-900">
                  Guest mode
                </span>
              )}
              <DatePicker />
              <CharacterSelector />
              {showAuthenticatedNav && <LoadSaveFile />}
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
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
