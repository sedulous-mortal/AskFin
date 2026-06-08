import { useEffect, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useSettings } from '../context/SettingsContext';
import { SpoilerGate } from '../components/SpoilerGate';

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
};

type UpcomingForageable = Forageable & { days_until: number };

type ForageablesResponse = {
  available: Forageable[];
  upcoming: UpcomingForageable[];
};

function ForageableCard({ item }: { item: Forageable }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {item.image ? (
        <img src={item.image} alt={item.name} className="h-10 w-10 rounded object-contain" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-lg dark:bg-slate-700">🌿</div>
      )}
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.name}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {SEASON_NAMES[item.start_season]} {item.start_day} – {SEASON_NAMES[item.end_season]} {item.end_day}
        </p>
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

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Forageables</h1>
        <p className="mt-2 text-lg text-slate-700 dark:text-slate-300">
          Items you can forage in the wild on{' '}
          <span className="font-semibold">{season} {day}</span>.
        </p>
      </header>

      {loading ? (
        <p className="text-slate-600">Loading forageables...</p>
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
              <h2 className="mb-3 text-xl font-semibold text-slate-800">Coming up next</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {data.upcoming.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="h-10 w-10 rounded object-contain opacity-60" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-200 text-lg opacity-60 dark:bg-slate-700">🌿</div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        In {item.days_until} day{item.days_until !== 1 ? 's' : ''} —{' '}
                        {SEASON_NAMES[item.start_season]} {item.start_day}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
