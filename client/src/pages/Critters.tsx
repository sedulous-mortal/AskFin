import { useEffect, useState } from 'react';
import { fetchCritters, type Critter } from '../api/critters';
import { CUSTOM_CRITTER_FOODS } from '../data/critterCustomFoods';
import { useDate } from '../context/DateContext';
import { daysRemainingInRange } from '../utils/seasonalRange';

export default function Critters() {
  const [critters, setCritters] = useState<Critter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  // Group subtypes by critterType, preserving DB order (critter_type asc, subtype asc)
  const grouped = critters.reduce<Map<string, Critter[]>>((acc, c) => {
    const group = acc.get(c.critterType) ?? [];
    acc.set(c.critterType, [...group, c]);
    return acc;
  }, new Map());

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900">Critters</h1>
        <p className="mt-2 text-lg text-slate-700">
          Field notes on the tameable creatures of Grimshire.
        </p>
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
        <div className="rounded-2xl border border-slate-900/10 bg-white p-6">
          <p className="text-slate-700">No critters found yet.</p>
        </div>
      )}

      {!loading && !error && critters.length > 0 && (
        <div className="space-y-6">
          {[...grouped.entries()].map(([critterType, variants]) => (
            <section
              key={critterType}
              className="overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {/*
                6 subgrid rows: sprite | name | tame-with | habitat | active | description
                On lg+ each article spans all 6 rows and uses subgrid so every section
                aligns horizontally across all columns regardless of name wrap.
              */}
              <div className="grid grid-cols-1 divide-y divide-slate-900/10 pt-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:grid-rows-[auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0">
                {variants.map((variant) => {
                  const isActive = daysRemainingInRange(variant.activeAt, getCurrentDateString()) > 0;
                  const bg = `transition-colors duration-200${isActive ? ' bg-yellow-50' : ''}`;
                  const foods = [...variant.foods, ...CUSTOM_CRITTER_FOODS];

                  return (
                    <article key={variant.id} className="flex flex-col lg:grid lg:grid-rows-subgrid lg:row-span-6">

                      {/* Row 1: Sprite — never highlighted */}
                      <div className="flex h-36 items-center justify-center overflow-hidden px-6 pt-6">
                        <img
                          src={variant.image}
                          alt={`${variant.subtype} ${variant.critterType}`}
                          className={`rounded-lg object-contain ${variant.critterType === 'Bluggy' ? 'max-h-[72px] max-w-[90px]' : 'max-h-full max-w-[180px]'}`}
                        />
                      </div>

                      {/* Row 2: Name */}
                      <div className={`px-6 pt-3 ${bg}`}>
                        <h2 className="font-bold text-slate-900">
                          {variant.subtype} {variant.critterType}
                        </h2>
                      </div>

                      {/* Row 3: Tame With */}
                      <div className={`px-6 pt-4 ${bg}`}>
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">Tame With</dt>
                        <dd className="mt-1 text-slate-800">
                          {foods.length === 0 ? (
                            <span className="italic text-slate-400">None listed</span>
                          ) : (
                            <ul className="space-y-1">
                              {foods.map((food, i) => (
                                <li key={i} className="flex items-center gap-2">
                                  {food.image && (
                                    <img
                                      src={food.image}
                                      alt={food.name}
                                      className="h-9 w-9 flex-shrink-0 rounded object-contain"
                                    />
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
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">Habitat</dt>
                        <dd className="mt-1 text-slate-800">{variant.habitat}</dd>
                      </div>

                      {/* Row 5: Active */}
                      <div className={`px-6 pt-4 ${bg}`}>
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">Active</dt>
                        <dd className="mt-1 text-slate-800">
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
                        <p className="text-sm italic text-slate-700">{variant.description}</p>
                      </div>

                    </article>
                  );
                })}
              </div>

            </section>
          ))}
        </div>
      )}
    </div>
  );
}
