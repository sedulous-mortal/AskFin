import { useEffect, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useSettings } from '../context/SettingsContext';
import { SpoilerGate } from '../components/SpoilerGate';
import { PageToggle } from '../components/PageToggle';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'] as const;
const SEASON_IDX: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };

type Forageable = {
  id: number;
  name: string;
  image: string | null;
  start_season: number;
  start_day: number;
  end_season: number;
  end_day: number;
  locations: string[];
  type: string;
};

type UpcomingForageable = Forageable & { days_until: number };

type ForageablesResponse = {
  available: Forageable[];
  upcoming: UpcomingForageable[];
};

const LOCATION_CHIP_CLASSES: Record<string, string> = {
  'Marsh':      'bg-teal-600      text-slate-100  dark:bg-teal-900/30   dark:text-teal-300',
  'Deep Woods': 'bg-green-800     text-slate-100  dark:bg-green-900/30  dark:text-green-300',
  'Forest':     'bg-[#5c9a30]    text-slate-100  dark:bg-lime-900/30   dark:text-lime-400',
  'Mountains':  'bg-blue-900      text-slate-100  dark:bg-sky-900/30    dark:text-sky-300',
  'Farm':       'bg-yellow-600    text-slate-100  dark:bg-amber-900/30  dark:text-amber-400',
  'Town':       'bg-slate-500     text-slate-100  dark:bg-slate-700/50  dark:text-slate-300',
};
const DEFAULT_CHIP = 'bg-slate-500 text-slate-100 dark:bg-slate-700/50 dark:text-slate-300';

// Treemap type colours
const TYPE_BG: Record<string, string> = {
  Berry:    'bg-rose-500',
  Flower:   'bg-violet-500',
  Fruit:    'bg-orange-500',
  Herb:     'bg-emerald-600',
  Mushroom: 'bg-stone-500',
  Nut:      'bg-yellow-700',
  Root:     'bg-amber-600',
  Seed:     'bg-lime-700',
};

