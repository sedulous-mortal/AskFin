import { useState } from 'react';
import { useAuth, ResolvedItem, EdibleItem } from '../context/AuthContext';

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
  const discoveredArc =
    total !== null ? (Math.min(discovered / total, 1)) * circ
    : discovered > 0 ? circ * 0.45
    : 0;
  const startOffset = circ * 0.25;

  return (
    <svg viewBox="0 0 100 100" className="w-36 h-36 shrink-0"
      aria-label={`${discovered} of ${total ?? '?'} discovered`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="11"
        className={onUndiscoveredClick ? 'cursor-pointer hover:stroke-slate-300' : ''}
        onClick={onUndiscoveredClick} />
      {discovered > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="11"
          strokeDasharray={`${discoveredArc} ${circ}`}
          strokeDashoffset={startOffset}
          strokeLinecap="round"
          className="cursor-pointer transition-opacity hover:opacity-80"
          onClick={onDiscoveredClick} />
      )}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="16" fontWeight="bold" fill="#1e293b">
        {discovered}
      </text>
      {total != null && (
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="8" fill="#64748b">
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
}: {
  segments: EdibleSegment[];
  total: number;
  onUndiscoveredClick: () => void;
}) {
  const r = 38;
  const cx = 50;
  const cy = 50;
  const strokeW = 11;

  const totalDiscovered = segments.reduce((s, seg) => s + seg.count, 0);

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
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeW}
        className="cursor-pointer hover:stroke-slate-300"
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
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="16" fontWeight="bold" fill="#1e293b">
        {totalDiscovered}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="8" fill="#64748b">
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
          <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-700">
            {item.name}
          </li>
        ))}
        {unnamed.map(item => (
          <li key={item.id} className="mb-1.5 break-inside-avoid text-sm text-slate-400 italic">
            ID {item.id}
          </li>
        ))}
      </ul>
      {named.length === 0 && unnamed.length === 0 && (
        <p className="text-sm text-slate-400">Nothing here.</p>
      )}
    </div>
  );
}

// ── Standard category section (fish, cooking, crafting) ───────────────────────

type DrillView = 'chart' | 'discovered' | 'undiscovered';

function CategorySection({
  title, icon, color, discovered, undiscovered, total,
}: {
  title: string;
  icon: string;
  color: string;
  discovered: ResolvedItem[];
  undiscovered: ResolvedItem[] | null;
  total: number | null;
}) {
  const [view, setView] = useState<DrillView>('chart');

  if (view !== 'chart') {
    const isUndiscoveredUnknown = view === 'undiscovered' && undiscovered === null;
    const items = view === 'discovered' ? discovered : (undiscovered ?? []);
    const label = view === 'discovered' ? `Discovered ${title}` : `Undiscovered ${title}`;
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setView('chart')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800">
            <span aria-hidden className="mr-1">{icon}</span>
            {label}
            {!isUndiscoveredUnknown && (
              <span className="ml-2 text-sm font-normal text-slate-400">({items.length})</span>
            )}
          </h2>
        </div>
        {isUndiscoveredUnknown ? (
          <p className="text-sm text-slate-500">
            We don't have the full list of {title.toLowerCase()} in the game yet, so we can't
            show which ones are undiscovered. Total count coming soon.
          </p>
        ) : (
          <ItemGrid items={items} />
        )}
      </section>
    );
  }

  const undiscoveredCount = undiscovered !== null ? undiscovered.length : null;
  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm">
      <header className="mb-5 flex items-center gap-2">
        <span aria-hidden className="text-2xl">{icon}</span>
        <h2 className="text-xl font-bold tracking-tight text-slate-800">{title}</h2>
      </header>
      <div className="flex items-center gap-8">
        <DonutChart discovered={discovered.length} total={total} color={color}
          onDiscoveredClick={() => setView('discovered')}
          onUndiscoveredClick={() => setView('undiscovered')} />
        <div className="flex flex-col gap-3">
          <button onClick={() => setView('discovered')} className="flex items-center gap-2 text-left group">
            <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
              <span className="font-semibold">{discovered.length}</span> discovered
            </span>
          </button>
          <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
            <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200" />
            <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors">
              {undiscovered !== null
                ? <><span className="font-semibold">{undiscoveredCount}</span> undiscovered</>
                : <span className="italic">undiscovered (total unknown)</span>
              }
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Edibles section ───────────────────────────────────────────────────────────

