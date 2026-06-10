import { useEffect, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';

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

function toAbsDay(yearOffset: number, season: number, day: number): number {
  return yearOffset * TOTAL_DAYS + season * 28 + (day - 1);
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
  if (quest.is_rootcellar_quest) return { label: 'Root Cellar', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' };
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
      className="relative h-16 w-16 overflow-hidden rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-700/50 dark:bg-indigo-900/20"
      title={name}
    >
      {pathIdx < paths.length ? (
        <img
          src={paths[pathIdx]}
          alt={name}
          className="h-full w-full object-contain p-1"
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
      className={`relative h-16 w-16 overflow-hidden rounded-lg border ${
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
          className="h-full w-full object-contain p-1"
          onError={() => setPathIdx((i) => i + 1)}
        />
      ) : (
        <span className={`flex h-full w-full items-center justify-center text-center text-xs font-semibold leading-tight ${
          isRel ? 'text-blue-400 dark:text-blue-500' : 'text-indigo-400 dark:text-indigo-500'
        }`}>
          {initials}
        </span>
      )}
      <span className={`absolute bottom-0 right-0 inline-flex items-center justify-center rounded-tl px-1.5 py-0.5 text-[13px] font-bold text-white ${
        isRel ? 'bg-blue-500/85' : 'bg-black/65'
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
      chip: <span className="rounded bg-slate-50 px-2 py-0.5 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-300">+20 relationship with Adeline</span>,
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
        chip: <span className="rounded bg-slate-50 px-2 py-0.5 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-300">{t}</span>,
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

  const { gridClass } = COL_CONFIGS[bestCols] ?? COL_CONFIGS[2];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-900/10 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
            {label}
          </span>
          {inProgressQuestIds.has(quest.id) ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              In progress
            </span>
          ) : daysAway === 0 ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-600">
              Available now
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              Starts in {daysAway} day{daysAway !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">{availability}</span>
      </div>

      {/* Body: left fills remaining space, right column sizes to estimated-optimal width */}
      <div className="flex min-h-0 p-5">

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
          <div
            className={`flex-none border-l border-slate-100 pl-4 dark:border-slate-700${reqs.length === 1 ? ' w-1/3' : ''}`}
            style={reqs.length === 1 ? undefined : { maxWidth: bestMaxW }}
          >
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
            <div className={`grid gap-1.5 ${gridClass}`}>
              {reqs.map((req, i) => (
                <ItemIcon key={i} name={req.name} amount={req.amount} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Upgrade tier data. Requirements are sampled from known quest data (Dig Deep, Iron Ore For Gruff,
// Fisher-Bun, Wels Catfish challenge). Exact coin costs and unlock conditions need verification
// from game files before this section goes live.
type UpgradeTier = {
  tier: number;
  label: string;
  requirements: { name: string; amount: number }[];
  note?: string;
};

const GRUFF_UPGRADE_TIERS: UpgradeTier[] = [
  {
    tier: 1,
    label: 'Copper Tools',
    requirements: [
      { name: 'Copper Ore', amount: 5 },
      { name: 'Coins', amount: 500 },
    ],
    note: 'Requires 1 day. Upgrades Watering Can, Hoe, and Pickaxe.',
  },
  {
    tier: 2,
    label: 'Iron Tools',
    requirements: [
      { name: 'Iron Ore', amount: 5 },
      { name: 'Coins', amount: 1500 },
    ],
    note: 'Requires 1 day. Iron Ore found in the Marsh mine shaft.',
  },
  {
    tier: 3,
    label: 'Gold Tools',
    requirements: [
      { name: 'Gold Ore', amount: 5 },
      { name: 'Coins', amount: 3000 },
    ],
    note: 'Requires 2 days. Deep mine access required.',
  },
];

const WILFRED_UPGRADE_TIERS: UpgradeTier[] = [
  {
    tier: 1,
    label: 'Copper Rod',
    requirements: [
      { name: 'Copper Ore', amount: 3 },
      { name: 'Coins', amount: 300 },
    ],
    note: 'Prerequisite: catch a Whitefish (Fisher-Bun quest). Unlocks medium lake spots.',
  },
  {
    tier: 2,
    label: 'Iron Rod',
    requirements: [
      { name: 'Iron Ore', amount: 3 },
      { name: 'Coins', amount: 1000 },
    ],
    note: 'Prerequisite: catch a Wels Catfish. Unlocks river and marsh fishing spots.',
  },
  {
    tier: 3,
    label: 'Gold Rod',
    requirements: [
      { name: 'Gold Ore', amount: 3 },
      { name: 'Coins', amount: 2500 },
    ],
    note: 'Unlocks deep forest and ocean fishing spots.',
  },
];

function UpgradeCard({ name, role, tiers, chipColor }: {
  name: string;
  role: string;
  tiers: UpgradeTier[];
  chipColor: string;
}) {
  return (
    <div className="rounded-xl border border-slate-900/10 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-semibold ${chipColor}`}>
          {name}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">{role}</span>
      </div>
      <div className="space-y-3">
        {tiers.map((tier) => (
          <div
            key={tier.tier}
            className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50"
          >
            <p className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Tier {tier.tier}: {tier.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tier.requirements.map((req, i) => (
                <span
                  key={i}
                  className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                >
                  {req.amount}× {req.name}
                </span>
              ))}
            </div>
            {tier.note && (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{tier.note}</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs italic text-slate-400 dark:text-slate-500">
        Sample tier data — exact requirements to be verified from game files.
      </p>
    </div>
  );
}

export default function Tips() {
  const { season, day } = useDate();
  const { selectedCharacter } = useAuth();

  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const currentSeasonIdx = SEASON_IDX[season] ?? 0;
  const currentYearOffset = Math.max(0, (selectedCharacter?.current_year ?? 1) - 1);
  const currentAbs = toAbsDay(currentYearOffset, currentSeasonIdx, day);

  const inProgressQuestIds = new Set(
    (selectedCharacter?.quest_data ?? []).filter((q) => q.status === 1).map((q) => q.id),
  );

  const activeQuests = allQuests.filter((q) => inProgressQuestIds.has(q.id));

  const donatedCount = selectedCharacter?.donated_specimen_count ?? 0;

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
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
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
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
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

        {/* Items-to-donate stub */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-5 dark:border-slate-700 dark:bg-slate-800/40">
          <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">Items available to donate</p>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Coming soon: once inventory data is read from your save file, this section will list
            items you're currently holding that you haven't donated to the museum yet — sorted by
            how close they get you to your next specimen milestone.
          </p>
          <div className="flex flex-wrap gap-2">
            {['Ancient Bone Fragment', 'Geode Crystal', 'Marsh Fern', 'Copper Butterfly', 'Deep Sea Snail'].map((name) => (
              <span
                key={name}
                className="rounded bg-slate-200 px-2 py-0.5 text-xs italic text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              >
                {name} ×?
              </span>
            ))}
            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs italic text-slate-400 dark:bg-slate-700 dark:text-slate-500">
              + more (sample — inventory reading pending)
            </span>
          </div>
        </div>
      </section>

      {/* Upgrade Progression */}
      <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Upgrade Progression</h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Tool and fishing rod upgrade tiers for Gruff and Wilfred. Upgrade queue detection
          (items you've already dropped off) is coming in a future update.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <UpgradeCard
            name="Gruff"
            role="Blacksmith · Tool Upgrades"
            tiers={GRUFF_UPGRADE_TIERS}
            chipColor="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
          />
          <UpgradeCard
            name="Wilfred"
            role="Fisherman · Rod Upgrades"
            tiers={WILFRED_UPGRADE_TIERS}
            chipColor="bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
          />
        </div>
      </section>
    </div>
  );
}
