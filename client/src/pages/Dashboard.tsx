import { useState, useEffect } from 'react';
import { useAuth, ResolvedItem, EdibleItem, CraftingRecipeItem, CookingRecipeItem } from '../context/AuthContext';
import { useSettings, SpoilerPreferences } from '../context/SettingsContext';
import { SpoilerGate } from '../components/SpoilerGate';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ── Fish habitat static data ──────────────────────────────────────────────────

const FISH_HABITAT: Record<number, string> = {
  28: 'River', 29: 'River', 30: 'Mere',
  182: 'River', 183: 'Lake', 184: 'River', 185: 'Lake', 186: 'Lake',
  187: 'Lake', 188: 'River', 189: 'Mere', 190: 'Marsh', 191: 'River',
  192: 'River', 193: 'Mere', 194: 'Lake', 195: 'Lake', 196: 'Lake',
  197: 'Marsh', 198: 'River', 199: 'Mere', 200: 'Coastal', 201: 'Marsh',
  202: 'River', 203: 'Coastal', 204: 'Coastal', 205: 'Lake', 206: 'River',
  207: 'River', 208: 'River', 209: 'River', 210: 'River', 211: 'Lake',
  212: 'Lake', 213: 'Mere', 214: 'Marsh', 215: 'Lake', 216: 'Lake',
  217: 'Lake', 218: 'River', 219: 'River', 220: 'Lake', 221: 'River',
  222: 'Lake', 223: 'River', 224: 'River', 225: 'Lake', 226: 'Lake',
  227: 'Coastal', 228: 'Coastal', 386: 'Lake', 387: 'Mere', 388: 'Coastal',
  389: 'Coastal', 390: 'Mere', 391: 'River', 392: 'River', 393: 'Coastal',
  394: 'Lake', 395: 'Mere', 480: 'Marsh', 481: 'Coastal', 482: 'Coastal',
  483: 'Any', 581: 'Any', 666: 'Marsh', 667: 'Marsh', 668: 'Coastal',
  669: 'Coastal', 670: 'Coastal', 671: 'Coastal', 672: 'Coastal',
  673: 'Marsh', 674: 'Any', 827: 'Any',
};

const HABITAT_ORDER = ['River', 'Lake', 'Coastal', 'Marsh', 'Mere', 'Any'] as const;

const HABITAT_COLORS: Record<string, string> = {
  River:   '#38bdf8', // sky-400 — existing fish accent
  Lake:    '#1d4ed8', // blue-700 — deep blue
  Coastal: '#0ea5e9', // sky-500 — medium sky
  Marsh:   '#0369a1', // sky-700 — dark blue
  Mere:    '#60a5fa', // blue-400 — lighter blue
  Any:     '#3b82f6', // blue-500 — standard blue
};

// ── Simple donut (discovered vs total) ───────────────────────────────────────

function DonutChart({
  discovered,
  total,
  color,
  onDiscoveredClick,
  onUndiscoveredClick,
}: {
  discovered: number;
  total: number | null;
  color: string;
  onDiscoveredClick: () => void;
  onUndiscoveredClick?: () => void;
}) {
  const r = 38;
  const cx = 50;
  const cy = 50;
  const circ = 2 * Math.PI * r;
  const rawArc = total !== null ? Math.min(discovered / total, 1) * circ
    : discovered > 0 ? circ * 0.45
    : 0;
  // Keep at least 3% gap so the undiscovered track is always visible
  const isPartial = total !== null && discovered > 0 && discovered < total;
  const discoveredArc = isPartial ? Math.min(rawArc, circ * 0.97) : rawArc;

  return (
    <svg viewBox="0 0 100 100" className="w-36 h-36 shrink-0"
      aria-label={`${discovered} of ${total ?? '?'} discovered`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--chart-track)" strokeWidth="11"
        className={onUndiscoveredClick ? 'cursor-pointer' : ''}
        onClick={onUndiscoveredClick} />
      {discovered > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="11"
          strokeDasharray={`${discoveredArc} ${circ}`}
          strokeDashoffset={0}
          strokeLinecap="butt"
          transform="rotate(-90 50 50)"
          style={{ stroke: color }}
          className="cursor-pointer transition-opacity hover:opacity-80"
          onClick={onDiscoveredClick} />
      )}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor" className="text-slate-900 dark:text-slate-100">
        {discovered}
      </text>
      {total != null && (
        <text x={cx} y={cy + 19} textAnchor="middle" fontSize="11" fill="currentColor" className="text-slate-500 dark:text-slate-400">
          of {total}
        </text>
      )}
    </svg>
  );
}

// ── Multi-segment donut (forageable / farmable / both / undiscovered) ─────────

type EdibleSegment = { label: string; count: number; color: string; onClick: (e: React.MouseEvent) => void };

