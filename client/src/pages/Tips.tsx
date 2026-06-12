import { useEffect, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth, ToolData, BarnData, MuseumItem } from '../context/AuthContext';

const SEASON_IDX: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
const TOTAL_DAYS = 112;

const RATION_DAYS: Record<number, [number, number, number, number]> = {
  0: [2,  4,  9,  14],  // Unsteady
  1: [4,  9,  19, 39],  // Grim (default)
  2: [7,  17, 29, 59],  // Challenge
  3: [1,  2,  3,  4],   // Gentle
};
const DIFFICULTY_NAMES: Record<number, string> = {
  0: 'Unsteady',
  1: 'Grim',
  2: 'Challenge',
  3: 'Gentle',
};
const WINDOW_SIZE = 14;

type QuestItem = { name: string; amount: number };

type Quest = {
  id: number;
  name: string;
  description: string | null;
  display_title: string | null;
  available_start_season: number | null;
  available_start_season_name: string | null;
  available_first_day: number | null;
  available_end_season: number | null;
  available_end_season_name: string | null;
  available_last_day: number | null;
  reward_money: number | null;
  reward_relationship_points: number | null;
  quest_giver: string | null;
  requirements: QuestItem[];
  reward_items: QuestItem[];
  is_town_quest: boolean | null;
  is_donation_quest: boolean | null;
  is_rootcellar_quest: boolean | null;
  is_vip_quest: boolean | null;
};

type FishScheduleEntry = {
  id: number;
  name: string | null;
  rarity: string | null;
  size: string | null;
  habitat: string | null;
  locations: string[] | null;
  start_season: number | null;
  start_day: number | null;
  end_season: number | null;
  end_day: number | null;
};

type MineralEntry = { mine: string; floors: string };
type MineralInfo = {
  id: number;
  source: 'wall' | 'vein' | 'gem' | 'floor';
  entries: MineralEntry[];
};

function toAbsDay(yearOffset: number, season: number, day: number): number {
  return yearOffset * TOTAL_DAYS + season * 28 + (day - 1);
}

function isMineAccessible(mineralInfo: MineralInfo | undefined, pickaxeTier: number): boolean {
  if (!mineralInfo) return false;
  return mineralInfo.entries.some((e) => {
    if (e.mine === 'Forest') return true;
    if (e.mine === 'Marsh') return pickaxeTier >= 1;
    if (e.mine === 'Mountain') return pickaxeTier >= 3;
    return false;
  });
}

function isFishAvailable(fish: FishScheduleEntry | undefined, seasonIdx: number, day: number): boolean {
  if (!fish || fish.start_season === null || fish.start_day === null || fish.end_season === null || fish.end_day === null) return false;
  const startAbs = fish.start_season * 28 + (fish.start_day - 1);
  const endAbs = fish.end_season * 28 + (fish.end_day - 1);
  const currentAbs = seasonIdx * 28 + (day - 1);
  if (endAbs >= startAbs) return currentAbs >= startAbs && currentAbs <= endAbs;
  return currentAbs >= startAbs || currentAbs <= endAbs;
}

function questAbsDays(quest: Quest): [number, number] {
  const startAbs = toAbsDay(0, quest.available_start_season!, quest.available_first_day!);
  const endYearOffset = quest.available_end_season! < quest.available_start_season! ? 1 : 0;
  const endAbs = toAbsDay(endYearOffset, quest.available_end_season!, quest.available_last_day!);
  return [startAbs, endAbs];
}

function daysUntilActive(quest: Quest, currentAbs: number): number {
  if (
    quest.available_start_season === null ||
    quest.available_first_day === null ||
    quest.available_end_season === null ||
    quest.available_last_day === null
  ) {
    return 0;
  }
  const [startAbs, endAbs] = questAbsDays(quest);
  for (let i = 0; i < WINDOW_SIZE; i++) {
    const d = currentAbs + i;
    if (d >= startAbs && d <= endAbs) return i;
  }
  return WINDOW_SIZE;
}

function isAlwaysActive(quest: Quest): boolean {
  return (
    quest.available_start_season === 0 &&
    quest.available_first_day === 1 &&
    quest.available_end_season === 3 &&
    quest.available_last_day === 28
  );
}

function formatAvailability(quest: Quest): string {
  if (quest.available_start_season === null) return 'All year';
  if (isAlwaysActive(quest)) return 'All year';
  const start = `${quest.available_start_season_name} ${quest.available_first_day}`;
  const end = `${quest.available_end_season_name} ${quest.available_last_day}`;
  return `${start} – ${end}`;
}

