import { useEffect, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth, type MatPileEntry } from '../context/AuthContext';
import { SpoilerOutcome } from '../components/SpoilerOutcome';

const SEASON_IDX: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'] as const;
const TOTAL_DAYS = 112;

type QuestItem = { name: string; amount: number };

type Quest = {
  id: number;
  name: string;
  description: string | null;
  display_title: string | null;
  available_start_season: number;
  available_first_day: number;
  available_end_season: number;
  available_last_day: number;
  requirements: QuestItem[];
  is_town_quest: boolean;
};

function ItemIcon({ name, amount, donated = 0 }: { name: string; amount: number; donated?: number }) {
  const safeName = name.replace(/ /g, '_');
  const paths = [`/items/${safeName}.png`, `/edibles/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const isDone = donated >= amount;
  const remaining = Math.max(0, amount - donated);

  return (
    <div
      className={`relative h-[84px] w-16 overflow-hidden rounded-lg border ${
        isDone
          ? 'border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-700/40'
          : 'border-indigo-200 bg-indigo-50 dark:border-indigo-700/50 dark:bg-indigo-900/20'
      }`}
      title={isDone ? `${name} — complete` : donated > 0 ? `${name} (${donated}/${amount} donated, ${remaining} remaining)` : name}
    >
      {pathIdx < paths.length ? (
        <img
          src={paths[pathIdx]}
          alt={name}
          className={`h-full w-full object-contain px-1 pt-1 pb-[20px] ${isDone ? 'opacity-30' : ''}`}
          onError={() => setPathIdx((i) => i + 1)}
        />
      ) : (
        <span className={`flex h-full w-full items-center justify-center text-center text-xs font-semibold leading-tight ${isDone ? 'text-slate-300 dark:text-slate-600' : 'text-indigo-400 dark:text-indigo-500'}`}>
          {initials}
        </span>
      )}
      {/* Diagonal strikethrough overlay for completed items */}
      {isDone && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 64 84"
          preserveAspectRatio="none"
        >
          <line x1="0" y1="0" x2="64" y2="84" stroke="white" strokeWidth="2.5" strokeOpacity="0.8" />
        </svg>
      )}
      <span className={`absolute bottom-0 right-0 inline-flex items-center justify-center rounded-tl px-1.5 py-0.5 text-[14px] font-bold ${
        isDone
          ? 'bg-slate-400/80 text-white dark:bg-slate-500/80'
          : 'bg-black/65 text-white'
      }`}>
        {isDone ? '✓' : remaining}
      </span>
    </div>
  );
}

type EventGroup = {
  startSeason: number;
  startDay: number;
  endSeason: number;
  endDay: number;
  options: Quest[];
};

// Manually-curated outcome synopses, keyed by quest ID.
// Fill these in with the outcome text for each binary choice.
const SYNOPSES: Record<number, string | null> = {
  350: null,  // Herb Garden
  439: null,  // Mushroom Hut
  582: "If you choose Fish Farm, the water next to the root cellar (in front of the waterfall) will become populated with a stock of fish daily. Those fish will not be sickly, but you will not have changed the chance of fishing up a sickly fish elsewhere across the map, it will remain as high as it was prior to completing the Fish Farm quest.",  // Fish Farm
  583: null,  // Redtide Remediation
  586: null,  // Predator Taming
  587: null,  // Hunting Party
  584: null,  // Crow Repellent
  585: null,  // Crow Traps
  615: null,  // Last Stand
};

// yearOffset is 0-based: Year 1 of gameplay = 0, Year 2 = 1, etc.
function toAbsDay(yearOffset: number, season: number, day: number): number {
  return yearOffset * TOTAL_DAYS + season * 28 + (day - 1);
}

function groupEvents(townQuests: Quest[]): EventGroup[] {
  const map = new Map<string, Quest[]>();
  for (const q of townQuests) {
    const key = `${q.available_start_season}-${q.available_first_day}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(q);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      const [aS, aD] = a.split('-').map(Number);
      const [bS, bD] = b.split('-').map(Number);
      return aS !== bS ? aS - bS : aD - bD;
    })
    .map(([, quests]) => ({
      startSeason: quests[0].available_start_season,
      startDay: quests[0].available_first_day,
      endSeason: quests[0].available_end_season,
      endDay: quests[0].available_last_day,
      options: quests,
    }));
}

