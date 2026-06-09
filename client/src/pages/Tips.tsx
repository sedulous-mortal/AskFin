import { useEffect, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';

const SEASON_IDX: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
const TOTAL_DAYS = 112;
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

function QuestCard({
  quest,
  inProgressQuestIds,
  currentAbs,
}: {
  quest: Quest;
  inProgressQuestIds: Set<number>;
  currentAbs: number;
}) {
  const { label, color } = questTypeInfo(quest);
  const daysAway = daysUntilActive(quest, currentAbs);
  const title = quest.display_title || quest.name;
  const availability = formatAvailability(quest);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-900/10 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
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

        <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>

        {quest.description && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{quest.description}</p>
        )}

        {quest.requirements && quest.requirements.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Requires</span>
            {quest.requirements.map((req, i) => (
              <span key={i} className="rounded bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {req.amount > 1 ? `${req.amount}× ` : ''}{req.name}
              </span>
            ))}
          </div>
        )}

        {(() => {
          const isThresholdDonation = Boolean(quest.is_donation_quest && donationThreshold(quest) !== null);
          const hasRewards = quest.reward_money || quest.reward_relationship_points || quest.reward_items?.length || isThresholdDonation;
          if (!hasRewards) return null;
          return (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Rewards</span>
              {isThresholdDonation && (
                <span className="rounded bg-slate-50 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  +20 relationship with Adeline
                </span>
              )}
              {quest.reward_money ? (
                <span className="rounded bg-slate-50 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {quest.reward_money.toLocaleString()} coins
                </span>
              ) : null}
              {!isThresholdDonation && quest.reward_relationship_points ? (
                quest.quest_giver ? (
                  <span className="rounded bg-slate-50 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    +{quest.reward_relationship_points} relationship with {quest.quest_giver}
                  </span>
                ) : (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    +{quest.reward_relationship_points} relationship — must be confirmed with Acute Owl Studio who this gain is with
                  </span>
                )
              ) : null}
              {quest.reward_items?.map((item, i) => (
                <span key={i} className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {item.amount > 1 ? `${item.amount}× ${item.name}` : `${item.name} (1)`}
                </span>
              ))}
            </div>
          );
        })()}
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