type EdibleDrillView = 'chart' | 'forageable' | 'farmable' | 'both' | 'undiscovered';

const EDIBLE_COLORS = {
  forageable: '#16a34a',
  farmable:   '#d97706',
  both:       '#0891b2',
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

  const bySource = {
    forageable: discovered.filter(i => i.source === 'forageable'),
    farmable:   discovered.filter(i => i.source === 'farmable'),
    both:       discovered.filter(i => i.source === 'both'),
  };

  if (view !== 'chart') {
    const items = view === 'undiscovered' ? undiscovered : bySource[view] ?? [];
    const label = EDIBLE_LABELS[view];
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setView('chart')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800">
            <span aria-hidden className="mr-1">🥬</span>
            {label} Edibles
            <span className="ml-2 text-sm font-normal text-slate-400">({items.length})</span>
          </h2>
        </div>
        <ItemGrid items={items} />
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
  ];

  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm">
      <header className="mb-5 flex items-center gap-2">
        <span aria-hidden className="text-2xl">🥬</span>
        <h2 className="text-xl font-bold tracking-tight text-slate-800">Edibles</h2>
      </header>
      <div className="flex items-center gap-8">
        <MultiDonutChart segments={segments} total={total}
          onUndiscoveredClick={() => setView('undiscovered')} />
        <div className="flex flex-col gap-3">
          {segments.map((seg) => (
            <button key={seg.label} onClick={() => setView(seg.label === 'Forageable' ? 'forageable' : seg.label === 'Farmable' ? 'farmable' : 'both')}
              className="flex items-center gap-2 text-left group">
              <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                <span className="font-semibold">{seg.count}</span> {seg.label.toLowerCase()}
              </span>
            </button>
          ))}
          <button onClick={() => setView('undiscovered')} className="flex items-center gap-2 text-left group">
            <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200" />
            <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors">
              <span className="font-semibold">{undiscovered.length}</span> undiscovered
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-4xl font-bold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { selectedCharacter, characterDetailLoading, selectedCharacterId } = useAuth();

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
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          {selectedCharacter.character_name}
        </h1>
        {selectedCharacter.exp != null && (
          <p className="mt-1 text-base text-slate-600">
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
            <StatCard label="Fish discovered"   value={selectedCharacter.fish_discovered.length}              accent="text-sky-700" />
            <StatCard label="Edibles found"     value={selectedCharacter.edibles_discovered.length}           accent="text-emerald-700" />
            <StatCard label="Crafting recipes"  value={selectedCharacter.unlocked_crafting_recipes.length}    accent="text-amber-700" />
            <StatCard label="Cooking recipes"   value={selectedCharacter.unlocked_cooking_recipes.length}     accent="text-rose-700" />
          </section>

          {/* Row 1: Fish | Edibles */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CategorySection
              title="Fish" icon="🐟" color="#0369a1"
              discovered={selectedCharacter.fish_discovered}
              undiscovered={selectedCharacter.fish_undiscovered ?? null}
              total={selectedCharacter.fish_total ?? null}
            />
            <EdiblesSection
              discovered={selectedCharacter.edibles_discovered ?? []}
              undiscovered={selectedCharacter.edibles_undiscovered ?? []}
              total={selectedCharacter.edibles_total ?? 0}
            />
          </section>

          {/* Row 2: Cooking Recipes | Crafting Recipes */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CategorySection
              title="Cooking Recipes" icon="🍳" color="#be185d"
              discovered={selectedCharacter.unlocked_cooking_recipes}
              undiscovered={null}
              total={null}
            />
            <CategorySection
              title="Crafting Recipes" icon="🔨" color="#b45309"
              discovered={selectedCharacter.unlocked_crafting_recipes}
              undiscovered={null}
              total={null}
            />
          </section>
        </>
      )}
    </div>
  );
}