export default function Events() {
  const { season, day } = useDate();
  const { selectedCharacter } = useAuth();
  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const completedQuestIds = new Set(
    (selectedCharacter?.quest_data ?? []).filter((q) => q.status === 3).map((q) => q.id),
  );

  // Build lookup: questID → item name → donated amount
  const matPileByQuest = new Map<number, Map<string, number>>();
  for (const pile of (selectedCharacter?.project_mat_pile_data ?? []) as MatPileEntry[]) {
    const itemMap = new Map<string, number>();
    for (const item of pile.donatedItems) itemMap.set(item.name, item.amount);
    matPileByQuest.set(pile.questID, itemMap);
  }

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
  const events = groupEvents(allQuests.filter((q) => q.is_town_quest));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Events
        </h1>
        <p className="mt-2 text-lg text-slate-700 dark:text-slate-300">
          Town events occur throughout the year. Each presents a binary choice — only one option can be completed per event.
        </p>
      </header>

      {loading ? (
        <p className="text-slate-600 dark:text-slate-400">Loading events...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <div className="space-y-6">
          {events.map((event, idx) => {
            const currentYearOffset = Math.max(0, (selectedCharacter?.current_year ?? 1) - 1);
            const absCurrent = toAbsDay(currentYearOffset, currentSeasonIdx, day);
            const absStart = toAbsDay(0, event.startSeason, event.startDay);
            const endYearOffset = event.endSeason < event.startSeason ? 1 : 0;
            const absEnd = toAbsDay(endYearOffset, event.endSeason, event.endDay);
            const isPast = absCurrent > absEnd;
            const isAvailableNow = absCurrent >= absStart && absCurrent <= absEnd;
            const daysAway = isAvailableNow || isPast ? 0 : absStart - absCurrent;
            const completedOption = event.options.find((q) => completedQuestIds.has(q.id));

            return (
              <div
                key={idx}
                className={`overflow-hidden rounded-xl bg-white shadow-sm dark:bg-slate-800 ${
                    completedOption
                      ? 'border-0'
                      : 'border border-slate-900/10 dark:border-slate-700'
                  }`}
              >
                {/* Event header row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                      Town Event {idx + 1}
                    </span>
                    {completedOption ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Completed — {completedOption.display_title || completedOption.name}
                      </span>
                    ) : isPast ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        Passed this year
                      </span>
                    ) : isAvailableNow ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-600">
                        Available now
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        In {daysAway} day{daysAway !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {SEASON_NAMES[event.startSeason]} {event.startDay}
                    {' '}–{' '}
                    {SEASON_NAMES[event.endSeason]} {event.endDay}
                  </span>
                </div>

                {/* Options — 2 columns for binary pairs, 1 column for solo */}
                <div
                  className={`grid ${
                    event.options.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {event.options.map((quest, optIdx) => {
                    const title = quest.display_title || quest.name;
                    const synopsis = SYNOPSES[quest.id];
                    const isChosen = completedQuestIds.has(quest.id);
                    const donationMap = matPileByQuest.get(quest.id) ?? new Map<string, number>();
                    // Round the corners that sit at the card's outer edge so the border
                    // curves naturally instead of being clipped by the parent overflow-hidden.
                    // Single option: whole bottom edge. Two-col desktop: outer bottom corner only.
                    const chosenCorners =
                      event.options.length === 1
                        ? 'rounded-b-xl'
                        : optIdx === 0
                        ? 'sm:rounded-bl-xl'
                        : 'rounded-b-xl sm:rounded-bl-none';

                    return (
                      <div
                        key={quest.id}
                        className={`flex gap-4 p-5 ${
                          isChosen
                            ? `border-[3px] border-green-800/55 dark:border-green-500/40 ${chosenCorners}`
                            : optIdx === 0 && event.options.length > 1
                            ? 'sm:border-r border-slate-100 dark:border-slate-700'
                            : optIdx > 0
                            ? 'border-t border-slate-100 sm:border-t-0 dark:border-slate-700'
                            : ''
                        }`}
                      >
                        {/* Left: text content */}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            {event.options.length > 1 && (
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Option {optIdx === 0 ? 'A' : 'B'}
                              </span>
                            )}
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                              {title}
                            </h3>
                            {isChosen && (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                Chosen
                              </span>
                            )}
                          </div>

                          {quest.description && (
                            <p className="mb-2 text-base text-slate-500 dark:text-slate-400">
                              {quest.description}
                            </p>
                          )}

                          {quest.requirements.length > 0 && (
                            <div className="mb-3 flex flex-wrap items-center gap-1.5">
                              {quest.requirements.map((req, i) => {
                                const donated = donationMap.get(req.name) ?? 0;
                                const isDone = donated >= req.amount;
                                const remaining = Math.max(0, req.amount - donated);
                                return (
                                  <span
                                    key={i}
                                    className={`rounded px-2 py-0.5 text-sm ${
                                      isDone
                                        ? 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                                        : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                    }`}
                                  >
                                    {isDone ? (
                                      <span className="relative inline-block">
                                        <span className="opacity-60">
                                          {req.amount > 1 ? `${req.amount}× ` : ''}{req.name}
                                        </span>
                                        <span
                                          className="pointer-events-none absolute inset-0 flex items-center"
                                          aria-hidden
                                        >
                                          <span className="block h-px w-full bg-current opacity-70" style={{ transform: 'rotate(-8deg)' }} />
                                        </span>
                                      </span>
                                    ) : (
                                      <>
                                        {remaining > 1 ? `${remaining}× ` : ''}{req.name}
                                        {donated > 0 && (
                                          <span className="ml-1 opacity-60 text-xs">({donated}/{req.amount})</span>
                                        )}
                                      </>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex flex-1">
                            {synopsis ? (
                              <SpoilerOutcome questId={quest.id} synopsis={synopsis} />
                            ) : (
                              <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-400 dark:bg-slate-700/50 dark:text-slate-500">
                                Outcome synopsis coming soon.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: requirement icons */}
                        {quest.requirements.length > 0 && (
                          <div className="flex-none">
                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Requires
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {quest.requirements.map((req, i) => (
                                <ItemIcon
                                  key={i}
                                  name={req.name}
                                  amount={req.amount}
                                  donated={donationMap.get(req.name) ?? 0}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
