import { useEffect, useState } from 'react';
import { fetchCritters, type Critter } from '../api/critters';
import { CUSTOM_CRITTER_FOODS } from '../data/critterCustomFoods';
import { useDate } from '../context/DateContext';
import { daysRemainingInRange } from '../utils/seasonalRange';
import { PageToggle } from '../components/PageToggle';

const SESSION_KEY = 'critters-show-all';

// Returns Tailwind classes for the single in-season card's grid container.
// All strings are written out fully so Tailwind's purge scanner keeps them.
// itemCount is passed so the 2×4 (8-item) case can use 12 explicit rows.
function seasonContainerClass(colCount: number, itemCount: number): string {
  const base = 'grid divide-y divide-slate-900/10 dark:divide-slate-700 pt-4';
  if (colCount === 1)
    return `${base} grid-cols-1`;
  if (colCount === 2)
    return `${base} grid-cols-1 sm:grid-cols-2 sm:grid-rows-[auto_auto_auto_auto_auto_auto] sm:divide-x sm:divide-y-0`;
  if (colCount === 3)
    return `${base} grid-cols-1 sm:grid-cols-3 sm:grid-rows-[auto_auto_auto_auto_auto_auto] sm:divide-x sm:divide-y-0`;
  if (colCount === 4 && itemCount === 8)
    // 2 rows × 4 cols: 12 explicit row tracks so subgrid aligns within each visual row
    return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0`;
  if (colCount === 4)
    return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0`;
  if (colCount === 5)
    return `${base} grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:grid-rows-[auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0`;
  // 6
  return `${base} grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:grid-rows-[auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0`;
}

function seasonArticleClass(colCount: number): string {
  if (colCount === 1) return 'flex flex-col';
  if (colCount <= 3) return 'flex flex-col sm:grid sm:grid-rows-subgrid sm:row-span-6';
  return 'flex flex-col lg:grid lg:grid-rows-subgrid lg:row-span-6';
}

