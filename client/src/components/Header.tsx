import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/events', label: 'Events' },
  { to: '/forageables', label: 'Forageables' },
  { to: '/critters', label: 'Critters' },
  { to: '/quests', label: 'Quests' },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/40 bg-slate-700 shadow-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-8 py-4">
        <NavLink to="/" className="mr-6 flex items-center">
          <img src="/grimshire-logo.png" alt="Grimshire" className="h-20 w-auto" />
        </NavLink>
        <div className="flex flex-1 items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
      </nav>
    </header>
  );
}
