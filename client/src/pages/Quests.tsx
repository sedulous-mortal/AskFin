import { useEffect, useState } from 'react';
import { useDate } from '../context/DateContext';

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
  requirements: QuestItem[];
  reward_items: QuestItem[];
  is_town_quest: boolean | null;
  is_donation_quest: boolean | null;
  is_rootcellar_quest: boolean | null;
  is_vip_quest: boolean | null;
};

function toAbsDay(season: number, day: number): number {
  return season * 28 + (day - 1);
}

function isQuestActiveOnAbsDay(quest: Quest, absDay: number): boolean {
  if (
    quest.available_start_season === null ||
    quest.available_first_day === null ||
    quest.available_end_season === null ||
    quest.available_last_day === null
  ) {
    return true;
  }
  const qStart = toAbsDay(quest.available_start_season, quest.available_first_day);
  const qEnd = toAbsDay(quest.available_end_season, quest.available_last_day);
  if (qStart <= qEnd) {
    return absDay >= qStart && absDay <= qEnd;
  }
  return absDay >= qStart || absDay <= qEnd;
}

function isQuestInWindow(quest: Quest, currentSeasonIdx: number, currentDay: number): boolean {
  const current = toAbsDay(currentSeasonIdx, currentDay);
  for (let i = 0; i < WINDOW_SIZE; i++) {
    if (isQuestActiveOnAbsDay(quest, (current + i) % TOTAL_DAYS)) return true;
  }
  return false;
}

function daysUntilActive(quest: Quest, currentSeasonIdx: number, currentDay: number): number {
  const current = toAbsDay(currentSeasonIdx, currentDay);
  for (let i = 0; i < WINDOW_SIZE; i++) {
    if (isQuestActiveOnAbsDay(quest, (current + i) % TOTAL_DAYS)) return i;
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

type TypeInfo = { label: string; color: string };

function questTypeInfo(quest: Quest): TypeInfo {
  if (quest.is_vip_quest) return { label: 'VIP Quest', color: 'bg-purple-100 text-purple-800' };
  if (quest.is_donation_quest) return { label: 'Donation', color: 'bg-amber-100 text-amber-800' };
  if (quest.is_rootcellar_quest) return { label: 'Root Cellar', color: 'bg-emerald-100 text-emerald-800' };
  if (quest.is_town_quest) return { label: 'Town Quest', color: 'bg-sky-100 text-sky-800' };
  return { label: 'Side Quest', color: 'bg-slate-100 text-slate-600' };
}

export default function Quests() {
  const { season, day } = useDate();
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

  const upcomingQuests = allQuests
    .filter((q) => isQuestInWindow(q, currentSeasonIdx, day))
    .sort((a, b) => {
      const dA = daysUntilActive(a, currentSeasonIdx, day);
      const dB = daysUntilActive(b, currentSeasonIdx, day);
      if (dA !== dB) return dA - dB;
      return (a.display_title || a.name).localeCompare(b.display_title || b.name);
    });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Quests</h1>
        <p className="mt-2 text-lg text-slate-700">
          Quests available in the next 14 in-game days from{' '}
          <span className="font-semibold">
            {season} {day}
          </span>
          .
        </p>
      </header>

      {loading ? (
        <p className="text-slate-600">Loading quests...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : upcomingQuests.length === 0 ? (
        <p className="text-slate-600">No quests available in this 14-day window.</p>
      ) : (
        <div className="space-y-3">
          {upcomingQuests.map((quest) => {
            const { label, color } = questTypeInfo(quest);
            const daysAway = daysUntilActive(quest, currentSeasonIdx, day);
            const title = quest.display_title || quest.name;
            const availability = formatAvailability(quest);

            return (
              <div
                key={quest.id}
                className="overflow-hidden rounded-xl border border-slate-900/10 bg-white shadow-sm"
              >
                <div className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}
                      >
                        {label}
                      </span>
                      {daysAway === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          Active now
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          Starts in {daysAway} day{daysAway !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">{availability}</span>
                  </div>

                  <h2 className="mt-2 text-base font-semibold text-slate-900">{title}</h2>

                  {quest.description && (
                    <p className="mt-1 text-sm text-slate-600">{quest.description}</p>
                  )}

                  {quest.requirements && quest.requirements.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium uppercase tracking-wide text-slate-400">Requires</span>
                      {quest.requirements.map((req, i) => (
                        <span key={i} className="rounded bg-amber-50 px-2 py-0.5 text-amber-800">
                          {req.amount > 1 ? `${req.amount}× ` : ''}{req.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {(quest.reward_money || quest.reward_relationship_points || quest.reward_items?.length) ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium uppercase tracking-wide text-slate-400">Rewards</span>
                      {quest.reward_money ? (
                        <span className="rounded bg-slate-50 px-2 py-0.5 text-slate-600">
                          {quest.reward_money.toLocaleString()} coins
                        </span>
                      ) : null}
                      {quest.reward_relationship_points ? (
                        <span className="rounded bg-slate-50 px-2 py-0.5 text-slate-600">
                          +{quest.reward_relationship_points} relationship
                        </span>
                      ) : null}
                      {quest.reward_items?.map((item, i) => (
                        <span key={i} className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-800">
                          {item.amount > 1 ? `${item.amount}× ` : ''}{item.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