function donationSortKey(quest: Quest): number {
  const title = quest.display_title || quest.name;
  const m = title.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function donationThreshold(quest: Quest): number | null {
  const n = donationSortKey(quest);
  return n > 0 ? n : null;
}

type TypeInfo = { label: string; color: string };

function questTypeInfo(quest: Quest): TypeInfo {
  if (quest.is_vip_quest) return { label: 'VIP Quest', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' };
  if (quest.is_donation_quest) return { label: 'Donation', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
  if (quest.is_rootcellar_quest) return { label: 'Root Cellar', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' };
  if (quest.is_town_quest) return { label: 'Town Quest', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' };
  return { label: 'Side Quest', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
}

function ItemIcon({ name, amount }: { name: string; amount: number }) {
  const safeName = name.replace(/ /g, '_');
  const paths = [`/items/${safeName}.png`, `/edibles/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');

  return (
    <div
      className="relative h-[84px] w-16 overflow-hidden rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-700/50 dark:bg-indigo-900/20"
      title={name}
    >
      {pathIdx < paths.length ? (
        <img
          src={paths[pathIdx]}
          alt={name}
          className="h-full w-full object-contain px-1 pt-1 pb-[20px]"
          onError={() => setPathIdx((i) => i + 1)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-center text-xs font-semibold leading-tight text-indigo-400 dark:text-indigo-500">
          {initials}
        </span>
      )}
      <span className="absolute bottom-0 right-0 inline-flex items-center justify-center rounded-tl bg-black/65 px-1.5 py-0.5 text-[14px] font-bold text-white">
        {amount}
      </span>
    </div>
  );
}

const RARITY_COLOR: Record<string, string> = {
  Abundant:      'text-green-400',
  Common:        'text-sky-400',
  Uncommon:      'text-violet-400',
  Rare:          'text-orange-400',
  Extraordinary: 'text-yellow-300',
  Junk:          'text-slate-400',
};

const MINE_COLOR: Record<string, string> = {
  Forest:   'text-emerald-400',
  Marsh:    'text-cyan-400',
  Mountain: 'text-slate-300',
};

const SOURCE_LABEL: Record<string, string> = {
  wall:  'Mine wall drop',
  vein:  'Ore vein',
  gem:   'Gem vein',
  floor: 'Cave floor drop',
};

const TOOLTIP_SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'];

function FishTooltipContent({ fish }: { fish: FishScheduleEntry }) {
  if (!fish.locations) return null;
  const disappearsOn = fish.end_season !== null && fish.end_day !== null
    ? `${TOOLTIP_SEASON_NAMES[fish.end_season]} ${fish.end_day}`
    : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 text-[11px]">Size</span>
        <span className="font-medium text-white text-xs">{fish.size ?? '—'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 text-[11px]">Rarity</span>
        <span className={`font-semibold text-xs ${RARITY_COLOR[fish.rarity ?? ''] ?? 'text-slate-300'}`}>
          {fish.rarity ?? '—'}
        </span>
      </div>
      {disappearsOn && (
        <div>
          <div className="text-slate-400 text-[11px] mb-0.5">Disappears on</div>
          <div className="text-white text-xs">{disappearsOn}</div>
        </div>
      )}
      <div className="pt-0.5">
        <div className="text-slate-400 text-[11px] mb-1">Locations</div>
        {fish.locations.map((loc) => (
          <div key={loc} className="text-white text-xs leading-snug">• {loc}</div>
        ))}
      </div>
    </div>
  );
}

function MineralTooltipContent({ mineral }: { mineral: MineralInfo }) {
  return (
    <div className="space-y-1.5">
      <div className="text-slate-400 text-[11px]">{SOURCE_LABEL[mineral.source] ?? mineral.source}</div>
      <div className="space-y-1">
        {mineral.entries.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className={`font-semibold text-xs ${MINE_COLOR[e.mine] ?? 'text-slate-300'}`}>
              {e.mine} Mine
            </span>
            <span className="text-slate-400 text-[11px]">floors {e.floors}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonationItemIcon({
  item,
  inInventory,
  inventoryAmount,
  discovered,
  inSeason,
  fishInfo,
  mineralInfo,
}: {
  item: MuseumItem;
  inInventory: boolean;
  inventoryAmount: number;
  discovered: boolean;
  inSeason?: boolean;
  fishInfo?: FishScheduleEntry;
  mineralInfo?: MineralInfo;
}) {
  const safeName = (item.name ?? '').replace(/ /g, '_');
  const paths = item.category === 'fish'
    ? [`/fish/${safeName}.png`, `/items/${safeName}.png`]
    : [`/items/${safeName}.png`, `/edibles/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const initials = (item.name ?? '??').split(' ').slice(0, 2).map((w) => w[0]).join('');

  const highlighted = inInventory || inSeason;
  const borderColor = inInventory
    ? 'border-2 border-amber-300 dark:border-amber-500'
    : inSeason
      ? 'border-2 border-amber-700 dark:border-amber-400'
      : 'border border-slate-400 dark:border-slate-500';
  const opacity = highlighted || discovered ? '' : 'opacity-40';

  const hasTooltip = (item.category === 'fish' && fishInfo && fishInfo.locations)
    || (item.category === 'mineral' && mineralInfo);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`h-[84px] w-16 overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800/50 ${borderColor} ${opacity}`}
      >
        {safeName && pathIdx < paths.length ? (
          <img
            src={paths[pathIdx]}
            alt={item.name ?? ''}
            className="h-full w-full object-contain px-1 py-1"
            onError={() => setPathIdx((i) => i + 1)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center pb-4 text-center text-xs font-semibold leading-tight text-slate-400 dark:text-slate-500">
            {initials || '?'}
          </span>
        )}
      </div>

      {hovered && hasTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-44 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2.5 shadow-xl pointer-events-none">
          <div className="text-slate-200 text-xs font-semibold mb-1.5 leading-tight">
            {item.name ?? `Item #${item.id}`}
          </div>
          {item.category === 'fish' && fishInfo && <FishTooltipContent fish={fishInfo} />}
          {item.category === 'mineral' && mineralInfo && <MineralTooltipContent mineral={mineralInfo} />}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-700" />
        </div>
      )}
    </div>
  );
}

function RewardIcon({ name, amount, type }: {
  name: string;
  amount: number;
  type: 'item' | 'relationship';
}) {
  const safeName = name.replace(/ /g, '_');
  const paths = type === 'item'
    ? [`/items/${safeName}.png`, `/edibles/${safeName}.png`]
    : [`/villagers/${safeName}.png`, `/characters/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const isRel = type === 'relationship';

  return (
    <div
      className={`relative h-[84px] w-16 overflow-hidden rounded-lg border ${
        isRel
          ? 'border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-900/20'
          : 'border-indigo-200 bg-indigo-50 dark:border-indigo-700/50 dark:bg-indigo-900/20'
      }`}
      title={isRel ? `+${amount} relationship with ${name}` : `${name} ×${amount}`}
    >
      {pathIdx < paths.length ? (
        <img
          src={paths[pathIdx]}
          alt={name}
          className={`h-full w-full object-contain ${isRel ? 'object-bottom px-1 pt-1' : 'px-1 pt-1 pb-[20px]'}`}
          onError={() => setPathIdx((i) => i + 1)}
        />
      ) : (
        <span className={`flex h-full w-full items-center justify-center text-center text-xs font-semibold leading-tight ${
          isRel ? 'text-blue-400 dark:text-blue-500' : 'text-indigo-400 dark:text-indigo-500'
        }`}>
          {initials}
        </span>
      )}
      <span className={`absolute right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[13px] font-bold text-white ${
        isRel ? 'top-0 rounded-bl bg-violet-400/90' : 'bottom-0 rounded-tl bg-black/65'
      }`}>
        {isRel ? `+${amount}` : amount}
      </span>
    </div>
  );
}

// ── Height estimation constants (calibrated for ~538px card inner width at 2-col layout) ──
// These are approximate pixel values used to predict column heights before render.
const EST = {
  charBase: 7.8,   // text-base (~16px) avg char width
  charTitle: 9.5,  // text-lg font-semibold avg char width
  charSm: 7.0,     // text-sm avg char width
  lineBase: 24,    // text-base line-height
  lineTitle: 28,   // text-lg line-height
  chipRow: 27,     // chip height incl. py-0.5
  chipGap: 4,      // gap-1 between chips
  chipPad: 20,     // horizontal px-2 padding inside chip
  iconRow: 70,     // 64px icon + 6px gap
  label: 30,       // label text + mb-1.5
  mb3: 12,
  mb1: 4,
  colGap: 16,      // pr-4 between left and right columns
  colPadL: 16,     // pl-4 inside right column (border offset)
  cardInnerW: 538, // approximate inner width of a half-page card
};

// Simulate flex-wrap to count how many rows a set of chips occupies.
function countChipRows(texts: string[], containerW: number): number {
  let lineW = 0;
  let rows = 1;
  for (const t of texts) {
    const w = Math.min(t.length * EST.charSm + EST.chipPad + EST.chipGap, containerW);
    if (lineW > 0 && lineW + w > containerW) { rows++; lineW = w; }
    else { lineW += w; }
  }
  return rows;
}

// Estimate the right column height for a given icon-grid column count.
function estRightH(reqs: QuestItem[], cols: number, maxWPx: number): number {
  const innerW = maxWPx - EST.colPadL;
  const reqTexts = reqs.map(r => r.amount > 1 ? `${r.amount}× ${r.name}` : r.name);
  const chipRows = countChipRows(reqTexts, innerW);
  const iconRows = Math.ceil(reqs.length / cols);
  return EST.label + chipRows * EST.chipRow + EST.mb3 + iconRows * EST.iconRow;
}

// Estimate the left column height given the right column max-width.
function estLeftH(quest: Quest, rewardTexts: string[], hasRewards: boolean, hasRewardIcons: boolean, rightMaxWPx: number): number {
  const leftW = EST.cardInnerW - rightMaxWPx - EST.colGap;
  const title = quest.display_title || quest.name;
  const titleRows = Math.max(1, Math.ceil(title.length / Math.max(1, Math.floor(leftW / EST.charTitle))));
  let h = titleRows * EST.lineTitle + EST.mb1;

  if (quest.description) {
    const descRows = Math.max(1, Math.ceil(quest.description.length / Math.max(1, Math.floor(leftW / EST.charBase))));
    h += descRows * EST.lineBase + EST.mb3;
  }

  if (hasRewards) {
    h += EST.label;
    h += countChipRows(rewardTexts, leftW) * EST.chipRow + EST.mb3;
    if (hasRewardIcons) h += EST.iconRow; // one row of reward icons is typical
  }

  return h;
}

// Base max-widths for each icon column count (icon grid width + padding).
// These are lower bounds — estRightW() may widen them to fit the longest chip.
const COL_CONFIGS: Record<number, { gridClass: string; baseMaxWPx: number }> = {
  1: { gridClass: 'grid-cols-1', baseMaxWPx: 80  },
  2: { gridClass: 'grid-cols-2', baseMaxWPx: 160 },
  3: { gridClass: 'grid-cols-3', baseMaxWPx: 220 },
  4: { gridClass: 'grid-cols-4', baseMaxWPx: 280 },
};

function QuestCard({
  quest,
  inProgressQuestIds,
  currentAbs,
  difficulty,
  currentSeasonIdx,
}: {
  quest: Quest;
  inProgressQuestIds: Set<number>;
  currentAbs: number;
  difficulty?: number | null;
  currentSeasonIdx?: number;
}) {
  const { label, color } = questTypeInfo(quest);
  const daysAway = daysUntilActive(quest, currentAbs);
  const title = quest.display_title || quest.name;

  const rationDays = quest.is_rootcellar_quest && difficulty != null && currentSeasonIdx != null
    ? (RATION_DAYS[difficulty]?.[currentSeasonIdx] ?? null)
    : null;
  const diffName = quest.is_rootcellar_quest && difficulty != null
    ? (DIFFICULTY_NAMES[difficulty] ?? null)
    : null;
  const availability = formatAvailability(quest);
  const isThresholdDonation = Boolean(quest.is_donation_quest && donationThreshold(quest) !== null);
  const hasRewards = Boolean(quest.reward_money || quest.reward_relationship_points || quest.reward_items?.length || isThresholdDonation);

  // Build reward rows — store plain text alongside ReactNode for height estimation.
  type RewardRow = { text: string; chip: React.ReactNode; icon?: { name: string; amount: number; type: 'item' | 'relationship' } };
  const rewardRows: RewardRow[] = [];
  if (isThresholdDonation) {
    rewardRows.push({
      text: '+20 relationship with Adeline',
      chip: <span className="rounded bg-violet-100 px-2 py-0.5 text-sm text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">+20 relationship with Adeline</span>,
      icon: { name: 'Adeline', amount: 20, type: 'relationship' },
    });
  }
  if (quest.reward_money) {
    const t = `${quest.reward_money.toLocaleString()} coins`;
    rewardRows.push({
      text: t,
      chip: <span className="rounded bg-slate-50 px-2 py-0.5 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-300">{t}</span>,
    });
  }
  if (!isThresholdDonation && quest.reward_relationship_points) {
    if (quest.quest_giver) {
      const t = `+${quest.reward_relationship_points} relationship with ${quest.quest_giver}`;
      rewardRows.push({
        text: t,
        chip: <span className="rounded bg-violet-100 px-2 py-0.5 text-sm text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{t}</span>,
        icon: { name: quest.quest_giver, amount: quest.reward_relationship_points, type: 'relationship' },
      });
    } else {
      const t = `+${quest.reward_relationship_points} relationship — must be confirmed with Acute Owl Studio who this gain is with`;
      rewardRows.push({
        text: t,
        chip: <span className="rounded bg-amber-50 px-2 py-0.5 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t}</span>,
      });
    }
  }
  for (const item of quest.reward_items ?? []) {
    const t = item.amount > 1 ? `${item.amount}× ${item.name}` : `${item.name} (1)`;
    rewardRows.push({
      text: t,
      chip: <span className="rounded bg-emerald-50 px-2 py-0.5 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">{t}</span>,
      icon: { name: item.name, amount: item.amount, type: 'item' },
    });
  }

  // Pick the icon-grid column count that minimises |rightH - leftH|.
  // Only consider cols values where the last grid row is at least half full
  // (avoids awkward grids with mostly-empty final rows).
  const reqs = quest.requirements ?? [];
  const rewardTexts = rewardRows.map(r => r.text);
  const hasRewardIcons = rewardRows.some(r => r.icon);

  // Minimum right column width: widest chip must fit on one line without wrapping.
  const minChipContentPx = reqs.length > 0
    ? Math.max(EST.iconRow, ...reqs.map(r => {
        const t = r.amount > 1 ? `${r.amount}× ${r.name}` : r.name;
        return t.length * EST.charSm + EST.chipPad;
      }))
    : EST.iconRow;
  const minRightW = minChipContentPx + EST.colPadL;

  let bestCols = 1;
  let bestMaxW = minRightW;
  let bestDiff = Infinity;
  for (const c of [1, 2, 3, 4]) {
    if (reqs.length === 0) break;
    if (c > reqs.length) break;
    const lastRow = reqs.length % c;
    if (lastRow !== 0 && lastRow < Math.ceil(c / 2)) continue;
    // Effective max-width: at least wide enough for the longest chip.
    const effectiveMaxW = Math.max(COL_CONFIGS[c].baseMaxWPx, minRightW);
    const rH = estRightH(reqs, c, effectiveMaxW);
    const lH = estLeftH(quest, rewardTexts, hasRewards, hasRewardIcons, effectiveMaxW);
    const diff = Math.abs(rH - lH);
    if (diff < bestDiff) { bestDiff = diff; bestCols = c; bestMaxW = effectiveMaxW; }
  }

  // Prefer an even 3-column grid over a 4+remainder layout when items divide cleanly into rows of 3.
  if (bestCols === 4 && reqs.length % 3 === 0) {
    bestCols = 3;
    bestMaxW = Math.max(COL_CONFIGS[3].baseMaxWPx, minRightW);
  }

  const { gridClass } = COL_CONFIGS[bestCols] ?? COL_CONFIGS[2];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-900/10 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${color}`}>
            {label}
          </span>
          {inProgressQuestIds.has(quest.id) ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              In progress
            </span>
          ) : daysAway === 0 ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-600">
              Available now
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              Starts in {daysAway} day{daysAway !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-sm text-slate-400 dark:text-slate-500">{availability}</span>
      </div>

      {/* Body: left fills remaining space, right column sizes to estimated-optimal width */}
      <div className="flex min-h-0 flex-col p-5">
      <div className="flex min-h-0">

        {/* Left: title, description, reward chips + icons */}
        <div className="flex min-w-0 flex-1 flex-col pr-4">
          <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>

          {quest.is_rootcellar_quest ? (
            <p className="mb-3 text-base text-slate-500 dark:text-slate-400">
              Collected every Sunday from Spring 8 onward. Requires herbivore and carnivore food in equal parts — one type can cover the other's deficit if needed.
            </p>
          ) : quest.description ? (
            <p className="mb-3 text-base text-slate-500 dark:text-slate-400">{quest.description}</p>
          ) : null}

          {hasRewards && (
            <>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Rewards</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {rewardRows.map((row, i) => (
                  <div key={i}>{row.chip}</div>
                ))}
              </div>
              {hasRewardIcons && (
                <div className="flex flex-wrap gap-1.5">
                  {rewardRows.filter((r) => r.icon).map((r, i) => (
                    <RewardIcon key={i} name={r.icon!.name} amount={r.icon!.amount} type={r.icon!.type} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: root cellar food requirement panel */}
        {quest.is_rootcellar_quest && (
          <div className="w-1/3 flex-none border-l border-slate-100 pl-4 dark:border-slate-700">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Food This Season
            </p>
            {diffName && (
              <div className="mb-2">
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {diffName}
                </span>
              </div>
            )}
            {rationDays !== null ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">{rationDays}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">days / delivery</span>
              </div>
            ) : (
              <p className="text-xs italic text-slate-400 dark:text-slate-500">Load a save file to see your requirement.</p>
            )}
          </div>
        )}

        {/* Right: requires chips + icon grid at estimated-optimal column count */}
        {reqs.length > 0 && (
          <div className={`flex-none border-l border-slate-100 pl-4 dark:border-slate-700 ${reqs.length === 1 ? 'w-1/3' : 'w-1/2'}`}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Requires
            </p>
            <div className="mb-3 flex flex-wrap gap-1">
              {reqs.map((req, i) => (
                <span key={i} className="rounded bg-amber-50 px-2 py-0.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  {req.amount > 1 ? `${req.amount}× ` : ''}{req.name}
                </span>
              ))}
            </div>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${bestCols}, 4rem)` }}
            >
              {reqs.map((req, i) => (
                <ItemIcon key={i} name={req.name} amount={req.amount} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full-width note for root cellar cards */}
      {quest.is_rootcellar_quest && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-base text-sky-700 dark:border-slate-700 dark:text-sky-400">
          One day's worth of food is 150 stamina for herbivore and carnivore each (300 total). Omnivore total value is always what's shown in the parentheses in-game when you click on an edible in inventory, and what the root cellar uses to determine contribution value.
        </p>
      )}
      </div>
    </div>
  );
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  watercan: 'Watering Can',
  hoe: 'Hoe',
  pick: 'Pickaxe',
  axe: 'Axe',
  scythe: 'Scythe',
  rod: 'Fishing Rod',
};

// Material amounts extracted from EquippableTool ScriptableObject assets (resources.assets).
// Coin cost of 500 is confirmed from GetToolUpgradeTierCost() in ToolWheel.cs.
const TOOL_UPGRADE_REQ: Record<number, { material: string; amount: number; coins: number }> = {
  0: { material: 'Copper Bar',   amount: 20, coins: 500 },
  1: { material: 'Iron Bar',     amount: 20, coins: 500 },
  2: { material: 'Titanium Bar', amount: 20, coins: 500 },
  3: { material: 'Mithril Bar',  amount: 20, coins: 500 },
};

const ROD_UPGRADE_REQ: Record<number, { material: string; amount: number; coins: number }> = {
  0: { material: 'Copper Bar',   amount: 10, coins: 500 },
  1: { material: 'Iron Bar',     amount: 10, coins: 500 },
  2: { material: 'Titanium Bar', amount: 10, coins: 500 },
  3: { material: 'Mithril Bar',  amount: 10, coins: 500 },
};

function TierDots({ current, max }: { current: number; max: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-full ${
            i < current
              ? 'bg-amber-500 dark:bg-amber-400'
              : 'bg-slate-200 dark:bg-slate-600'
          }`}
        />
      ))}
    </span>
  );
}

function UpgradeStatusCard({ name, role, toolNames, chipColor, toolData }: {
  name: string;
  role: string;
  toolNames: string[];
  chipColor: string;
  toolData: ToolData[] | null;
}) {
  const isRod = toolNames.length === 1 && toolNames[0] === 'rod';
  const reqLookup = isRod ? ROD_UPGRADE_REQ : TOOL_UPGRADE_REQ;

  const getToolEntry = (toolName: string) =>
    toolData?.find((t) => t.toolName === toolName);

  // Each tool gets its own upgrade entry so they're always shown separately.
  const upgradeEntries: { toolName: string; currentTier: number }[] = [];
  const upgradingTools: { toolName: string; daysRemaining: number }[] = [];
  const maxedTools: string[] = [];

  if (toolData && toolData.length > 0) {
    for (const toolName of toolNames) {
      const entry = getToolEntry(toolName);
      const tier = entry?.tier ?? 0;
      const maxTier = entry?.maxTier ?? 4;
      if (entry?.upgrading) {
        upgradingTools.push({ toolName, daysRemaining: entry.upgradeDaysRemaining });
      } else if (tier >= maxTier) {
        maxedTools.push(toolName);
      } else {
        upgradeEntries.push({ toolName, currentTier: tier });
      }
    }
  }

  return (
    <div className="rounded-xl border border-slate-900/10 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-semibold ${chipColor}`}>
          {name}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">{role}</span>
      </div>

      {/* Per-tool tier rows */}
      {toolData && toolData.length > 0 ? (
        <div className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-700 dark:border-slate-700">
          {toolNames.map((toolName) => {
            const entry = getToolEntry(toolName);
            const tier = entry?.tier ?? 0;
            const maxTier = entry?.maxTier ?? 4;
            const upgrading = entry?.upgrading ?? false;
            const days = entry?.upgradeDaysRemaining ?? 0;
            return (
              <div key={toolName} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-24 text-sm text-slate-700 dark:text-slate-300">
                    {TOOL_DISPLAY_NAMES[toolName] ?? toolName}
                  </span>
                  <TierDots current={tier} max={maxTier} />
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {tier}/{maxTier}
                  </span>
                </div>
                {upgrading && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                    upgrading · {days} day{days !== 1 ? 's' : ''}
                  </span>
                )}
                {tier >= maxTier && !upgrading && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    maxed
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm italic text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
          Load a save file to see your current upgrade status.
        </p>
      )}

      {/* Next upgrade suggestions */}
      {upgradeEntries.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Next Upgrade{upgradeEntries.length > 1 ? 's' : ''}
          </p>
          <div className="space-y-4">
            {upgradeEntries.map(({ toolName, currentTier }) => {
              const req = reqLookup[currentTier];
              if (!req) return null;
              return (
                <div key={toolName} className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50">
                  <p className="mb-2 text-lg font-semibold text-slate-600 dark:text-slate-300">
                    {TOOL_DISPLAY_NAMES[toolName] ?? toolName} → Tier {currentTier + 1}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-3 py-1.5 text-base text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      <img src={`/items/${req.material.replace(/ /g, '_')}.png`} alt="" className="h-9 w-9 object-contain" />
                      {req.amount}× {req.material}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-3 py-1.5 text-base text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      <img src="/items/Bottled_Coins.png" alt="" className="h-9 w-9 object-contain" />
                      {req.coins} coins
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {maxedTools.length === toolNames.length && toolData && toolData.length > 0 && (
        <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">All tools fully upgraded!</p>
      )}

    </div>
  );
}

const BARN_NAMES: Record<number, string> = {
  0: 'Barn',
  1: 'Coop',
  2: 'Pen',
  3: 'Hutch',
};
const ALL_BARN_TYPES = [0, 1, 2, 3];

const HOME_LEVEL_LABELS: Record<number, string> = {
  0: 'Starter home',
  1: 'First expansion',
  2: 'Second expansion (max)',
};

function BuildingStatusCard({ homeLevel, homeConstructionDays, barnData }: {
  homeLevel: number | null;
  homeConstructionDays: number;
  barnData: BarnData[];
}) {
  const barnByType = new Map(barnData.map((b) => [b.prefabId, b]));

  return (
    <div className="rounded-xl border border-slate-900/10 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-0.5 text-sm font-semibold text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
          Rowan
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">Carpenter · Building Upgrades</span>
      </div>

      {homeLevel === null ? (
        <p className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm italic text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
          Load a save file to see your current building status.
        </p>
      ) : (
        <div className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-700 dark:border-slate-700">
          {/* Home row */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2.5">
              <span className="w-24 text-sm text-slate-700 dark:text-slate-300">Home</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {HOME_LEVEL_LABELS[homeLevel] ?? `Level ${homeLevel}`}
              </span>
            </div>
            {homeConstructionDays > 0 ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                under construction · {homeConstructionDays} day{homeConstructionDays !== 1 ? 's' : ''}
              </span>
            ) : homeLevel >= 2 ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                maxed
              </span>
            ) : null}
          </div>

          {/* Barn types */}
          {ALL_BARN_TYPES.map((typeId) => {
            const barn = barnByType.get(typeId);
            const label = BARN_NAMES[typeId];
            return (
              <div key={typeId} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-24 text-sm text-slate-700 dark:text-slate-300">{label}</span>
                  {barn ? (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {barn.level >= 1 ? 'Expanded (8 animals)' : 'Standard (4 animals)'}
                    </span>
                  ) : (
                    <span className="text-xs italic text-slate-400 dark:text-slate-500">not built</span>
                  )}
                </div>
                {barn && barn.level >= 1 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    maxed
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Next upgrade callout — only show when there's something left to build and not currently under construction */}
      {homeLevel !== null && homeConstructionDays === 0 && (homeLevel < 2 || ALL_BARN_TYPES.some((t) => !barnByType.has(t) || (barnByType.get(t)?.level ?? 0) < 1)) && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Available upgrades
          </p>
          <div className="space-y-1.5">
            {homeLevel < 2 && homeConstructionDays === 0 && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Home → {HOME_LEVEL_LABELS[(homeLevel + 1) as keyof typeof HOME_LEVEL_LABELS] ?? `Level ${homeLevel + 1}`}
                </p>
                <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">
                  Check with the Carpenter in-game for materials and cost.
                </p>
              </div>
            )}
            {ALL_BARN_TYPES.filter((t) => {
              const b = barnByType.get(t);
              return !b || b.level < 1;
            }).map((typeId) => {
              const barn = barnByType.get(typeId);
              return (
                <div key={typeId} className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {barn ? `${BARN_NAMES[typeId]} → Expanded` : `${BARN_NAMES[typeId]} → Build`}
                  </p>
                  <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">
                    Check with the Carpenter in-game for materials and cost.
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs italic text-slate-400 dark:text-slate-500">
        Home and building upgrade costs are stored in Unity assets and not yet extracted — verify requirements in-game.
      </p>
    </div>
  );
}

function DonatedSpecimensCard({
  selectedCharacter,
  donatedSections,
  fishScheduleMap,
  mineralDataMap,
}: {
  selectedCharacter: ReturnType<typeof useAuth>['selectedCharacter'];
  donatedSections: { label: string; items: MuseumItem[] }[];
  fishScheduleMap: Record<number, FishScheduleEntry>;
  mineralDataMap: Record<number, MineralInfo>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-medium text-slate-700 dark:text-slate-300">Items already donated</span>
        <svg
          className={`h-5 w-5 flex-none text-slate-400 transition-transform duration-200 dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-5 py-5 dark:border-slate-700">
          {!selectedCharacter ? (
            <p className="text-sm italic text-slate-400 dark:text-slate-500">
              Load a save file to see your donated specimens.
            </p>
          ) : donatedSections.length === 0 ? (
            <p className="text-sm italic text-slate-400 dark:text-slate-500">
              No specimens donated yet.
            </p>
          ) : (
            <div className="space-y-4">
              {donatedSections.map(({ label, items }) => (
                <div key={label}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <DonationItemIcon
                        key={item.id}
                        item={item}
                        inInventory={false}
                        inventoryAmount={0}
                        discovered={true}
                        fishInfo={item.category === 'fish' ? fishScheduleMap[item.id] : undefined}
                        mineralInfo={item.category === 'mineral' ? mineralDataMap[item.id] : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Tips() {
  const { season, day } = useDate();
  const { selectedCharacter } = useAuth();

  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [museumItems, setMuseumItems] = useState<MuseumItem[]>([]);
  const [revealUndiscovered, setRevealUndiscovered] = useState(false);
  const [fishScheduleMap, setFishScheduleMap] = useState<Record<number, FishScheduleEntry>>({});
  const [mineralDataMap, setMineralDataMap] = useState<Record<number, MineralInfo>>({});

  useEffect(() => {
    fetch('/api/quests')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load quests (${r.status})`);
        return r.json();
      })
      .then((data: Quest[]) => setAllQuests(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/museum-items')
      .then((r) => r.ok ? r.json() : [])
      .then((data: MuseumItem[]) => setMuseumItems(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/fish/all')
      .then((r) => r.ok ? r.json() : [])
      .then((data: FishScheduleEntry[]) => {
        const map: Record<number, FishScheduleEntry> = {};
        for (const f of data) map[f.id] = f;
        setFishScheduleMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/minerals/all')
      .then((r) => r.ok ? r.json() : [])
      .then((data: MineralInfo[]) => {
        const map: Record<number, MineralInfo> = {};
        for (const m of data) map[m.id] = m;
        setMineralDataMap(map);
      })
      .catch(() => {});
  }, []);

  const currentSeasonIdx = SEASON_IDX[season] ?? 0;
  const currentYearOffset = Math.max(0, (selectedCharacter?.current_year ?? 1) - 1);
  const currentAbs = toAbsDay(currentYearOffset, currentSeasonIdx, day);
  const pickaxeTier = selectedCharacter?.tool_data?.find((t) => t.toolName === 'pick')?.tier ?? 0;

  const inProgressQuestIds = new Set(
    (selectedCharacter?.quest_data ?? []).filter((q) => q.status === 1).map((q) => q.id),
  );

  const activeQuests = allQuests.filter((q) => inProgressQuestIds.has(q.id) && q.id !== 1331);

  const donatedCount = selectedCharacter?.donated_specimen_count ?? 0;

  // Museum donation helpers
  const donatedSet = new Set(selectedCharacter?.donated_museum_items ?? []);
  const inventoryMap = new Map(
    (selectedCharacter?.player_inventory ?? []).map((s) => [s.id, s.amount])
  );
  const discoveredItemIds = new Set([
    ...(selectedCharacter?.items_discovered ?? []).map((i) => i.id),
    ...(selectedCharacter?.fish_discovered ?? []).map((i) => i.id),
  ]);

  const toDonateSections = (['fish', 'mineral', 'plant'] as const).map((cat) => {
    const label = cat === 'fish' ? 'Fish' : cat === 'mineral' ? 'Minerals' : 'Plants';
    const catItems = museumItems.filter((item) => item.category === cat && !donatedSet.has(item.id));
    const discoveredInCat = catItems.filter((item) => discoveredItemIds.has(item.id));
    const undiscoveredInCat = catItems.filter((item) => !discoveredItemIds.has(item.id));
    const visibleItems = selectedCharacter
      ? revealUndiscovered
        ? [...discoveredInCat, ...undiscoveredInCat]
        : discoveredInCat
      : [];
    const hiddenCount = undiscoveredInCat.length;
    return { label, catItems, visibleItems, hiddenCount };
  }).filter((s) => s.catItems.length > 0);

  const donatedSections = (['fish', 'mineral', 'plant'] as const).map((cat) => {
    const label = cat === 'fish' ? 'Fish' : cat === 'mineral' ? 'Minerals' : 'Plants';
    const items = museumItems.filter((item) => item.category === cat && donatedSet.has(item.id));
    return { label, items };
  }).filter((s) => s.items.length > 0);

  const donationMilestones = allQuests
    .filter((q) => q.is_donation_quest && q.id !== 1331 && donationThreshold(q) !== null)
    .sort((a, b) => donationSortKey(a) - donationSortKey(b));

  const nextMilestone = donationMilestones.find((q) => (donationThreshold(q) ?? 0) > donatedCount);
  const completedMilestones = donationMilestones.filter((q) => (donationThreshold(q) ?? 0) <= donatedCount);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Tips
        </h1>
        <p className="mt-2 text-lg text-slate-700 dark:text-slate-300">
          Personalised next steps for{' '}
          <span className="font-semibold">
            {selectedCharacter?.character_name ?? 'your character'}
          </span>
          .
        </p>
      </header>

      {/* Active Quests */}
      <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Active Quests</h2>
        <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
          Quests you've accepted and are currently working on.
        </p>
        {loading ? (
          <p className="text-slate-600 dark:text-slate-400">Loading quests...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : !selectedCharacter ? (
          <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
            Load a save file to see your active quests.
          </p>
        ) : activeQuests.length === 0 ? (
          <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
            No quests currently in progress. Check the Quests tab to see what's available.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                inProgressQuestIds={inProgressQuestIds}
                currentAbs={currentAbs}
                difficulty={selectedCharacter?.difficulty ?? null}
                currentSeasonIdx={currentSeasonIdx}
              />
            ))}
          </div>
        )}
      </section>

      {/* Museum Donations */}
      <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Museum Donations</h2>
        <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
          Track your specimen milestones and see what you could donate next.
        </p>

        {/* Specimen milestone tracker */}
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-700/50 dark:bg-amber-900/20">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Specimens donated:{' '}
            <span className="text-amber-700 dark:text-amber-400">
              {selectedCharacter ? donatedCount : '—'}
            </span>
          </p>
          {!selectedCharacter ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">Load a save file to see your donation progress.</p>
          ) : nextMilestone ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Next milestone:{' '}
                <span className="font-semibold">{donationThreshold(nextMilestone)} specimens</span>
                {' '}— {nextMilestone.display_title || nextMilestone.name}
                {nextMilestone.reward_items?.length ? (
                  <> (rewards: {nextMilestone.reward_items.map((r) => r.name).join(', ')})</>
                ) : null}
                . You need{' '}
                <span className="font-semibold">{(donationThreshold(nextMilestone) ?? 0) - donatedCount} more</span>.
              </p>
              {completedMilestones.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {completedMilestones.map((q) => (
                    <span key={q.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      ✓ {donationThreshold(q)} specimens
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : donationMilestones.length > 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">All donation milestones completed!</p>
          ) : null}
        </div>

        {/* Items available to donate */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-5 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="font-medium text-slate-700 dark:text-slate-300">Items available to donate</p>
            {selectedCharacter && toDonateSections.length > 0 && (
              <button
                onClick={() => setRevealUndiscovered((v) => !v)}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-base font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                {revealUndiscovered ? 'Hide undiscovered' : 'Reveal undiscovered'}
              </button>
            )}
          </div>
          <div className="mb-3 flex flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <p className="flex items-center gap-1.5 text-base text-slate-400 dark:text-slate-500">
              <span className="inline-block h-3 w-3 shrink-0 rounded border-2 border-amber-300 dark:border-amber-500" />
              Yellow = in your inventory but not yet donated.
            </p>
            <p className="flex items-center gap-1.5 text-base text-slate-400 dark:text-slate-500">
              <span className="inline-block h-3 w-3 shrink-0 rounded border-2 border-amber-700 dark:border-amber-400" />
              Orange = available now to find, in season.
            </p>
            {!revealUndiscovered && (
              <p className="text-base text-slate-400 dark:text-slate-500">Dimmed = undiscovered.</p>
            )}
          </div>

          {!selectedCharacter ? (
            <p className="text-base italic text-slate-400 dark:text-slate-500">
              Load a save file to see items available to donate.
            </p>
          ) : toDonateSections.length === 0 ? (
            <p className="text-base italic text-slate-400 dark:text-slate-500">
              All known specimens have been donated — great work!
            </p>
          ) : (
            <div className="space-y-4">
              {toDonateSections.map(({ label, visibleItems, hiddenCount }) => (
                <div key={label}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {label}
                  </p>
                  {visibleItems.length === 0 ? (
                    <p className="text-base italic text-slate-400 dark:text-slate-500">
                      All discovered {label.toLowerCase()} specimens donated.
                      {hiddenCount > 0 && !revealUndiscovered && (
                        <> ({hiddenCount} undiscovered — toggle to reveal)</>
                      )}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {visibleItems.map((item) => (
                          <DonationItemIcon
                            key={item.id}
                            item={item}
                            inInventory={inventoryMap.has(item.id)}
                            inventoryAmount={inventoryMap.get(item.id) ?? 0}
                            discovered={discoveredItemIds.has(item.id)}
                            inSeason={
                              item.category === 'fish'
                                ? isFishAvailable(fishScheduleMap[item.id], currentSeasonIdx, day)
                                : item.category === 'mineral'
                                  ? isMineAccessible(mineralDataMap[item.id], pickaxeTier)
                                  : false
                            }
                            fishInfo={item.category === 'fish' ? fishScheduleMap[item.id] : undefined}
                            mineralInfo={item.category === 'mineral' ? mineralDataMap[item.id] : undefined}
                          />
                        ))}
                      </div>
                      {hiddenCount > 0 && !revealUndiscovered && (
                        <p className="mt-1.5 text-base italic text-slate-400 dark:text-slate-500">
                          +{hiddenCount} undiscovered {label.toLowerCase()} specimen{hiddenCount !== 1 ? 's' : ''} hidden — toggle to reveal.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Items already donated */}
        <DonatedSpecimensCard
          selectedCharacter={selectedCharacter}
          donatedSections={donatedSections}
          fishScheduleMap={fishScheduleMap}
          mineralDataMap={mineralDataMap}
        />
      </section>

      {/* Upgrade Progression */}
      <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Upgrade Progression</h2>
        <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
          Current tool tiers, building levels, and what to work on next.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <UpgradeStatusCard
            name="Gruff"
            role="Blacksmith · Tool Upgrades"
            toolNames={['watercan', 'hoe', 'pick', 'axe', 'scythe']}
            chipColor="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
            toolData={selectedCharacter?.tool_data ?? null}
          />
          <div className="flex flex-col gap-6">
            <UpgradeStatusCard
              name="Wilfred"
              role="Fisherman · Rod Upgrades"
              toolNames={['rod']}
              chipColor="bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
              toolData={selectedCharacter?.tool_data ?? null}
            />
            <BuildingStatusCard
              homeLevel={selectedCharacter?.home_level ?? null}
              homeConstructionDays={selectedCharacter?.home_construction_days ?? 0}
              barnData={selectedCharacter?.barn_data ?? []}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
