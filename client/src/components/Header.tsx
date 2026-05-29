import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CharacterSelector from './CharacterSelector';
import DatePicker from './DatePicker';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/events', label: 'Events' },
  { to: '/forageables', label: 'Forageables' },
  { to: '/critters', label: 'Critters' },
  { to: '/quests', label: 'Quests' },
];

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/40 bg-slate-700 shadow-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-8 py-4">
        <NavLink to={user ? '/dashboard' : '/'} className="mr-6 flex items-center">
          <img src="/grimshire-logo.png" alt="Grimshire" className="h-20 w-auto" />
        </NavLink>
        
        {user && (
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
              <DatePicker />
              <CharacterSelector />
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