export default function Critters() {
  const [critters, setCritters] = useState<Critter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true');
  const { getCurrentDateString } = useDate();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    fetchCritters(controller.signal)
      .then((data) => {
        if (!active) return;
        setCritters(data);
        setError('');
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error('Failed to load critters:', err);
        setError(err instanceof Error ? err.message : 'Failed to load critters.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const handleToggle = (val: boolean) => {
    setShowAll(val);
    sessionStorage.setItem(SESSION_KEY, val ? 'true' : 'false');
  };

  // Group subtypes by critterType, preserving DB order (critter_type asc, subtype asc)
  const grouped = critters.reduce<Map<string, Critter[]>>((acc, c) => {
    const group = acc.get(c.critterType) ?? [];
    acc.set(c.critterType, [...group, c]);
    return acc;
  }, new Map());

  const dateStr = getCurrentDateString();

  // Flat list of every active variant across all species (for ONLY IN SEASON mode)
  const activeVariants: Critter[] = [];
  for (const [, variants] of grouped) {
    for (const v of variants) {
      if (daysRemainingInRange(v.activeAt, dateStr) > 0) activeVariants.push(v);
    }
  }

  // 8 active critters → 2 rows of 4; otherwise cap at 6 columns
  const colCount = activeVariants.length === 8
    ? 4
    : Math.min(Math.max(activeVariants.length, 1), 6);

  function renderVariantCard(variant: Critter, articleClass: string, extraClass = '') {
    const isActive = daysRemainingInRange(variant.activeAt, dateStr) > 0;
    const bg = `transition-colors duration-200${isActive ? ' bg-yellow-50 dark:bg-teal-900/40' : ''}`;
    const imgBg = isActive
      ? 'bg-gradient-to-b from-white to-yellow-50 dark:from-slate-800 dark:to-teal-900/40'
      : '';
    const foods = [...variant.foods, ...CUSTOM_CRITTER_FOODS];

    return (
      <article key={variant.id} className={`${articleClass}${extraClass ? ` ${extraClass}` : ''}`}>
        {/* Row 1: Sprite */}
        <div className={`flex h-36 items-center justify-center overflow-hidden px-6 pt-6 transition-colors duration-200${imgBg ? ` ${imgBg}` : ''}`}>
          <img
            src={variant.image}
            alt={`${variant.subtype} ${variant.critterType}`}
            className={`rounded-lg object-contain ${variant.critterType === 'Bluggy' ? 'max-h-[72px] max-w-[90px]' : 'max-h-full max-w-[180px]'}`}
          />
        </div>

        {/* Row 2: Name */}
        <div className={`px-6 pt-3 ${bg}`}>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 [text-shadow:0_1px_3px_rgba(0,0,0,0.18)] dark:[text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">
            {variant.subtype} {variant.critterType}
          </h2>
        </div>

        {/* Row 3: Tame With */}
        <div className={`px-6 pt-4 ${bg}`}>
          <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tame With</dt>
          <dd className="mt-1 text-slate-800 dark:text-slate-200">
            {foods.length === 0 ? (
              <span className="italic text-slate-400 dark:text-slate-500">None listed</span>
            ) : (
              <ul className="space-y-1">
                {foods.map((food, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {food.image && (
                      <img src={food.image} alt={food.name} className="h-9 w-9 flex-shrink-0 rounded object-contain" />
                    )}
                    <span>{food.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        {/* Row 4: Habitat */}
        <div className={`px-6 pt-4 ${bg}`}>
          <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Habitat</dt>
          <dd className="mt-1 text-slate-800 dark:text-slate-200">{variant.habitat}</dd>
        </div>

        {/* Row 5: Active */}
        <div className={`px-6 pt-4 ${bg}`}>
          <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Active</dt>
          <dd className="mt-1 text-slate-800 dark:text-slate-200">
            {variant.activeAt.includes(' to ') ? (
              <>
                {variant.activeAt.split(' to ')[0]}
                <br />
                {'to ' + variant.activeAt.split(' to ')[1]}
              </>
            ) : variant.activeAt}
          </dd>
        </div>

        {/* Row 6: Description */}
        <div className={`px-6 pt-4 pb-6 ${bg}`}>
          <p className="text-sm italic text-slate-700 dark:text-white">{variant.description}</p>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Critters</h1>
          <p className="mt-2 text-lg text-slate-700 dark:text-slate-300">
            Field notes on the tameable creatures of Grimshire.
          </p>
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

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-700" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {!loading && !error && critters.length === 0 && (
        <div className="rounded-2xl border border-slate-900/10 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <p className="text-slate-700 dark:text-slate-300">No critters found yet.</p>
        </div>
      )}

      {!loading && !error && critters.length > 0 && (
        <>
          {/* ── ONLY IN SEASON: single unified card ─────────────────────────── */}
          {!showAll && (
            activeVariants.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-slate-600 dark:text-slate-400">No critters are currently in season.</p>
              </div>
            ) : (
              <section className="overflow-hidden rounded-2xl border border-slate-900/10 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                <div className={seasonContainerClass(colCount, activeVariants.length)}>
                  {activeVariants.map((v, i) =>
                    renderVariantCard(
                      v,
                      seasonArticleClass(colCount),
                      // Add a top border between the two visual rows in the 2×4 layout
                      activeVariants.length === 8 && i >= 4 ? 'lg:border-t lg:border-slate-900/10' : '',
                    )
                  )}
                </div>
              </section>
            )
          )}

          {/* ── ALL: original per-species section cards ──────────────────────── */}
          {showAll && (
            <div className="space-y-6">
              {[...grouped.entries()].map(([critterType, variants]) => (
                <section
                  key={critterType}
                  className="overflow-hidden rounded-2xl border border-slate-900/10 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="grid grid-cols-1 divide-y divide-slate-900/10 dark:divide-slate-700 pt-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:grid-rows-[auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0">
                    {variants.map((variant) =>
                      renderVariantCard(variant, 'flex flex-col lg:grid lg:grid-rows-subgrid lg:row-span-6')
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
