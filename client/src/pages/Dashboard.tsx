import { useState } from 'react';
import { useAuth, ResolvedItem } from '../context/AuthContext';

// ── Donut chart ───────────────────────────────────────────────────────────────

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
  const fraction = total && total > 0 ? Math.min(discovered / total, 1) : 0;
  const discoveredArc = fraction * circ;
  // SVG circles start at 3 o'clock; offset by 25% to start at 12 o'clock
  const startOffset = circ * 0.25;

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-36 h-36 shrink-0"
      aria-label={`${discovered} of ${total ?? '?'} discovered`}
    >
      {/* Track (undiscovered) */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="11"
        className={onUndiscoveredClick ? 'cursor-pointer hover:stroke-slate-300' : ''}
        onClick={onUndiscoveredClick}
        strokeDasharray={total == null ? `${circ * 0.85} ${circ * 0.15}` : undefined}
      />
      {/* Undiscovered label when no total known */}
      {total == null && (
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize="7" fill="#94a3b8">
          total unknown
        </text>
      )}
      {/* Discovered arc */}
      {discoveredArc > 0 && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeDasharray={`${discoveredArc} ${circ}`}
          strokeDashoffset={startOffset}
          strokeLinecap="round"
          className="cursor-pointer transition-opacity hover:opacity-80"
          onClick={onDiscoveredClick}
        />
      )}
      {/* Center: count */}
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize="16" fontWeight="bold" fill="#1e293b">
        {discovered}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill="#64748b">
        {total != null ? `of ${total}` : 'discovered'}
      </text>
    </svg>
  );
}

// ── Item list (drilldown) ─────────────────────────────────────────────────────

function ItemGrid({ items }: { items: ResolvedItem[] }) {
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

// ── Category section ──────────────────────────────────────────────────────────

type DrillView = 'chart' | 'discovered' | 'undiscovered';

function CategorySection({
  title,
  icon,
  color,
  discovered,
  undiscovered,
  total,
}: {
  title: string;
  icon: string;
  color: string;
  discovered: ResolvedItem[];
  undiscovered: ResolvedItem[] | null; // null = total unknown
  total: number | null;
}) {
  const [view, setView] = useState<DrillView>('chart');

  if (view !== 'chart') {
    const items = view === 'discovered' ? discovered : (undiscovered ?? []);
    const label = view === 'discovered' ? `Discovered ${title}` : `Undiscovered ${title}`;
    return (
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => setView('chart')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <span aria-hidden>←</span> Back
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800">
            <span aria-hidden className="mr-1">{icon}</span>
            {label}
            <span className="ml-2 text-sm font-normal text-slate-400">({items.length})</span>
          </h2>
        </div>
        <ItemGrid items={items} />
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
        <DonutChart
          discovered={discovered.length}
          total={total}
          color={color}
          onDiscoveredClick={() => setView('discovered')}
          onUndiscoveredClick={undiscovered !== null ? () => setView('undiscovered') : undefined}
        />

        <div className="flex flex-col gap-3">
          <button
            onClick={() => setView('discovered')}
            className="flex items-center gap-2 text-left group"
          >
            <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
              <span className="font-semibold">{discovered.length}</span> discovered
            </span>
          </button>

          {undiscovered !== null ? (
            <button
              onClick={() => setView('undiscovered')}
              className="flex items-center gap-2 text-left group"
            >
              <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200" />
              <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors">
                <span className="font-semibold">{undiscoveredCount}</span> undiscovered
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-200" />
              <span className="text-sm text-slate-400 italic">total unknown</span>
            </div>
          )}
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
        <p className="mt-1 text-lg text-slate-600">
          {selectedCharacter.farm_name ?? 'Unknown Farm'}
          {selectedCharacter.exp != null && (
            <span className="ml-4 text-base text-slate-400">
              {selectedCharacter.exp.toLocaleString()} EXP
            </span>
          )}
        </p>
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
            <StatCard label="Fish discovered" value={selectedCharacter.fish_discovered.length} accent="text-sky-700" />
            <StatCard label="Items discovered" value={selectedCharacter.items_discovered.length} accent="text-emerald-700" />
            <StatCard label="Crafting recipes" value={selectedCharacter.unlocked_crafting_recipes.length} accent="text-amber-700" />
            <StatCard label="Cooking recipes" value={selectedCharacter.unlocked_cooking_recipes.length} accent="text-rose-700" />
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CategorySection
              title="Fish"
              icon="🐟"
              color="#0369a1"
              discovered={selectedCharacter.fish_discovered}
              undiscovered={selectedCharacter.fish_undiscovered ?? null}
              total={selectedCharacter.fish_total ?? null}
            />
            <CategorySection
              title="Cooking Recipes"
              icon="🍳"
              color="#be185d"
              discovered={selectedCharacter.unlocked_cooking_recipes}
              undiscovered={null}
              total={null}
            />
          </section>

          <section className="grid grid-cols-1 gap-6">
            <CategorySection
              title="Crafting Recipes"
              icon="🔨"
              color="#b45309"
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
