import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const SPECIMEN_CATEGORIES = ['fish', 'mineral', 'plant'] as const;
type SpecimenCategory = typeof SPECIMEN_CATEGORIES[number];
const SPECIMEN_LABELS: Record<SpecimenCategory, string> = { fish: 'Fish', mineral: 'Minerals', plant: 'Plants' };
const SPECIMEN_COLORS: Record<SpecimenCategory, string> = { fish: '#38bdf8', mineral: '#d97706', plant: '#16a34a' };
const SPECIMEN_ICONS: Record<SpecimenCategory, string> = { fish: '🐟', mineral: '💎', plant: '🌿' };

type MuseumItemLocal = { id: number; name: string | null; category: SpecimenCategory };
type CrosscutEntry = { donated: number[]; count: number; farm_name: string | null };
type CrosscutDrill =
  | { level: 'list' }
  | { level: 'character'; charId: string }
  | { level: 'category'; charId: string; category: SpecimenCategory };

type CardProps = {
  characters: Array<{ id: string; character_name: string }>;
  charDataMap: Record<string, CrosscutEntry | 'loading' | 'error'>;
  itemById: Map<number, MuseumItemLocal>;
  globalLoading: boolean;
};

function getDonatedByCategory(
  charId: string,
  charDataMap: CardProps['charDataMap'],
  itemById: Map<number, MuseumItemLocal>,
): Record<SpecimenCategory, MuseumItemLocal[]> {
  const result: Record<SpecimenCategory, MuseumItemLocal[]> = { fish: [], mineral: [], plant: [] };
  const data = charDataMap[charId];
  if (!data || data === 'loading' || data === 'error') return result;
  for (const id of data.donated) {
    const item = itemById.get(id);
    if (item) result[item.category].push(item);
  }
  return result;
}

// ── Specimen detail panels ────────────────────────────────────────────────────