function MultiDonutChart({
  segments,
  total,
  onUndiscoveredClick,
  centerCount,
}: {
  segments: EdibleSegment[];
  total: number;
  onUndiscoveredClick: () => void;
  centerCount?: number;
}) {
  const r = 38;
  const cx = 50;
  const cy = 50;
  const strokeW = 11;

  const totalDiscovered = segments.reduce((s, seg) => s + seg.count, 0);
  const displayCount = centerCount ?? totalDiscovered;

  function polarToXY(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(startDeg: number, endDeg: number) {
    const s = polarToXY(startDeg);
    const e = polarToXY(endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  let startDeg = 0;
  const arcs = segments
    .filter((seg) => seg.count > 0 && total > 0)
    .map((seg) => {
      const spanDeg = (seg.count / total) * 360;
      const endDeg = startDeg + spanDeg;
      const d = arcPath(startDeg, endDeg);
      startDeg = endDeg;
      return { ...seg, d };
    });

  return (
    <svg viewBox="0 0 100 100" className="w-36 h-36 shrink-0"
      aria-label={`${totalDiscovered} of ${total} edibles discovered`}>
      {/* Gray track — clicking uncovered area = undiscovered drilldown */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={strokeW}
        className="cursor-pointer"
        onClick={onUndiscoveredClick} />
      {/* Colored arc paths share exact endpoints — no dashoffset gaps */}
      {arcs.map((seg, i) => (
        <path key={i}
          d={seg.d}
          fill="none"
          stroke={seg.color}
          strokeWidth={strokeW}
          strokeLinecap="butt"
          className="cursor-pointer transition-opacity hover:opacity-80"
          onClick={seg.onClick}
        />
      ))}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor" className="text-slate-900 dark:text-slate-100">
        {displayCount}
      </text>
      <text x={cx} y={cy + 19} textAnchor="middle" fontSize="11" fill="currentColor" className="text-slate-500 dark:text-slate-400">
        of {total}
      </text>
    </svg>
  );
}

// ── Item list (drilldown) ─────────────────────────────────────────────────────

function ItemGrid({ items }: { items: (ResolvedItem | EdibleItem)[] }) {
  const named = items.filter(i => i.name !== null);
  const unnamed = items.filter(i => i.name === null);
  return (
    <div>
      <ul className="columns-2 gap-x-6 sm:columns-3">
        {named.map(item => (
          <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-700 dark:text-slate-300">
            {item.name}
          </li>
        ))}
        {unnamed.map(item => (
          <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-400 italic dark:text-slate-500">
            ID {item.id}
          </li>
        ))}
      </ul>
      {named.length === 0 && unnamed.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nothing here.</p>
      )}
    </div>
  );
}

// ── Cooking pan SVG icon ──────────────────────────────────────────────────────

function CookingPanIcon() {
  return (
    <svg width="64" height="64" viewBox="0 12 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cookYolk" cx="38%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#fef08a" />
          <stop offset="45%"  stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>
        <mask id="handleHole">
          <rect x="78" y="43" width="30" height="18" rx="9" fill="white" />
          <circle cx="101" cy="52" r="3.6" fill="black" />
        </mask>
      </defs>
      {/* Handle — rotated lower-right (behind pan rim), transparent hanging hole at tip */}
      <g transform="translate(46,52) rotate(45) translate(-46,-52)">
        <rect x="78" y="43" width="30" height="18" rx="9" fill="#be185d" mask="url(#handleHole)" />
      </g>
      {/* Pan rim */}
      <circle cx="46" cy="52" r="36" fill="#be185d" />
      {/* Pan interior */}
      <circle cx="46" cy="52" r="28" fill="#1e293b" />
      {/* Egg white — organic blob */}
      <path
        d="M 46 34 C 56 31,65 38,65 49 C 65 59,60 68,50 70 C 41 72,29 66,27 56 C 25 46,30 34,40 32 C 42 31,44 32,46 34 Z"
        fill="#f1f5f9"
      />
      {/* Yolk */}
      <circle cx="46" cy="51" r="10" fill="url(#cookYolk)" />
      {/* Yolk shine — main */}
      <ellipse cx="41" cy="45.5" rx="3.5" ry="2.3" fill="rgba(255,255,255,0.72)" transform="rotate(-20 41 45.5)" />
      {/* Yolk shine — small */}
      <circle cx="48" cy="44" r="1.4" fill="rgba(255,255,255,0.42)" />
    </svg>
  );
}

// ── Shared unknown-category color ─────────────────────────────────────────────
const UNKNOWN_COLOR = '#94a3b8'; // slate-400

// ── Research Center constants ─────────────────────────────────────────────────
const SPECIMEN_CATEGORIES = ['fish', 'mineral', 'plant'] as const;
type SpecimenCategory = typeof SPECIMEN_CATEGORIES[number];
const SPECIMEN_LABELS: Record<SpecimenCategory, string> = { fish: 'Fish', mineral: 'Minerals', plant: 'Plants' };
const SPECIMEN_COLORS: Record<SpecimenCategory, string> = { fish: '#38bdf8', mineral: '#d97706', plant: '#16a34a' };
const SPECIMEN_ICONS: Record<SpecimenCategory, string> = { fish: '🐟', mineral: '💎', plant: '🌿' };

// ── Cooking recipe section (grouped by diet) ─────────────────────────────────

const DIET_ORDER = ['carnivore', 'herbivore', 'omnivore'] as const;
const DIET_LABEL: Record<string, string> = { carnivore: 'Carnivore', herbivore: 'Herbivore', omnivore: 'Omnivore' };
const DIET_COLORS: Record<string, string> = { carnivore: '#dc2626', herbivore: '#16a34a', omnivore: '#9333ea' };

type CookingView = 'chart' | 'discovered' | 'undiscovered' | 'unknown_diet' | typeof DIET_ORDER[number];

function CookingRecipeSection({
  discovered, undiscovered, spoilerKey,
}: {
  discovered: CookingRecipeItem[];
  undiscovered: CookingRecipeItem[];
  spoilerKey?: keyof SpoilerPreferences;
}) {
  const [view, setView] = useState<CookingView>('chart');
  const [groupByDiet, setGroupByDiet] = useState(false);
  const { preferences } = useSettings();
  const spoilerAllowed = spoilerKey ? preferences.spoilers[spoilerKey] : true;
  // Dynamic total: discovered + what's in our JSON but not yet found (catches recipes outside our JSON too)
  const total = discovered.length + undiscovered.length;
  const color = '#be185d';

  const unknownDiet = discovered.filter(i => !(DIET_ORDER as readonly (string | null)[]).includes(i.diet));

  if (view !== 'chart') {
    const isDietView = (DIET_ORDER as readonly string[]).includes(view);
    let items: CookingRecipeItem[];
    let label: string;
    if (isDietView) {
      items = discovered.filter(i => i.diet === view);
      label = `${DIET_LABEL[view]} Recipes`;
    } else if (view === 'unknown_diet') {
      items = unknownDiet;
      label = 'Unknown Diet Recipes';
    } else if (view === 'discovered') {
      items = discovered;
      label = 'Unlocked Cooking Recipes';
    } else {
      items = undiscovered;
      label = 'Not Yet Unlocked';
    }
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setView('chart')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200">
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-200">
            {label}
            {(view !== 'undiscovered' || spoilerAllowed) && (
              <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">({items.length})</span>
            )}
          </h2>
        </div>
        {view === 'undiscovered' && !spoilerAllowed ? (
          <SpoilerGate label="Undiscovered Cooking Recipes" />
        ) : isDietView || view === 'unknown_diet' ? (
          <ul className="columns-2 gap-x-6 sm:columns-3">
            {items.map(item => (
              <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-700 dark:text-slate-300">
                {item.name ?? `ID ${item.id}`}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-4">
            {DIET_ORDER.map(diet => {
              const group = items.filter(i => i.diet === diet);
              if (!group.length) return null;
              return (
                <div key={diet}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{DIET_LABEL[diet]}</p>
                  <ul className="columns-2 gap-x-6 sm:columns-3">
                    {group.map(item => (
                      <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-700 dark:text-slate-300">
                        {item.name ?? `ID ${item.id}`}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="relative rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 flex items-center">
      <span aria-hidden className="absolute top-4 right-5 select-none pointer-events-none"><CookingPanIcon /></span>
      <label className="absolute top-3 left-4 flex items-center gap-2.5 cursor-pointer z-10 select-none group">
        <input type="checkbox" checked={groupByDiet} onChange={e => setGroupByDiet(e.target.checked)} className="sr-only" />
        <span className={`relative flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${groupByDiet ? 'bg-pink-700' : 'bg-slate-300 dark:bg-slate-600'}`}>
          <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${groupByDiet ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </span>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
          Group by Diet
        </span>
      </label>
      <div className="grid grid-cols-3 items-center gap-6 w-full mt-5">
        <div className="flex items-center justify-center">
          {groupByDiet ? (
            <MultiDonutChart
              segments={[
                ...DIET_ORDER
                  .map(diet => ({
                    label: DIET_LABEL[diet],
                    count: discovered.filter(i => i.diet === diet).length,
                    color: DIET_COLORS[diet],
                    onClick: (e: React.MouseEvent) => { e.stopPropagation(); setView(diet); },
                  }))
                  .filter(seg => seg.count > 0),
                ...(unknownDiet.length > 0 ? [{
                  label: 'Unknown diet',
                  count: unknownDiet.length,
                  color: UNKNOWN_COLOR,
                  onClick: (e: React.MouseEvent) => { e.stopPropagation(); setView('unknown_diet'); },
                }] : []),
              ]}
              total={total}
              onUndiscoveredClick={() => setView('undiscovered')}
              centerCount={discovered.length}
            />
          ) : (
            <DonutChart discovered={discovered.length} total={total} color={color}
              onDiscoveredClick={() => setView('discovered')}
              onUndiscoveredClick={() => setView('undiscovered')} />
          )}
        </div>
        <div className="col-span-2 flex flex-col gap-3">
          <h2 className="text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-200">Cooking Recipes</h2>
          {groupByDiet ? (
            <>
              {DIET_ORDER.map(diet => {
                const count = discovered.filter(i => i.diet === diet).length;
                if (!count) return null;
                return (
                  <button key={diet} onClick={() => setView(diet)} className="flex items-center gap-2 text-left group">
                    <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DIET_COLORS[diet] }} />
                    <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                      <span className="font-semibold">{count}</span> {DIET_LABEL[diet].toLowerCase()}
                    </span>
                    <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
                  </button>
                );
              })}
              {unknownDiet.length > 0 && (
                <button onClick={() => setView('unknown_diet')} className="flex items-center gap-2 text-left group">
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: UNKNOWN_COLOR }} />
                  <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                    <span className="font-semibold">{unknownDiet.length}</span> unknown diet
                  </span>
                  <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
                </button>
              )}
              <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200 dark:bg-slate-600" />
                <span className="text-base text-slate-500 group-hover:text-slate-700 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
                  <span className="font-semibold">{undiscovered.length}</span> not yet unlocked
                </span>
                <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setView('discovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                  <span className="font-semibold">{discovered.length}</span> unlocked
                </span>
                <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
              </button>
              <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200 dark:bg-slate-600" />
                <span className="text-base text-slate-500 group-hover:text-slate-700 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
                  <span className="font-semibold">{undiscovered.length}</span> not yet unlocked
                </span>
                <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Crafting recipe section (grouped by category) ─────────────────────────────

const CRAFTING_CATEGORY_ORDER = ['Stations', 'Farming Items', 'Pathways', 'Fences & Gates', 'Flooring', 'Wallpapers', 'Furniture'] as const;
const CRAFTING_CATEGORY_COLORS: Record<string, string> = {
  'Stations':       '#be185d',
  'Farming Items':  '#16a34a',
  'Pathways':       '#ca8a04',
  'Fences & Gates': '#92400e',
  'Flooring':       '#0284c7',
  'Wallpapers':     '#7c3aed',
  'Furniture':      '#ea580c',
};

type CraftingView = 'chart' | 'discovered' | 'undiscovered' | 'unknown_type' | typeof CRAFTING_CATEGORY_ORDER[number];

function CraftingRecipeSection({
  discovered, undiscovered, spoilerKey,
}: {
  discovered: CraftingRecipeItem[];
  undiscovered: CraftingRecipeItem[];
  spoilerKey?: keyof SpoilerPreferences;
}) {
  const [view, setView] = useState<CraftingView>('chart');
  const [groupByType, setGroupByType] = useState(false);
  const { preferences } = useSettings();
  const spoilerAllowed = spoilerKey ? preferences.spoilers[spoilerKey] : true;
  const total = 171;
  const color = 'var(--crafting-color)';

  const unknownCategory = discovered.filter(i => !(CRAFTING_CATEGORY_ORDER as readonly (string | null)[]).includes(i.category));

  if (view !== 'chart') {
    const isCategoryView = (CRAFTING_CATEGORY_ORDER as readonly string[]).includes(view);
    let items: CraftingRecipeItem[];
    let label: string;
    if (isCategoryView) {
      items = discovered.filter(i => i.category === view);
      label = view;
    } else if (view === 'unknown_type') {
      items = unknownCategory;
      label = 'Unknown Type Blueprints';
    } else if (view === 'discovered') {
      items = discovered;
      label = 'Unlocked Crafting Blueprints';
    } else {
      items = undiscovered;
      label = 'Locked Crafting Blueprints';
    }
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setView('chart')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200">
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-200">
            {label}
            {(view !== 'undiscovered' || spoilerAllowed) && (
              <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">({items.length})</span>
            )}
          </h2>
        </div>
        {view === 'undiscovered' && !spoilerAllowed ? (
          <SpoilerGate label="Locked Crafting Blueprints" />
        ) : isCategoryView || view === 'unknown_type' ? (
          <ul className="columns-2 gap-x-6 sm:columns-3">
            {items.map(item => (
              <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-700 dark:text-slate-300">
                {item.name ?? `ID ${item.id}`}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-4">
            {CRAFTING_CATEGORY_ORDER.map(cat => {
              const group = items.filter(i => i.category === cat);
              if (!group.length) return null;
              return (
                <div key={cat}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{cat}</p>
                  <ul className="columns-2 gap-x-6 sm:columns-3">
                    {group.map(item => (
                      <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-700 dark:text-slate-300">
                        {item.name ?? `ID ${item.id}`}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="relative rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 flex items-center">
      <span aria-hidden className="absolute top-5 right-5 text-5xl select-none pointer-events-none">🔨</span>
      <label className="absolute top-3 left-4 flex items-center gap-2.5 cursor-pointer z-10 select-none group">
        <input type="checkbox" checked={groupByType} onChange={e => setGroupByType(e.target.checked)} className="sr-only" />
        <span className={`relative flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${groupByType ? 'bg-slate-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
          <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${groupByType ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </span>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
          Group by Type
        </span>
      </label>
      <div className="grid grid-cols-3 items-center gap-6 w-full mt-5">
        <div className="flex items-center justify-center">
          {groupByType ? (
            <MultiDonutChart
              segments={[
                ...CRAFTING_CATEGORY_ORDER
                  .map(cat => ({
                    label: cat,
                    count: discovered.filter(i => i.category === cat).length,
                    color: CRAFTING_CATEGORY_COLORS[cat],
                    onClick: (e: React.MouseEvent) => { e.stopPropagation(); setView(cat); },
                  }))
                  .filter(seg => seg.count > 0),
                ...(unknownCategory.length > 0 ? [{
                  label: 'Unknown type',
                  count: unknownCategory.length,
                  color: UNKNOWN_COLOR,
                  onClick: (e: React.MouseEvent) => { e.stopPropagation(); setView('unknown_type'); },
                }] : []),
              ]}
              total={total}
              onUndiscoveredClick={() => setView('undiscovered')}
              centerCount={discovered.length}
            />
          ) : (
            <DonutChart discovered={discovered.length} total={total} color={color}
              onDiscoveredClick={() => setView('discovered')}
              onUndiscoveredClick={() => setView('undiscovered')} />
          )}
        </div>
        <div className="col-span-2 flex flex-col gap-3">
          <h2 className="text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-200">Crafting Recipes</h2>
          {groupByType ? (
            <>
              {CRAFTING_CATEGORY_ORDER.map(cat => {
                const count = discovered.filter(i => i.category === cat).length;
                if (!count) return null;
                return (
                  <button key={cat} onClick={() => setView(cat)} className="flex items-center gap-2 text-left group">
                    <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CRAFTING_CATEGORY_COLORS[cat] }} />
                    <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                      <span className="font-semibold">{count}</span> {cat.toLowerCase()}
                    </span>
                    <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
                  </button>
                );
              })}
              {unknownCategory.length > 0 && (
                <button onClick={() => setView('unknown_type')} className="flex items-center gap-2 text-left group">
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: UNKNOWN_COLOR }} />
                  <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                    <span className="font-semibold">{unknownCategory.length}</span> unknown type
                  </span>
                  <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
                </button>
              )}
              <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200 dark:bg-slate-600" />
                <span className="text-base text-slate-500 group-hover:text-slate-700 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
                  <span className="font-semibold">{undiscovered.length}</span> not yet unlocked
                </span>
                <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setView('discovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                  <span className="font-semibold">{discovered.length}</span> unlocked
                </span>
                <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
              </button>
              <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200 dark:bg-slate-600" />
                <span className="text-base text-slate-500 group-hover:text-slate-700 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
                  <span className="font-semibold">{undiscovered.length}</span> not yet unlocked
                </span>
                <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500">›</span>
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Fish section (with Split by Area) ────────────────────────────────────────

type FishDrillView = 'chart' | 'discovered' | 'undiscovered' | 'unknown_area' | typeof HABITAT_ORDER[number];

function FishSection({
  discovered, undiscovered, total, spoilerKey,
}: {
  discovered: ResolvedItem[];
  undiscovered: ResolvedItem[] | null;
  total: number | null;
  spoilerKey?: keyof SpoilerPreferences;
}) {
  const [view, setView] = useState<FishDrillView>('chart');
  const [splitByArea, setSplitByArea] = useState(false);
  const { preferences } = useSettings();
  const spoilerAllowed = spoilerKey ? preferences.spoilers[spoilerKey] : true;
  const color = 'var(--fish-accent)';

  // null = ID not in our habitat map (unknown area); explicit 'Any' = catchable anywhere
  const habitatOf = (id: number): string | null => FISH_HABITAT[id] ?? null;
  const byHabitat = Object.fromEntries(
    HABITAT_ORDER.map(h => [h, discovered.filter(f => habitatOf(f.id) === h)])
  ) as Record<string, ResolvedItem[]>;
  const unknownArea = discovered.filter(f => habitatOf(f.id) === null);

  const habitatSegments = HABITAT_ORDER
    .filter(h => byHabitat[h].length > 0)
    .map(h => ({
      label: h,
      count: byHabitat[h].length,
      color: HABITAT_COLORS[h],
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); setView(h); },
    }));

  const habitatSegmentsByCount = [...habitatSegments].sort((a, b) => b.count - a.count);

  // Drilldown view
  if (view !== 'chart') {
    const isHabitatView = (HABITAT_ORDER as readonly string[]).includes(view);
    const isUndiscoveredUnknown = view === 'undiscovered' && undiscovered === null;

    let items: ResolvedItem[];
    let label: string;
    if (isHabitatView) {
      items = byHabitat[view] ?? [];
      label = `${view} Fish`;
    } else if (view === 'unknown_area') {
      items = unknownArea;
      label = 'Unknown Area Fish';
    } else if (view === 'discovered') {
      items = discovered;
      label = 'Discovered Fish';
    } else {
      items = undiscovered ?? [];
      label = 'Undiscovered Fish';
    }

    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setView('chart')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200">
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-200">
            <span aria-hidden className="mr-1">🐟</span>
            {label}
            {!isUndiscoveredUnknown && (spoilerAllowed || view !== 'undiscovered') && (
              <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">({items.length})</span>
            )}
          </h2>
        </div>
        {view === 'undiscovered' && !spoilerAllowed ? (
          <SpoilerGate label="Undiscovered Fish" />
        ) : isUndiscoveredUnknown ? (
          <p className="text-sm text-slate-500">
            We don't have the full list of fish in the game yet, so we can't show which ones are undiscovered.
          </p>
        ) : (
          <ItemGrid items={items} />
        )}
      </section>
    );
  }

  const undiscoveredCount = undiscovered !== null ? undiscovered.length : null;

  return (
    <section className="relative rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 flex items-center">
      <span aria-hidden className="absolute top-4 right-5 text-[2.5rem] select-none pointer-events-none">🐟</span>
      <label className="absolute top-3 left-4 flex items-center gap-2.5 cursor-pointer z-10 select-none group">
        <input type="checkbox" checked={splitByArea} onChange={e => setSplitByArea(e.target.checked)} className="sr-only" />
        <span className={`relative flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${splitByArea ? 'bg-sky-400' : 'bg-slate-300 dark:bg-slate-600'}`}>
          <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${splitByArea ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </span>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
          Split by Area
        </span>
      </label>
      <div className="grid grid-cols-3 items-center gap-6 w-full mt-5">
        <div className="flex items-center justify-center">
          {splitByArea ? (
            <MultiDonutChart
              segments={[
                ...habitatSegments,
                ...(unknownArea.length > 0 ? [{
                  label: 'Unknown area',
                  count: unknownArea.length,
                  color: UNKNOWN_COLOR,
                  onClick: (e: React.MouseEvent) => { e.stopPropagation(); setView('unknown_area'); },
                }] : []),
              ]}
              total={total ?? discovered.length}
              onUndiscoveredClick={() => setView('undiscovered')}
              centerCount={discovered.length}
            />
          ) : (
            <DonutChart
              discovered={discovered.length}
              total={total}
              color={color}
              onDiscoveredClick={() => setView('discovered')}
              onUndiscoveredClick={() => setView('undiscovered')}
            />
          )}
        </div>
        <div className="col-span-2 flex flex-col gap-3">
          <h2 className="text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-200">
            Fish
          </h2>
          {splitByArea ? (
            <>
              {habitatSegmentsByCount.map(seg => (
                <button key={seg.label} onClick={() => setView(seg.label as FishDrillView)}
                  className="flex items-center gap-2 text-left group">
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                    <span className="font-semibold">{seg.count}</span> {seg.label.toLowerCase()}
                  </span>
                </button>
              ))}
              {unknownArea.length > 0 && (
                <button onClick={() => setView('unknown_area')} className="flex items-center gap-2 text-left group">
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: UNKNOWN_COLOR }} />
                  <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                    <span className="font-semibold">{unknownArea.length}</span> unknown area
                  </span>
                </button>
              )}
              <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200 dark:bg-slate-600" />
                <span className="text-base text-slate-500 group-hover:text-slate-700 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
                  {undiscovered !== null
                    ? <><span className="font-semibold">{undiscoveredCount}</span> undiscovered</>
                    : <span className="italic">undiscovered (total unknown)</span>
                  }
                </span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setView('discovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                  <span className="font-semibold">{discovered.length}</span> discovered
                </span>
              </button>
              <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200 dark:bg-slate-600" />
                <span className="text-base text-slate-500 group-hover:text-slate-700 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
                  {undiscovered !== null
                    ? <><span className="font-semibold">{undiscoveredCount}</span> undiscovered</>
                    : <span className="italic">undiscovered (total unknown)</span>
                  }
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Edibles section ───────────────────────────────────────────────────────────

type EdibleDrillView = 'chart' | 'discovered' | 'forageable' | 'farmable' | 'both' | 'undiscovered' | 'unknown_source';

const EDIBLE_COLORS = {
  forageable: '#16a34a',
  farmable:   '#d97706',
  both:       '#a78bfa',
} as const;

const EDIBLE_LABELS = {
  forageable:   'Forageable',
  farmable:     'Farmable',
  both:         'Forageable & Farmable',
  undiscovered: 'Undiscovered',
} as const;

function EdiblesSection({
  discovered,
  undiscovered,
  total,
}: {
  discovered: EdibleItem[];
  undiscovered: EdibleItem[];
  total: number;
}) {
  const [view, setView] = useState<EdibleDrillView>('chart');
  const [splitByType, setSplitByType] = useState(false);
  const { preferences } = useSettings();
  const spoilerAllowed = preferences.spoilers.show_undiscovered_items;

  const bySource = {
    forageable: discovered.filter(i => i.source === 'forageable'),
    farmable:   discovered.filter(i => i.source === 'farmable'),
    both:       discovered.filter(i => i.source === 'both'),
  };
  const unknownSource = discovered.filter(i => !(['forageable', 'farmable', 'both'] as string[]).includes(i.source));

  // Drilldown view
  if (view !== 'chart') {
    const isUndiscoveredView = view === 'undiscovered';
    const isDiscoveredView = view === 'discovered';
    const isUnknownView = view === 'unknown_source';
    const items = isUndiscoveredView ? undiscovered
      : isDiscoveredView ? discovered
      : isUnknownView ? unknownSource
      : bySource[view as keyof typeof bySource] ?? [];
    const label = isDiscoveredView ? 'Discovered'
      : isUndiscoveredView ? 'Undiscovered'
      : isUnknownView ? 'Unknown Type'
      : EDIBLE_LABELS[view as keyof typeof EDIBLE_LABELS];
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setView('chart')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200">
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-200">
            <span aria-hidden className="mr-1">🥬</span>
            {label} Edibles
            {(!isUndiscoveredView || spoilerAllowed) && (
              <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">({items.length})</span>
            )}
          </h2>
        </div>
        {isUndiscoveredView && !spoilerAllowed ? (
          <SpoilerGate label="Undiscovered Edibles" />
        ) : (
          <ItemGrid items={items} />
        )}
      </section>
    );
  }

  const segments: EdibleSegment[] = [
    { label: 'Forageable', count: bySource.forageable.length, color: EDIBLE_COLORS.forageable,
      onClick: (e) => { e.stopPropagation(); setView('forageable'); } },
    { label: 'Farmable',   count: bySource.farmable.length,   color: EDIBLE_COLORS.farmable,
      onClick: (e) => { e.stopPropagation(); setView('farmable'); } },
    { label: 'Forageable & Farmable', count: bySource.both.length, color: EDIBLE_COLORS.both,
      onClick: (e) => { e.stopPropagation(); setView('both'); } },
    ...(unknownSource.length > 0 ? [{ label: 'Unknown type', count: unknownSource.length, color: UNKNOWN_COLOR,
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); setView('unknown_source'); } }] : []),
  ];

  return (
    <section className="relative rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 flex items-center">
      <span aria-hidden className="absolute top-5 right-5 text-[2.25rem] select-none pointer-events-none">🥬</span>
      <label className="absolute top-3 left-4 flex items-center gap-2.5 cursor-pointer z-10 select-none group">
        <input type="checkbox" checked={splitByType} onChange={e => setSplitByType(e.target.checked)} className="sr-only" />
        <span className={`relative flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${splitByType ? '' : 'bg-slate-300 dark:bg-slate-600'}`} style={splitByType ? { backgroundColor: EDIBLE_COLORS.forageable } : undefined}>
          <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${splitByType ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </span>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
          Split by Type
        </span>
      </label>
      <div className="grid grid-cols-3 items-center gap-6 w-full mt-5">
        <div className="flex items-center justify-center">
          {splitByType ? (
            <MultiDonutChart segments={segments} total={total}
              onUndiscoveredClick={() => setView('undiscovered')}
              centerCount={discovered.length} />
          ) : (
            <DonutChart
              discovered={discovered.length}
              total={total}
              color={EDIBLE_COLORS.forageable}
              onDiscoveredClick={() => setView('discovered')}
              onUndiscoveredClick={() => setView('undiscovered')}
            />
          )}
        </div>
        <div className="col-span-2 flex flex-col gap-3">
          <h2 className="text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-200">
            Edibles
          </h2>
          {splitByType ? (
            <>
              {segments.filter(seg => seg.count > 0).map((seg) => (
                <button key={seg.label}
                  onClick={(e) => seg.onClick(e)}
                  className="flex items-center gap-2 text-left group">
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                    <span className="font-semibold">{seg.count}</span> {seg.label.toLowerCase()}
                  </span>
                </button>
              ))}
              <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200 dark:bg-slate-600" />
                <span className="text-base text-slate-500 group-hover:text-slate-700 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
                  <span className="font-semibold">{undiscovered.length}</span> undiscovered
                </span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setView('discovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: EDIBLE_COLORS.forageable }} />
                <span className="text-base text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-slate-100">
                  <span className="font-semibold">{discovered.length}</span> discovered
                </span>
              </button>
              <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
                <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200 dark:bg-slate-600" />
                <span className="text-base text-slate-500 group-hover:text-slate-700 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
                  <span className="font-semibold">{undiscovered.length}</span> undiscovered
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Research Center Crosscut ──────────────────────────────────────────────────

type MuseumItemLocal = { id: number; name: string | null; category: SpecimenCategory };
type CrosscutEntry = { donated: number[]; count: number; farm_name: string | null };
type CrosscutDrill =
  | { level: 'list' }
  | { level: 'character'; charId: string }
  | { level: 'category'; charId: string; category: SpecimenCategory };

function ResearchCenterCrosscut({
  characters,
  prefetchedDetail,
}: {
  characters: Array<{ id: string; character_name: string }>;
  prefetchedDetail?: { id: string; donated_museum_items: number[]; donated_specimen_count: number; farm_name: string | null } | null;
}) {
  const [museumItems, setMuseumItems] = useState<MuseumItemLocal[]>([]);
  const [charDataMap, setCharDataMap] = useState<Record<string, CrosscutEntry | 'loading' | 'error'>>({});
  const [globalLoading, setGlobalLoading] = useState(true);
  const [drill, setDrill] = useState<CrosscutDrill>({ level: 'list' });

  const charIdsKey = characters.map(c => c.id).join(',');

  useEffect(() => {
    if (!characters.length) { setGlobalLoading(false); return; }
    let cancelled = false;
    setGlobalLoading(true);
    setDrill({ level: 'list' });
    const initial: Record<string, 'loading'> = {};
    for (const c of characters) initial[c.id] = 'loading';
    setCharDataMap(initial);

    const charFetches: Promise<CrosscutEntry | { error: true; id: string }>[] = characters.map(c => {
      if (prefetchedDetail?.id === c.id) {
        return Promise.resolve<CrosscutEntry>({
          donated: prefetchedDetail.donated_museum_items,
          count: prefetchedDetail.donated_specimen_count,
          farm_name: prefetchedDetail.farm_name,
        });
      }
      return fetch(`${API_BASE}/api/characters/${c.id}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => ({ donated: (d.donated_museum_items || []) as number[], count: (d.donated_specimen_count || 0) as number, farm_name: (d.farm_name || null) as string | null }))
        .catch(() => ({ error: true as const, id: c.id }));
    });

    Promise.all([
      fetch(`${API_BASE}/api/museum-items`).then(r => r.json() as Promise<MuseumItemLocal[]>).catch(() => [] as MuseumItemLocal[]),
      ...charFetches,
    ]).then(([items, ...results]) => {
      if (cancelled) return;
      setMuseumItems(items as MuseumItemLocal[]);
      const newMap: Record<string, CrosscutEntry | 'error'> = {};
      characters.forEach((c, i) => {
        const r = results[i] as CrosscutEntry | { error: true; id: string };
        newMap[c.id] = 'error' in r ? 'error' : r;
      });
      setCharDataMap(newMap);
      setGlobalLoading(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charIdsKey]);

  const itemById = new Map<number, MuseumItemLocal>();
  for (const item of museumItems) itemById.set(item.id, item);

  const getDonatedByCategory = (charId: string): Record<SpecimenCategory, MuseumItemLocal[]> => {
    const result: Record<SpecimenCategory, MuseumItemLocal[]> = { fish: [], mineral: [], plant: [] };
    const data = charDataMap[charId];
    if (!data || data === 'loading' || data === 'error') return result;
    for (const id of data.donated) {
      const item = itemById.get(id);
      if (item) result[item.category].push(item);
    }
    return result;
  };

  const sortedChars = [...characters].sort((a, b) => {
    const aData = charDataMap[a.id];
    const bData = charDataMap[b.id];
    return (typeof bData === 'object' ? bData.count : 0) - (typeof aData === 'object' ? aData.count : 0);
  });

  const maxCount = sortedChars.reduce((m, c) => {
    const d = charDataMap[c.id];
    return Math.max(m, typeof d === 'object' ? d.count : 0);
  }, 0);

  // ── Category item list ──
  if (drill.level === 'category') {
    const { charId, category } = drill;
    const char = characters.find(c => c.id === charId);
    const items = getDonatedByCategory(charId)[category];
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-5 flex items-center gap-3">
          <button onClick={() => setDrill({ level: 'character', charId })}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200">
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-200">
            <span aria-hidden className="mr-1" style={category === 'mineral' ? { filter: 'hue-rotate(155deg) saturate(3) brightness(1.15) contrast(1.6)' } : undefined}>{SPECIMEN_ICONS[category]}</span>
            {char?.character_name} — {SPECIMEN_LABELS[category]}
            <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">({items.length})</span>
          </h2>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            No {SPECIMEN_LABELS[category].toLowerCase()} donated yet.
          </p>
        ) : (
          <ul className="columns-2 gap-x-6 sm:columns-3">
            {items.map(item => (
              <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-700 dark:text-slate-300">
                {item.name ?? `ID ${item.id}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  // ── Character category summary ──
  if (drill.level === 'character') {
    const { charId } = drill;
    const char = characters.find(c => c.id === charId);
    const data = charDataMap[charId];
    const farmName = typeof data === 'object' ? data.farm_name : null;
    const totalCount = typeof data === 'object' ? data.count : 0;
    const byCategory = getDonatedByCategory(charId);
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-5 flex items-start gap-3">
          <button onClick={() => setDrill({ level: 'list' })}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200 mt-0.5">
            <span aria-hidden>←</span> Back
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-200">{char?.character_name}</h2>
            {farmName && <p className="text-xs text-slate-400 dark:text-slate-500">{farmName}</p>}
          </div>
          <span className="mt-0.5 text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            {totalCount} total
          </span>
        </div>
        <div className="space-y-1">
          {SPECIMEN_CATEGORIES.map(cat => {
            const items = byCategory[cat];
            return (
              <button key={cat} onClick={() => setDrill({ level: 'category', charId, category: cat })}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <span className="text-xl select-none" aria-hidden style={cat === 'mineral' ? { filter: 'hue-rotate(155deg) saturate(3) brightness(1.15) contrast(1.6)' } : undefined}>{SPECIMEN_ICONS[cat]}</span>
                <span className="flex-1 text-base font-medium text-slate-700 dark:text-slate-300">{SPECIMEN_LABELS[cat]}</span>
                <span className="rounded-full px-2.5 py-0.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: items.length > 0 ? SPECIMEN_COLORS[cat] : '#94a3b8' }}>
                  {items.length}
                </span>
                <span className="text-slate-300 dark:text-slate-500" aria-hidden>›</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // ── Top-level character list ──
  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-5">
        <h2 className="text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-200">Research Center</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Specimen donations across all your characters
        </p>
      </div>
      {globalLoading ? (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-500">Loading…</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {sortedChars.map(char => {
            const data = charDataMap[char.id];
            const isError = data === 'error';
            const isReady = typeof data === 'object';
            const count = isReady ? data.count : 0;
            const farmName = isReady ? data.farm_name : null;
            const barPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            return (
              <button key={char.id}
                onClick={() => isReady && setDrill({ level: 'character', charId: char.id })}
                disabled={!isReady}
                className="flex w-full items-center gap-4 rounded-lg px-2 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:pointer-events-none disabled:opacity-40">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-200">{char.character_name}</p>
                  {farmName && <p className="truncate text-xs text-slate-400 dark:text-slate-500">{farmName}</p>}
                </div>
                {isError ? (
                  <span className="text-xs italic text-slate-400 dark:text-slate-500">Failed to load</span>
                ) : (
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-sky-400 dark:bg-sky-500 transition-all" style={{ width: `${barPct}%` }} />
                    </div>
                    <span className="w-28 text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">{count}</span>
                      <span className="text-slate-400 dark:text-slate-500"> specimens</span>
                    </span>
                    <span className="text-slate-300 dark:text-slate-500" aria-hidden>›</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, count, total, accent }: { label: string; count: number; total: number; accent: string }) {
  const pct = total > 0 ? Math.min(100, Math.ceil((count / total) * 100)) : 0;
  const isInline = accent.startsWith('#') || accent.startsWith('var(');
  return (
    <div className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 text-center">
      <div className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={`mt-2 text-4xl font-bold tabular-nums ${isInline ? '' : accent}`}
        style={isInline ? { color: accent } : undefined}
      >{pct}%</div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { selectedCharacter, characterDetailLoading, selectedCharacterId, characters } = useAuth();

  if (!selectedCharacterId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <p className="text-lg">No character selected.</p>
      </div>
    );
  }

  if (characterDetailLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <p className="text-lg">Loading character data…</p>
      </div>
    );
  }

  if (!selectedCharacter) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <p className="text-lg">Could not load character data.</p>
      </div>
    );
  }

  const hasSaveData =
    selectedCharacter.fish_discovered.length > 0 ||
    selectedCharacter.items_discovered.length > 0;

  return (
    <div className="space-y-8">
      <header className="pl-6">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {selectedCharacter.character_name}
        </h1>
        {selectedCharacter.exp != null && (
          <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
            {selectedCharacter.exp.toLocaleString()} EXP
          </p>
        )}
      </header>

      {!hasSaveData ? (
        <div className="rounded-2xl border border-dashed border-emerald-900/20 bg-white p-10 text-center shadow-sm">
          <p className="text-slate-600">
            No save data loaded yet. Use the{' '}
            <span className="font-semibold text-[#5c9a30]">Load Files</span> button in the header
            to upload your{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">.grimshire</code> save file.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Fish discovered"  count={selectedCharacter.fish_discovered.length}              total={selectedCharacter.fish_total ?? 75}         accent="var(--fish-accent)" />
            <StatCard label="Edibles found"    count={selectedCharacter.edibles_discovered.length}           total={selectedCharacter.edibles_total || 47}       accent="var(--edibles-accent)" />
            <StatCard label="Cooking recipes"  count={selectedCharacter.unlocked_cooking_recipes.length}     total={selectedCharacter.unlocked_cooking_recipes.length + selectedCharacter.unlocked_cooking_recipes_undiscovered.length}  accent="#be185d" />
            <StatCard label="Crafting recipes" count={selectedCharacter.unlocked_crafting_recipes.length}    total={171}                                         accent="var(--crafting-color)" />
          </section>

          {/* Left col: raw materials (Fish, Edibles) | Right col: recipes (Cooking, Crafting) */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <FishSection
              discovered={selectedCharacter.fish_discovered}
              undiscovered={selectedCharacter.fish_undiscovered ?? null}
              total={selectedCharacter.fish_total ?? null}
              spoilerKey="show_undiscovered_fish"
            />
            <CookingRecipeSection
              discovered={selectedCharacter.unlocked_cooking_recipes}
              undiscovered={selectedCharacter.unlocked_cooking_recipes_undiscovered}
              spoilerKey="show_undiscovered_cooking_recipes"
            />
            <EdiblesSection
              discovered={selectedCharacter.edibles_discovered ?? []}
              undiscovered={selectedCharacter.edibles_undiscovered ?? []}
              total={selectedCharacter.edibles_total ?? 0}
            />
            <CraftingRecipeSection
              discovered={selectedCharacter.unlocked_crafting_recipes}
              undiscovered={selectedCharacter.unlocked_crafting_recipes_undiscovered}
              spoilerKey="show_undiscovered_crafting_recipes"
            />
          </section>

          <ResearchCenterCrosscut
            characters={characters}
            prefetchedDetail={selectedCharacter}
          />
        </>
      )}
    </div>
  );
}
