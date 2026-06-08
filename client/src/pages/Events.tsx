import { useEffect, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
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

function toAbsDay(season: number, day: number): number {
  return season * 28 + (day - 1);
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
            const absCurrent = toAbsDay(currentSeasonIdx, day);
            const absStart = toAbsDay(event.startSeason, event.startDay);
            const absEnd = toAbsDay(event.endSeason, event.endDay);
            const isPast = absCurrent > absEnd;
            const isAvailableNow = absCurrent >= absStart && absCurrent <= absEnd;
            const daysAway = isAvailableNow || isPast ? 0 : absStart - absCurrent;
            const completedOption = event.options.find((q) => completedQuestIds.has(q.id));

            return (
              <div
                key={idx}
                className="overflow-hidden rounded-xl border border-slate-900/10 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
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
                  className={`grid divide-slate-100 dark:divide-slate-700 ${
                    event.options.length > 1
                      ? 'grid-cols-1 sm:grid-cols-2 sm:divide-x'
                      : 'grid-cols-1'
                  }`}
                >
                  {event.options.map((quest, optIdx) => {
                    const title = quest.display_title || quest.name;
                    const synopsis = SYNOPSES[quest.id];
                    const isChosen = completedQuestIds.has(quest.id);

                    return (
                      <div
                        key={quest.id}
                        className={`p-5 ${
                          isChosen
                            ? 'bg-emerald-50/50 dark:bg-emerald-900/10'
                            : optIdx > 0
                            ? 'border-t border-slate-100 sm:border-t-0 dark:border-slate-700'
                            : ''
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          {event.options.length > 1 && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Option {optIdx === 0 ? 'A' : 'B'}
                            </span>
                          )}
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {title}
                          </h3>
                          {isChosen && (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              Chosen
                            </span>
                          )}
                        </div>

                        {quest.description && (
                          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                            {quest.description}
                          </p>
                        )}

                        {quest.requirements.length > 0 && (
                          <div className="mb-3 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Requires
                            </span>
                            {quest.requirements.map((req, i) => (
                              <span
                                key={i}
                                className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                              >
                                {req.amount > 1 ? `${req.amount}× ` : ''}
                                {req.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {synopsis ? (
                          <SpoilerOutcome questId={quest.id} synopsis={synopsis} />
                        ) : (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-400 dark:bg-slate-700/50 dark:text-slate-500">
                            Outcome synopsis coming soon.
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
