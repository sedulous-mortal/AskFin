import React, { useEffect, useState } from 'react';
import { SpoilerGate } from '../components/SpoilerGate';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

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

// yearOffset is 0-based: Year 1 of gameplay = 0, Year 2 = 1, etc.
function toAbsDay(yearOffset: number, season: number, day: number): number {
  return yearOffset * TOTAL_DAYS + season * 28 + (day - 1);
}

// Quest data has no year — all quests are treated as Year 1 quests.
// If end_season < start_season the window crosses into Year 2 (e.g. Winter → Spring).
function questAbsDays(quest: Quest): [number, number] {
  const startAbs = toAbsDay(0, quest.available_start_season!, quest.available_first_day!);
  const endYearOffset = quest.available_end_season! < quest.available_start_season! ? 1 : 0;
  const endAbs = toAbsDay(endYearOffset, quest.available_end_season!, quest.available_last_day!);
  return [startAbs, endAbs];
}

function isQuestInWindow(quest: Quest, currentAbs: number): boolean {
  if (
    quest.available_start_season === null ||
    quest.available_first_day === null ||
    quest.available_end_season === null ||
    quest.available_last_day === null
  ) {
    return true;
  }
  const [startAbs, endAbs] = questAbsDays(quest);
  return startAbs <= currentAbs + WINDOW_SIZE - 1 && endAbs >= currentAbs;
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
  if (currentAbs >= startAbs && currentAbs <= endAbs) return 0;
  if (currentAbs < startAbs) return startAbs - currentAbs;
  return 0;
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

function isDonationQuestComplete(quest: Quest, donatedCount: number, completedIds: Set<number>): boolean {
  const threshold = donationThreshold(quest);
  if (threshold !== null) return donatedCount >= threshold;
  return completedIds.has(quest.id);
}

type TypeInfo = { label: string; color: string };

function questTypeInfo(quest: Quest): TypeInfo {
  if (quest.is_vip_quest) return { label: 'VIP Quest', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' };
  if (quest.is_donation_quest) return { label: 'Donation', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
  if (quest.is_rootcellar_quest) return { label: 'Root Cellar', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' };
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
            <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium ${color}`}>
              {label}
            </span>
            {inProgressQuestIds.has(quest.id) ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-0.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                In progress
              </span>
            ) : daysAway === 0 ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-0.5 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-600">
                Available now
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-0.5 text-sm font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                Starts in {daysAway} day{daysAway !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400">{availability}</span>
        </div>

        <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>

        {quest.description && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{quest.description}</p>
        )}

        {quest.requirements && quest.requirements.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Requires</span>
            {quest.requirements.map((req, i) => (
              <span key={i} className="rounded bg-amber-50 px-2.5 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
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
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Rewards</span>
              {isThresholdDonation && (
                <span className="rounded bg-slate-50 px-2.5 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  +20 relationship with Adeline
                </span>
              )}
              {quest.reward_money ? (
                <span className="rounded bg-slate-50 px-2.5 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {quest.reward_money.toLocaleString()} coins
                </span>
              ) : null}
              {!isThresholdDonation && quest.reward_relationship_points ? (
                quest.quest_giver ? (
                  <span className="rounded bg-slate-50 px-2.5 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    +{quest.reward_relationship_points} relationship with {quest.quest_giver}
                  </span>
                ) : (
                  <span className="rounded bg-amber-50 px-2.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    +{quest.reward_relationship_points} relationship — must be confirmed with Acute Owl Studio who this gain is with
                  </span>
                )
              ) : null}
              {quest.reward_items?.map((item, i) => (
                <span key={i} className="rounded bg-emerald-50 px-2.5 py-0.5 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
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

// Weekly Defender's Ration requirement from RootCellarManager.cs (days of food per season)
const RATION_DAYS: Record<number, [number, number, number, number]> = {
  0: [2, 4, 9, 14],   // Unsteady
  1: [4, 9, 19, 39],  // Grim (default)
  2: [7, 17, 29, 59], // Challenge
  3: [1, 2, 3, 4],    // Gentle
};
const DIFFICULTY_NAMES: Record<number, string> = {
  0: 'Unsteady',
  1: 'Grim',
  2: 'Challenge',
  3: 'Gentle',
};

function RootCellarInfo({ difficulty, currentSeasonIdx }: { difficulty: number | null; currentSeasonIdx: number }) {
  const days = difficulty !== null ? (RATION_DAYS[difficulty]?.[currentSeasonIdx] ?? null) : null;
  const diffName = difficulty !== null ? (DIFFICULTY_NAMES[difficulty] ?? null) : null;

  return (
    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-slate-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-slate-200">
      <p className="mb-1 font-semibold">Defender's Ration</p>
      <p>Collected every Sunday from Spring 8 onward. Requires herbivore and carnivore food in equal parts — one type can cover the other's deficit if needed.</p>
      <p className="mt-1.5 text-base text-slate-500 dark:text-slate-400">One day's worth of food is calculated as 150 stamina for herbivore and carnivore each, so 300 stamina total. Omnivore total value is always what's shown in the parentheses in-game when you click on an edible in inventory, and what the root cellar uses to determine contribution value.</p>
      {days !== null && diffName !== null ? (
        <p className="mt-1.5">
          This season on <span className="font-semibold">{diffName}</span> difficulty:{' '}
          <span className="font-bold">{days} days</span> of food per weekly delivery.
        </p>
      ) : (
        <p className="mt-1.5 italic text-slate-500 dark:text-slate-400">
          Load a save file to see your difficulty-specific requirement.
        </p>
      )}
    </div>
  );
}

function QuestColumn({
  title,
  quests,
  gated,
  gateLabel,
  emptyText,
  inProgressQuestIds,
  currentAbs,
  info,
}: {
  title: string;
  quests: Quest[];
  gated: boolean;
  gateLabel: string;
  emptyText: string;
  inProgressQuestIds: Set<number>;
  currentAbs: number;
  info?: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      {info}
      {gated ? (
        <SpoilerGate label={gateLabel} />
      ) : quests.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-3">
          {quests.map((quest) => (
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
  );
}

function CompletedQuestCard({ quest, rootCellarStatus }: { quest: Quest; rootCellarStatus?: number }) {
  const { label, color } = questTypeInfo(quest);
  const title = quest.display_title || quest.name;
  const failed = rootCellarStatus === 2;
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
      <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-0.5 text-sm font-medium ${color}`}>
        {label}
      </span>
      {failed ? (
        <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-3 py-0.5 text-sm font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
          Failed
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-3 py-0.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          Completed
        </span>
      )}
      <span className="group relative min-w-0">
        <span className="block truncate text-sm font-medium text-slate-600 dark:text-slate-300">{title}</span>
        <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-1 hidden w-max max-w-64 whitespace-normal rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 shadow-xl group-hover:block">
          {title}
        </div>
      </span>
    </div>
  );
}

function CompletedQuestColumn({
  title,
  quests,
  emptyText,
  rootCellarHistoryMap,
}: {
  title: string;
  quests: Quest[];
  emptyText: string;
  rootCellarHistoryMap?: Map<number, number>;
}) {
  return (
    <section className="pl-2">
      <h3 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {quests.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
          {emptyText}
        </p>
      ) : (
        <div className="flex flex-col items-start gap-1.5">
          {quests.map((quest) => (
            <CompletedQuestCard
              key={quest.id}
              quest={quest}
              rootCellarStatus={rootCellarHistoryMap?.get(quest.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Quests() {
  const { season, day } = useDate();
  const { selectedCharacter } = useAuth();
  const { preferences } = useSettings();
  const showVillagerQuests = preferences.spoilers.show_undiscovered_villager_quests;
  const showCommunityQuests = preferences.spoilers.show_undiscovered_community_quests;

  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTownQuests, setShowTownQuests] = useState(false);

  const inProgressQuestIds = new Set(
    (selectedCharacter?.quest_data ?? []).filter((q) => q.status === 1).map((q) => q.id),
  );
  const completedQuestIds = new Set(
    (selectedCharacter?.quest_data ?? []).filter((q) => q.status === 3).map((q) => q.id),
  );
  // Tracks root cellar quest outcomes including failures (status 2) for history display
  const rootCellarHistoryMap = new Map<number, number>(
    (selectedCharacter?.quest_data ?? [])
      .filter((q) => q.status === 2 || q.status === 3)
      .map((q) => [q.id, q.status]),
  );

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

  const donatedSpecimenCount = selectedCharacter?.donated_specimen_count ?? 0;

  const upcoming = allQuests.filter((q) => {
    if (!isQuestInWindow(q, currentAbs)) return false;
    if (q.is_rootcellar_quest) return true; // always show for planning
    if (q.is_donation_quest) {
      if (q.id === 1331) return false; // "Research" hidden — its reward shown on each tier card instead
      const threshold = donationThreshold(q);
      if (threshold !== null) return donatedSpecimenCount < threshold;
      // Non-threshold donation quests (no number in name): only show if actively in progress.
      // Status 0 (never activated) should not appear as "Available now".
      if (!selectedCharacter) return true;
      return inProgressQuestIds.has(q.id);
    }
    return !completedQuestIds.has(q.id);
  });

  function sortUpcoming(quests: Quest[]) {
    return [...quests].sort((a, b) => {
      const aProgress = inProgressQuestIds.has(a.id) ? 0 : 1;
      const bProgress = inProgressQuestIds.has(b.id) ? 0 : 1;
      if (aProgress !== bProgress) return aProgress - bProgress;
      const dA = daysUntilActive(a, currentAbs);
      const dB = daysUntilActive(b, currentAbs);
      if (dA !== dB) return dA - dB;
      return (a.display_title || a.name).localeCompare(b.display_title || b.name);
    });
  }

  const rootCellarQuests = sortUpcoming(upcoming.filter((q) => q.is_rootcellar_quest));

  const donationQuests = [...upcoming.filter((q) => q.is_donation_quest)].sort((a, b) => {
    const aProgress = inProgressQuestIds.has(a.id) ? 0 : 1;
    const bProgress = inProgressQuestIds.has(b.id) ? 0 : 1;
    if (aProgress !== bProgress) return aProgress - bProgress;
    return donationSortKey(a) - donationSortKey(b);
  });

  const sideQuests = sortUpcoming(
    upcoming.filter((q) => !q.is_rootcellar_quest && !q.is_donation_quest && !q.is_town_quest),
  );

  // Mutually exclusive town quest pairs: if one is chosen (in progress or completed), hide the other.
  const MUTEX_PAIRS: [number, number][] = [
    [350, 439],  // Herb Garden / Mushroom Hut
    [582, 583],  // Fish Farm / Redtide Remediation
    [584, 585],  // Crow Repellent / Crow Traps
    [586, 587],  // Predator Taming / Hunting Party
  ];
  const chosenIds = new Set([...inProgressQuestIds, ...completedQuestIds]);
  const hiddenAlternativeIds = new Set<number>();
  for (const [a, b] of MUTEX_PAIRS) {
    if (chosenIds.has(a)) hiddenAlternativeIds.add(b);
    if (chosenIds.has(b)) hiddenAlternativeIds.add(a);
  }

  // Town quests bypass the 14-day window — show all unchosen future pairs so players can plan ahead.
  const townQuests = sortUpcoming(
    allQuests.filter((q) => {
      if (!q.is_town_quest) return false;
      if (hiddenAlternativeIds.has(q.id)) return false;
      if (completedQuestIds.has(q.id)) return false;
      if (q.available_end_season !== null && q.available_start_season !== null && q.available_last_day !== null) {
        const endYearOffset = q.available_end_season < q.available_start_season ? 1 : 0;
        const endAbs = toAbsDay(endYearOffset, q.available_end_season, q.available_last_day);
        if (endAbs < currentAbs) return false;
      }
      return true;
    }),
  );

  const completedDonationQuests = allQuests
    .filter((q) => q.is_donation_quest && q.id !== 1331 && isDonationQuestComplete(q, donatedSpecimenCount, completedQuestIds))
    .sort((a, b) => donationSortKey(a) - donationSortKey(b));

  const completedSideQuests = allQuests
    .filter((q) => !q.is_rootcellar_quest && !q.is_donation_quest && !q.is_town_quest && completedQuestIds.has(q.id))
    .sort((a, b) => (a.display_title || a.name).localeCompare(b.display_title || b.name));

  const completedTownQuests = allQuests
    .filter((q) => q.is_town_quest && completedQuestIds.has(q.id))
    .sort((a, b) => (a.display_title || a.name).localeCompare(b.display_title || b.name));

  const completedRootCellarQuests = allQuests
    .filter((q) => q.is_rootcellar_quest && rootCellarHistoryMap.has(q.id))
    .sort((a, b) => donationSortKey(a) - donationSortKey(b));

  const totalCompleted =
    completedDonationQuests.length +
    completedSideQuests.length +
    completedTownQuests.length +
    completedRootCellarQuests.length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Quests
        </h1>
        <p className="mt-2 text-lg text-slate-700 dark:text-slate-300">
          Quests available in the next 14 in-game days from{' '}
          <span className="font-semibold">
            {season} {day}
          </span>
          .
        </p>
      </header>

      {loading ? (
        <p className="text-slate-600 dark:text-slate-400">Loading quests...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <>
          {/* Root Cellar — full width */}
          <QuestColumn
            title="Root Cellar"
            quests={rootCellarQuests}
            gated={!showVillagerQuests}
            gateLabel="Root Cellar quests"
            emptyText="No Root Cellar quests in the next 14 days."
            inProgressQuestIds={inProgressQuestIds}
            currentAbs={currentAbs}
            info={
              <RootCellarInfo
                difficulty={selectedCharacter?.difficulty ?? null}
                currentSeasonIdx={currentSeasonIdx}
              />
            }
          />

          {/* Donation + Side Quests (+ optional Town Quests) */}
          <div>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTownQuests((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  showTownQuests
                    ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-600 dark:bg-sky-900/20 dark:text-sky-300'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-sky-600 dark:hover:text-sky-400'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-bold transition-colors ${
                    showTownQuests
                      ? 'border-sky-500 bg-sky-500 text-white'
                      : 'border-slate-400 text-transparent dark:border-slate-500'
                  }`}
                >
                  ✓
                </span>
                Show Town Quests (Events)
              </button>
            </div>

            <div className={`grid grid-cols-1 gap-6 ${showTownQuests ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              <QuestColumn
                title="Donations for Research"
                quests={donationQuests}
                gated={!showVillagerQuests}
                gateLabel="Donation quests"
                emptyText="No Donation quests in the next 14 days."
                inProgressQuestIds={inProgressQuestIds}
                currentAbs={currentAbs}
              />
              <QuestColumn
                title="Villager Side Quests"
                quests={sideQuests}
                gated={!showVillagerQuests}
                gateLabel="Side quests"
                emptyText="No side quests in the next 14 days."
                inProgressQuestIds={inProgressQuestIds}
                currentAbs={currentAbs}
              />
              {showTownQuests && (
                <QuestColumn
                  title="Town Quests (Events)"
                  quests={townQuests}
                  gated={!showCommunityQuests}
                  gateLabel="Town quests"
                  emptyText="No town quests in the next 14 days."
                  inProgressQuestIds={inProgressQuestIds}
                  currentAbs={currentAbs}
                />
              )}
            </div>
          </div>

          {/* Completed Quests — always visible regardless of spoiler settings */}
          {totalCompleted > 0 && (() => {
            const hasRootCellar = completedRootCellarQuests.length > 0;
            const colCount = 2 + (hasRootCellar ? 1 : 0) + (showTownQuests ? 1 : 0);
            const gridClass = colCount === 4 ? 'md:grid-cols-4' : colCount === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
            return (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                  Completed Quests ({totalCompleted})
                </h2>
                <div className={`grid grid-cols-1 gap-6 ${gridClass}`}>
                  <CompletedQuestColumn
                    title="Donations for Research"
                    quests={completedDonationQuests}
                    emptyText="No donation quests completed."
                  />
                  <CompletedQuestColumn
                    title="Villager Side Quests"
                    quests={completedSideQuests}
                    emptyText="No side quests completed."
                  />
                  {hasRootCellar && (
                    <CompletedQuestColumn
                      title="Root Cellar History"
                      quests={completedRootCellarQuests}
                      rootCellarHistoryMap={rootCellarHistoryMap}
                      emptyText=""
                    />
                  )}
                  {showTownQuests && (
                    <CompletedQuestColumn
                      title="Town Quests (Events)"
                      quests={completedTownQuests}
                      emptyText="No town quests completed."
                    />
                  )}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