function LocationChips({ locations }: { locations: string[] }) {
  if (!locations || locations.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {locations.map((loc) => (
        <span
          key={loc}
          className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${LOCATION_CHIP_CLASSES[loc] ?? DEFAULT_CHIP}`}
        >
          {loc}
        </span>
      ))}
    </div>
  );
}

function ForageableCard({ item }: { item: Forageable }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {item.image ? (
        <img src={item.image} alt={item.name} className="h-10 w-10 flex-none rounded object-contain" />
      ) : (
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded bg-slate-100 text-lg dark:bg-slate-700">🌿</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{item.name}</p>
        <p className="text-sm text-slate-600 dark:text-slate-500">
          {SEASON_NAMES[item.start_season]} {item.start_day} – {SEASON_NAMES[item.end_season]} {item.end_day}
        </p>
      </div>
      <div className="flex-none">
        <LocationChips locations={item.locations} />
      </div>
    </div>
  );
}

function TypeFilterPills({ items, selectedView, onSelect }: {
  items: Forageable[];
  selectedView: string | null;
  onSelect: (view: string | null) => void;
}) {
  const typeCounts = items.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1;
    return acc;
  }, {});

  const types = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const somethingSelected = selectedView !== null;
  const allSelected = selectedView === 'all';

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500 dark:text-slate-400">Filter by type</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect(allSelected ? null : 'all')}
          style={{ background: 'linear-gradient(to right, #f43f5e, #a855f7, #3b82f6, #10b981, #f97316, #f59e0b)', textShadow: '0 0 4px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)' }}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-all ${
            somethingSelected && !allSelected ? 'opacity-35' : 'opacity-100'
          } ${allSelected ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ring-white shadow-md' : 'hover:brightness-110'}`}
        >
          All
          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-xs leading-none tabular-nums">
            {items.length}
          </span>
        </button>

        {types.map(([type, count]) => {
          const isSelected = selectedView === type;
          const isDimmed = somethingSelected && !isSelected;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(isSelected ? null : type)}
              style={{ textShadow: '0 0 4px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)' }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-all ${
                TYPE_BG[type] ?? 'bg-slate-500'
              } ${isDimmed ? 'opacity-35' : 'opacity-100'} ${
                isSelected
                  ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ring-current shadow-md'
                  : 'hover:brightness-110'
              }`}
            >
              {type}
              <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-xs leading-none tabular-nums">
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Forageables() {
  const { season, day } = useDate();
  const { preferences } = useSettings();
  const showForageables = preferences.spoilers.show_undiscovered_forageables;

  const [data, setData] = useState<ForageablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAll, setShowAll] = useState(false);
  const [allForageables, setAllForageables] = useState<Forageable[] | null>(null);
  const [allLoading, setAllLoading] = useState(false);
  // null = no list shown, 'all' = full list, string = type-filtered list
  const [selectedView, setSelectedView] = useState<null | 'all' | string>(null);

  const seasonIdx = SEASON_IDX[season] ?? 0;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/forageables?season=${seasonIdx}&day=${day}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load forageables (${r.status})`);
        return r.json();
      })
      .then((d: ForageablesResponse) => setData(d))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [seasonIdx, day]);

  const handleToggle = (val: boolean) => {
    setShowAll(val);
    if (!val) {
      setSelectedView(null);
    } else if (!allForageables) {
      setAllLoading(true);
      fetch(`${API_BASE}/api/forageables/all`)
        .then((r) => {
          if (!r.ok) throw new Error('Failed');
          return r.json();
        })
        .then((d: Forageable[]) => setAllForageables(d))
        .catch(() => {})
        .finally(() => setAllLoading(false));
    }
  };

  const listItems: Forageable[] = allForageables
    ? selectedView === 'all'
      ? allForageables
      : selectedView
        ? allForageables.filter((f) => f.type === selectedView)
        : []
    : [];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Forageables</h1>
          {showAll ? (
            <p className="mt-2 text-lg text-slate-700 dark:text-slate-300">
              Browse all forageable items by type.
            </p>
          ) : (
            <>
              <p className="mt-2 text-lg text-slate-700 dark:text-slate-300">
                Items you can forage in the wild on{' '}
                <span className="font-semibold">{season} {day}</span>.
              </p>
              <div className="mt-3 inline-block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-900/20">
                <p className="text-base font-medium text-slate-700 dark:text-slate-200">
                  A{' '}
                  <span className="mx-1 inline-flex items-center rounded bg-yellow-600 px-2 py-1 text-sm font-medium text-slate-100 not-italic dark:bg-amber-900/30 dark:text-amber-400">Farm</span>
                  {' '}tag means this item can also be found on your farm. Pure farmable crops (not forageable in the wild) are not shown here.
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex-none pt-2">
          <PageToggle
            leftLabel="Only in season"
            rightLabel="All"
            value={showAll}
            onChange={handleToggle}
          />
        </div>
      </header>

      {/* ── ONLY IN SEASON mode ─────────────────────────────────────────────── */}
      {!showAll && (
        loading ? (
          <p className="text-slate-600 dark:text-slate-400">Loading forageables...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : !showForageables ? (
          <SpoilerGate label="Forageable details" />
        ) : (
          <>
            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-200">
                Available now
                {data && (
                  <span className="ml-2 text-base font-normal text-slate-500">
                    ({data.available.length} item{data.available.length !== 1 ? 's' : ''})
                  </span>
                )}
              </h2>
              {data?.available.length === 0 ? (
                <p className="text-slate-500">Nothing is in season right now.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data?.available.map((item) => (
                    <ForageableCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>

            {data && data.upcoming.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-200">Coming up next</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {data.upcoming.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="h-10 w-10 flex-none rounded object-contain opacity-60" />
                      ) : (
                        <div className="flex h-10 w-10 flex-none items-center justify-center rounded bg-slate-200 text-lg opacity-60 dark:bg-slate-700">🌿</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-slate-700 dark:text-slate-300">{item.name}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-500">
                          In {item.days_until} day{item.days_until !== 1 ? 's' : ''} —{' '}
                          {SEASON_NAMES[item.start_season]} {item.start_day}
                        </p>
                      </div>
                      <div className="flex-none">
                        <LocationChips locations={item.locations} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )
      )}

      {/* ── ALL mode ─────────────────────────────────────────────────────────── */}
      {showAll && (
        allLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-amber-500" />
          </div>
        ) : allForageables ? (
          <div className="space-y-4">
            <TypeFilterPills
              items={allForageables}
              selectedView={selectedView}
              onSelect={setSelectedView}
            />

            {/* List — only shown when something is selected */}
            {selectedView && (
              <section>
                <h2 className="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-200">
                  {selectedView === 'all' ? 'All Forageables' : selectedView}
                  <span className="ml-2 text-base font-normal text-slate-500">
                    ({listItems.length} item{listItems.length !== 1 ? 's' : ''})
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {listItems.map((item) => (
                    <ForageableCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null
      )}
    </div>
  );
}
