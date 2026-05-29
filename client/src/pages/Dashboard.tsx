type Stat = {
  label: string;
  value: string;
  hint: string;
  accent: string;
};

type Tally = {
  name: string;
  count: number;
  rarity: 'Common' | 'Uncommon' | 'Rare';
};

const stats: Stat[] = [
  { label: 'Forageables found', value: '24', hint: '+3 this week', accent: 'text-emerald-700' },
  { label: 'Critters caught', value: '12', hint: '+1 this week', accent: 'text-amber-700' },
  { label: 'Quests completed', value: '7', hint: '2 in progress', accent: 'text-sky-700' },
  { label: 'Events attended', value: '3', hint: 'Next: Sat', accent: 'text-rose-700' },
];

const forageables: Tally[] = [
  { name: 'Plum', count: 8, rarity: 'Common' },
  { name: 'Ramps', count: 5, rarity: 'Uncommon' },
  { name: 'Morel', count: 3, rarity: 'Rare' },
  { name: 'Fiddleheads', count: 6, rarity: 'Common' },
  { name: 'Pawpaw', count: 2, rarity: 'Rare' },
];

const critters: Tally[] = [
  { name: 'Bluggy', count: 4, rarity: 'Common' },
  { name: 'Alpheep', count: 3, rarity: 'Uncommon' },
  { name: 'Snorblet', count: 2, rarity: 'Uncommon' },
  { name: 'Glimwren', count: 2, rarity: 'Rare' },
  { name: 'Mossback', count: 1, rarity: 'Rare' },
];

const rarityStyles: Record<Tally['rarity'], string> = {
  Common: 'bg-stone-100 text-stone-700',
  Uncommon: 'bg-emerald-100 text-emerald-800',
  Rare: 'bg-amber-100 text-amber-800',
};

function TallyList({ title, items, icon }: { title: string; items: Tally[]; icon: string }) {
  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-center gap-2">
        <span aria-hidden className="text-2xl">{icon}</span>
        <h2 className="text-xl font-bold tracking-tight text-slate-800">{title}</h2>
      </header>
      <ul className="divide-y divide-stone-100">
        {items.map((item) => (
          <li key={item.name} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="text-base font-medium text-slate-800">{item.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rarityStyles[item.rarity]}`}>
                {item.rarity}
              </span>
            </div>
            <span className="text-lg font-bold tabular-nums text-slate-700">×{item.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-2 text-lg text-slate-600">
          A quick look at what you've gathered and spotted in the field.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{stat.label}</div>
            <div className={`mt-2 text-4xl font-bold tabular-nums ${stat.accent}`}>{stat.value}</div>
            <div className="mt-1 text-sm text-slate-500">{stat.hint}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TallyList title="Forageables attained" items={forageables} icon="🌱" />
        <TallyList title="Critters attained" items={critters} icon="🐾" />
      </section>
    </div>
  );
}