function DonatedPanel({ category, items }: { category: SpecimenCategory; items: MuseumItemLocal[] }) {
  const sorted = [...items].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  return (
    <>
      <p className="mb-2 text-xs font-semibold" style={{ color: SPECIMEN_COLORS[category] }}>
        {SPECIMEN_LABELS[category]} donated ({items.length})
      </p>
      {sorted.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">None donated yet.</p>
      ) : (
        <ul className="columns-2 gap-x-6 sm:columns-3">
          {sorted.map(item => (
            <li key={item.id} className="mb-1 break-inside-avoid text-xs text-slate-700 dark:text-slate-300">
              {item.name ?? `ID ${item.id}`}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RemainingPanel({ donatedSet, itemById }: { donatedSet: Set<number>; itemById: Map<number, MuseumItemLocal> }) {
  const byCategory: Record<SpecimenCategory, MuseumItemLocal[]> = { fish: [], mineral: [], plant: [] };
  for (const item of itemById.values()) {
    if (!donatedSet.has(item.id)) byCategory[item.category].push(item);
  }
  for (const cat of SPECIMEN_CATEGORIES) {
    byCategory[cat].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }
  const total = SPECIMEN_CATEGORIES.reduce((s, cat) => s + byCategory[cat].length, 0);

  return (
    <>
      <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Remaining to donate ({total})
      </p>
      {SPECIMEN_CATEGORIES.map(cat => {
        const items = byCategory[cat];
        if (!items.length) return null;
        return (
          <div key={cat} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-xs font-medium" style={{ color: SPECIMEN_COLORS[cat] }}>
              {SPECIMEN_LABELS[cat]} ({items.length})
            </p>
            <ul className="columns-2 gap-x-6 sm:columns-3">
              {items.map(item => (
                <li key={item.id} className="mb-0.5 break-inside-avoid text-xs text-slate-700 dark:text-slate-300">
                  {item.name ?? `ID ${item.id}`}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

// ── Stacked bar chart ─────────────────────────────────────────────────────────

function SpecimenBreakdownChart({ characters, charDataMap, itemById, globalLoading }: CardProps) {
  const museumTotal = itemById.size || 1;
  const [activePanel, setActivePanel] = useState<{ charId: string; category: SpecimenCategory | 'remaining' } | null>(null);

  const charRows = characters
    .filter(c => typeof charDataMap[c.id] === 'object')
    .map(c => {
      const byCategory = getDonatedByCategory(c.id, charDataMap, itemById);
      const total = SPECIMEN_CATEGORIES.reduce((s, cat) => s + byCategory[cat].length, 0);
      return { ...c, byCategory, total };
    })
    .sort((a, b) => b.total - a.total);

  function togglePanel(charId: string, category: SpecimenCategory | 'remaining') {
    setActivePanel(prev =>
      prev?.charId === charId && prev.category === category ? null : { charId, category }
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-200">Specimens</h2>
      <p className="mt-0.5 mb-5 text-sm text-slate-500 dark:text-slate-400">
        Donations by character — out of {itemById.size} total museum specimens. Click a segment to view items.
      </p>

      <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1.5">
        {SPECIMEN_CATEGORIES.map(cat => (
          <span key={cat} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: SPECIMEN_COLORS[cat] }} />
            {SPECIMEN_LABELS[cat]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-500">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-slate-200 dark:bg-slate-600" />
          Remaining
        </span>
      </div>

      {globalLoading ? (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-500">Loading…</p>
      ) : charRows.length === 0 ? (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-500">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {charRows.map(({ id, character_name, byCategory, total }) => {
            const pct = itemById.size > 0 ? Math.round((total / itemById.size) * 100) : 0;
            const data = charDataMap[id];
            const donatedSet = new Set<number>(typeof data === 'object' ? data.donated : []);
            const isActive = activePanel?.charId === id;

            return (
              <div key={id}>
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 truncate text-right text-xs text-slate-600 dark:text-slate-400" title={character_name}>
                    {character_name}
                  </span>
                  <div className="flex h-5 flex-1 overflow-hidden rounded">
                    {SPECIMEN_CATEGORIES.map(cat => {
                      const count = byCategory[cat].length;
                      if (!count) return null;
                      const isThisActive = isActive && activePanel?.category === cat;
                      return (
                        <div
                          key={cat}
                          role="button"
                          tabIndex={0}
                          className={`h-full shrink-0 cursor-pointer transition-opacity ${isThisActive ? 'opacity-60' : 'hover:opacity-80'}`}
                          style={{ width: `${(count / museumTotal) * 100}%`, backgroundColor: SPECIMEN_COLORS[cat] }}
                          title={`${SPECIMEN_LABELS[cat]}: ${count} — click to view`}
                          onClick={() => togglePanel(id, cat)}
                          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && togglePanel(id, cat)}
                        />
                      );
                    })}
                    <div
                      role="button"
                      tabIndex={0}
                      className={`h-full flex-1 cursor-pointer transition-colors ${isActive && activePanel?.category === 'remaining' ? 'bg-slate-300 dark:bg-slate-500' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600'}`}
                      title={`Remaining: ${itemById.size - total} items — click to view`}
                      onClick={() => togglePanel(id, 'remaining')}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && togglePanel(id, 'remaining')}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{pct}%</span>
                </div>

                {isActive && (
                  <div className="mt-2 ml-[92px] mr-[52px] rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-700/50">
                    {activePanel.category === 'remaining' ? (
                      <RemainingPanel donatedSet={donatedSet} itemById={itemById} />
                    ) : (
                      <DonatedPanel category={activePanel.category} items={byCategory[activePanel.category]} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Research Center list ──────────────────────────────────────────────────────

function ResearchCenterList({ characters, charDataMap, itemById, globalLoading }: CardProps) {
  const [drill, setDrill] = useState<CrosscutDrill>({ level: 'list' });

  const sortedChars = [...characters].sort((a, b) => {
    const aData = charDataMap[a.id];
    const bData = charDataMap[b.id];
    return (typeof bData === 'object' ? bData.count : 0) - (typeof aData === 'object' ? aData.count : 0);
  });

  const maxCount = sortedChars.reduce((m, c) => {
    const d = charDataMap[c.id];
    return Math.max(m, typeof d === 'object' ? d.count : 0);
  }, 0);

  if (drill.level === 'category') {
    const { charId, category } = drill;
    const char = characters.find(c => c.id === charId);
    const items = getDonatedByCategory(charId, charDataMap, itemById)[category];
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-5 flex items-center gap-3">
          <button onClick={() => setDrill({ level: 'character', charId })}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200">
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-200">
            <span aria-hidden className="mr-1" style={category === 'mineral' ? { filter: 'hue-rotate(175deg) saturate(2.5) brightness(0.85)' } : undefined}>{SPECIMEN_ICONS[category]}</span>
            {char?.character_name} — {SPECIMEN_LABELS[category]}
            <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">({items.length})</span>
          </h2>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No {SPECIMEN_LABELS[category].toLowerCase()} donated yet.</p>
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

  if (drill.level === 'character') {
    const { charId } = drill;
    const char = characters.find(c => c.id === charId);
    const data = charDataMap[charId];
    const farmName = typeof data === 'object' ? data.farm_name : null;
    const totalCount = typeof data === 'object' ? data.count : 0;
    const byCategory = getDonatedByCategory(charId, charDataMap, itemById);
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
          <span className="mt-0.5 text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">{totalCount} total</span>
        </div>
        <div className="space-y-1">
          {SPECIMEN_CATEGORIES.map(cat => {
            const items = byCategory[cat];
            return (
              <button key={cat} onClick={() => setDrill({ level: 'category', charId, category: cat })}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <span className="text-xl select-none" aria-hidden style={cat === 'mineral' ? { filter: 'hue-rotate(175deg) saturate(2.5) brightness(0.85)' } : undefined}>{SPECIMEN_ICONS[cat]}</span>
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

  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-5">
        <h2 className="text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-200">Research Center</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Specimen donations across all your characters</p>
      </div>
      {globalLoading ? (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-500">Loading…</p>
      ) : characters.length === 0 ? (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-500">No characters loaded yet.</p>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const { characters, selectedCharacter } = useAuth();
  const [museumItems, setMuseumItems] = useState<MuseumItemLocal[]>([]);
  const [charDataMap, setCharDataMap] = useState<Record<string, CrosscutEntry | 'loading' | 'error'>>({});
  const [globalLoading, setGlobalLoading] = useState(true);

  const charIdsKey = characters.map(c => c.id).join(',');

  useEffect(() => {
    if (!characters.length) { setGlobalLoading(false); return; }
    let cancelled = false;
    setGlobalLoading(true);
    const initial: Record<string, 'loading'> = {};
    for (const c of characters) initial[c.id] = 'loading';
    setCharDataMap(initial);

    const charFetches: Promise<CrosscutEntry | { error: true; id: string }>[] = characters.map(c => {
      if (selectedCharacter?.id === c.id) {
        return Promise.resolve<CrosscutEntry>({
          donated: selectedCharacter.donated_museum_items ?? [],
          count: selectedCharacter.donated_specimen_count ?? 0,
          farm_name: selectedCharacter.farm_name ?? null,
        });
      }
      return fetch(`${API_BASE}/api/characters/${c.id}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => ({
          donated: (d.donated_museum_items || []) as number[],
          count: (d.donated_specimen_count || 0) as number,
          farm_name: (d.farm_name || null) as string | null,
        }))
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

  const cardProps: CardProps = { characters, charDataMap, itemById, globalLoading };

  return (
    <div className="space-y-8">
      <header className="pl-6">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
          Comparison data across all your characters
        </p>
      </header>

      <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-base text-slate-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-slate-200">
        <i>Coming soon</i>
        <p>Dashboard will host comparison data across all the loaded character files for a given user of the AskFin app.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <SpecimenBreakdownChart {...cardProps} />
        <ResearchCenterList {...cardProps} />
      </div>
    </div>
  );
}
