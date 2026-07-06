import { useEffect, useState, useContext, createContext, useMemo, type ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useDate } from '../context/DateContext';
import { useAuth, ToolData, BarnData, MuseumItem, type MatPileEntry, type CropEntry, type ChestEntry, buildStorageMap, buildStorageMapByName, buildProcessorMapByName, buildContributedMapByName, buildInventoryMapByName } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useDevice } from '../context/DeviceContext';
import { SpoilerGate } from '../components/SpoilerGate';
import calendarEventsData from '../data/calendar_events.json';
import villagerGiftsData from '../data/villager_gifts.json';
import researchRewardsData from '../data/research_rewards.json';
import { fetchCritters, type Critter, type CritterFood } from '../api/critters';
import { CUSTOM_CRITTER_FOODS } from '../data/critterCustomFoods';
import { daysRemainingInRange } from '../utils/seasonalRange';
import processorDataJson from '../data/processor_data.json';

const SEASON_IDX: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'] as const;
const TOTAL_DAYS = 112;
const EVENT_ALERT_DAYS = 14;

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

type ForageableEntry = {
  id: number;
  item_id?: number;
  name?: string;
  type: string;
  source?: string;
  start_season: number;
  start_day: number;
  end_season: number;
  end_day: number;
  locations?: string[];
  forage_start_season?: number;
  forage_start_day?: number;
  forage_end_season?: number;
  forage_end_day?: number;
  daysToMaturity?: number | null;
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

function isForageableAvailable(f: ForageableEntry | undefined, seasonIdx: number, day: number): boolean {
  if (!f) return false;
  const startAbs = f.start_season * 28 + (f.start_day - 1);
  const endAbs = f.end_season * 28 + (f.end_day - 1);
  const currentAbs = seasonIdx * 28 + (day - 1);
  if (endAbs >= startAbs) return currentAbs >= startAbs && currentAbs <= endAbs;
  return currentAbs >= startAbs || currentAbs <= endAbs;
}

function isDisappearingSoon(
  endSeason: number | null,
  endDay: number | null,
  currentSeasonIdx: number,
  currentDay: number,
  inSeason: boolean,
): boolean {
  if (!inSeason || endSeason === null || endDay === null) return false;
  const currentAbs = currentSeasonIdx * 28 + (currentDay - 1);
  const endAbs = endSeason * 28 + (endDay - 1);
  const remaining = endAbs - currentAbs;
  return remaining >= 0 && remaining <= 4;
}

function isExclusivelyDeepWoods(locations: string[] | null | undefined): boolean {
  return !!locations && locations.length > 0 && locations.every((l) => l === 'Deep Woods');
}

type FestivalShopItem = { name: string; qty: number };

type CalendarEventEntry = {
  name: string;
  season: number;
  day: number;
  type: 'festival' | 'story' | 'birthday';
  shopItems?: FestivalShopItem[];
};

function getUpcomingEvents(seasonIdx: number, day: number): Array<CalendarEventEntry & { daysUntil: number }> {
  const all: CalendarEventEntry[] = [
    ...calendarEventsData.festivals.map((e) => ({ ...e, type: 'festival' as const, shopItems: (e as { shopItems?: FestivalShopItem[] }).shopItems ?? [] })),
    ...calendarEventsData.storyEvents.map((e) => ({ ...e, type: 'story' as const })),
    ...(calendarEventsData.villagerBirthdays as Array<{ name: string; season: number; day: number }>).map(
      (e) => ({ ...e, type: 'birthday' as const }),
    ),
  ];
  const currentAbsDay = seasonIdx * 28 + (day - 1);
  return all
    .map((event) => {
      const eventAbsDay = event.season * 28 + (event.day - 1);
      const daysUntil = (eventAbsDay - currentAbsDay + TOTAL_DAYS) % TOTAL_DAYS;
      return { ...event, daysUntil };
    })
    .filter((e) => e.daysUntil <= EVENT_ALERT_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil);
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

function AppTooltip({ children, content, width = 'w-44' }: {
  children: React.ReactNode;
  content: React.ReactNode;
  width?: string;
}) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="top"
          sideOffset={8}
          className={`${width} z-50 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2.5 shadow-xl`}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-slate-700" width={8} height={4} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function ItemIcon({ name, amount, donated = 0, storageCount, processorCount, contributedCount }: { name: string; amount: number; donated?: number; storageCount?: number; processorCount?: number; contributedCount?: number }) {
  const safeName = name.replace(/ /g, '_');
  const paths = [`/dishes/${safeName}.png`, `/processed_foods/${safeName}.png`, `/fish/${safeName}.png`, `/items/${safeName}.png`, `/edibles/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const isDone = donated >= amount;
  const remaining = Math.max(0, amount - donated);

  const tooltipContent = (
    <>
      <div className="text-slate-200 text-sm font-semibold mb-1.5 leading-tight">{name}</div>
      {isDone ? (
        <div className="text-emerald-400 text-sm">Complete ✓</div>
      ) : donated > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">Donated</span>
            <span className="text-white text-sm">{donated}/{amount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">Remaining</span>
            <span className="text-white text-sm">{remaining}</span>
          </div>
        </div>
      ) : null}
      {storageCount !== undefined && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-slate-400 text-sm">Storage</span>
          <span className="font-semibold text-amber-300 text-sm">{storageCount}</span>
        </div>
      )}
      {processorCount !== undefined && processorCount > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-slate-400 text-sm">Processing</span>
          <span className="font-semibold text-sky-300 text-sm">{processorCount}</span>
        </div>
      )}
      {contributedCount !== undefined && contributedCount > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-slate-400 text-sm">Contributed</span>
          <span className="font-semibold text-rose-300 text-sm">{contributedCount}</span>
        </div>
      )}
    </>
  );

  return (
    <AppTooltip content={tooltipContent}>
      <div
        className={`relative h-[84px] w-16 overflow-hidden rounded-lg border ${
          isDone
            ? 'border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-700/40'
            : 'border-indigo-200 bg-indigo-50 dark:border-indigo-700/50 dark:bg-indigo-900/20'
        }`}
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
          isDone ? 'bg-slate-400/80 text-white dark:bg-slate-500/80' : 'bg-black/65 text-white'
        }`}>
          {isDone ? '✓' : remaining}
        </span>
      </div>
    </AppTooltip>
  );
}

const RARITY_COLOR: Record<string, string> = {
  Abundant:      'text-white',
  Common:        'text-[#1eff00]',
  Uncommon:      'text-[#4fc3f7]',
  Rare:          'text-[#a335ee]',
  Extraordinary: 'text-[#ff8000]',
  Junk:          'text-[#9d9d9d]',
};

// Single source of truth for location name colours — update here to change everywhere
// Compound names inherit the colour of their first meaningful word.
const LOCATION_COLOR: Record<string, string> = {
  'Deep Woods':     'text-green-400',
  Farm:             'text-amber-400',
  'Farm Coast':     'text-amber-400',
  'Farm River':     'text-amber-400',
  Forest:           'text-emerald-400',
  'Forest Lake':    'text-emerald-400',
  'Forest River':   'text-emerald-400',
  Marsh:            'text-teal-300',
  'Marsh Coast':    'text-teal-300',
  'The Marsh':      'text-teal-300',
  Mountain:         'text-cyan-400',
  Mountains:        'text-cyan-400',
  'Mountain Lake':  'text-cyan-400',
  'Mountain River': 'text-cyan-400',
  Town:             'text-violet-400',
  'Town Coast':     'text-violet-400',
  Village:          'text-violet-400',
  'Village Lake':   'text-violet-400',
};

type MapBox = { left: number; top: number; width: number; height: number };
type MapEntry = { boxes: MapBox[]; note?: string };

// Percentage-based highlight boxes (left/top/width/height as % of the map image).
// These correspond to the circled areas on the Grimshire world map screenshot.
const MAP_HIGHLIGHTS: Record<string, MapEntry> = {
  'Forest River': { boxes: [
    { left: 18.5, top: 30.3, width: 8.2,  height: 14.2 },
    { left: 36.2, top: 45.6, width: 7.8,  height: 12.7 },
  ]},
  'Forest Lake': { boxes: [
    { left: 25.5, top: 35.7, width: 13.8, height: 15.5 },
  ]},
  'Farm River': { boxes: [
    { left: 49.2, top: 68.7, width: 5.7,  height: 11.5 },
  ]},
  'Mountain River': { boxes: [
    { left: 69.0, top: 11.4, width: 6.3,  height: 12.1 },
    { left: 70.7, top: 25.6, width: 5.8,  height:  8.8 },
  ]},
  'Mountain Lake': { boxes: [
    { left: 77.2, top:  4.7, width: 17.7, height: 16.2 },
  ]},
  'Marsh': { boxes: [
    { left:  1.3, top: 67.4, width: 26.0, height: 31.0 },
  ]},
  'Marsh Coast': { boxes: [
    { left: 11.6, top: 87.3, width: 18.6, height: 10.8 },
  ]},
  'Farm Coast': { boxes: [
    { left: 31.1, top: 78.8, width: 25.5, height: 19.5 },
  ]},
  'Town Coast': { boxes: [
    { left: 63.2, top: 82.2, width: 34.9, height: 16.2 },
  ]},
  'Village Lake': { boxes: [
    { left: 72.5, top: 48.5, width:  9.1, height: 11.5 },
    { left: 72.5, top: 61.3, width:  9.9, height: 10.8 },
    { left: 72.9, top: 73.4, width: 10.8, height: 11.5 },
  ]},
  'Deep Woods': {
    boxes: [
      { left: 16.5, top: 68.0, width: 3.5, height: 5.0 },
    ],
    note: 'Once inside the Deep Woods, head all the way west to reach the fishable water.',
  },
};

const MapLocationContext = createContext<((loc: string) => void) | null>(null);

function LocationText({ loc }: { loc: string }) {
  const openMap = useContext(MapLocationContext);
  const color = LOCATION_COLOR[loc] ?? 'text-white';
  if (openMap && MAP_HIGHLIGHTS[loc]) {
    return (
      <button
        className={`${color} underline decoration-dotted underline-offset-2 hover:opacity-75`}
        onClick={() => openMap(loc)}
      >
        {loc}
      </button>
    );
  }
  return <span className={color}>{loc}</span>;
}

function MapModal({ location, onClose }: { location: string; onClose: () => void }) {
  const entry = MAP_HIGHLIGHTS[location];
  const boxes = entry?.boxes ?? [];
  const note = entry?.note;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="relative overflow-hidden rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <img
            src="/map-grimshire.png"
            alt="Grimshire world map"
            className="block max-h-[85vh] max-w-[90vw] w-auto"
          />
          {boxes.map((h, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{
                left:   `${h.left}%`,
                top:    `${h.top}%`,
                width:  `${h.width}%`,
                height: `${h.height}%`,
                border: '2px solid #facc15',
                borderRadius: '3px',
                backgroundColor: 'rgba(250,204,21,0.15)',
                boxShadow: '0 0 0 3px rgba(250,204,21,0.3)',
              }}
            />
          ))}
        </div>
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-900/95 to-transparent px-4 pt-6 pb-3">
          {note && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-500/20 border border-amber-400/40 px-3 py-2">
              <svg className="mt-0.5 shrink-0 w-4 h-4 text-amber-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <circle cx="10" cy="6.5" r="1" fill="currentColor"/>
                <rect x="9.1" y="9" width="1.8" height="5.5" rx="0.9" fill="currentColor"/>
              </svg>
              <span className="text-amber-100 text-xs leading-snug">{note}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold text-sm">{location} — highlighted on map</span>
            <button
              onClick={onClose}
              className="ml-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  wall:  'Mine wall drop',
  vein:  'Ore vein',
  gem:   'Gem vein',
  floor: 'Cave floor drop',
};

const TOOLTIP_SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'];

function FishTooltipContent({ fish }: { fish: FishScheduleEntry }) {
  if (!fish.locations) return null;
  const appearsOn = fish.start_season !== null && fish.start_day !== null
    ? `${TOOLTIP_SEASON_NAMES[fish.start_season]} ${fish.start_day}`
    : null;
  const disappearsOn = fish.end_season !== null && fish.end_day !== null
    ? `${TOOLTIP_SEASON_NAMES[fish.end_season]} ${fish.end_day}`
    : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 text-sm">Size</span>
        <span className="font-medium text-white text-sm">{fish.size ?? '—'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 text-sm">Rarity</span>
        <span className={`font-semibold text-sm ${RARITY_COLOR[fish.rarity ?? ''] ?? 'text-slate-300'}`}>
          {fish.rarity ?? '—'}
        </span>
      </div>
      {appearsOn && (
        <div>
          <div className="text-slate-400 text-sm mb-0.5">Appears on</div>
          <div className="text-white text-sm">{appearsOn}</div>
        </div>
      )}
      {disappearsOn && (
        <div>
          <div className="text-slate-400 text-sm mb-0.5">Disappears on</div>
          <div className="text-white text-sm">{disappearsOn}</div>
        </div>
      )}
      <div className="flex items-baseline gap-1.5 pt-0.5">
        <span className="shrink-0 text-slate-400 text-sm">Locations</span>
        <span className="text-sm leading-snug">
          {fish.locations.map((loc, i) => (
            <span key={loc}>{i > 0 && <span className="text-slate-300">, </span>}<span className="inline-block whitespace-nowrap"><LocationText loc={loc} /></span></span>
          ))}
        </span>
      </div>
    </div>
  );
}

function MineralTooltipContent({ mineral }: { mineral: MineralInfo }) {
  return (
    <div className="space-y-1.5">
      <div className="text-slate-400 text-sm">{SOURCE_LABEL[mineral.source] ?? mineral.source}</div>
      <div className="space-y-1">
        {mineral.entries.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className={`font-semibold text-sm ${LOCATION_COLOR[e.mine] ?? 'text-slate-300'}`}>
              {e.mine} Mine
            </span>
            <span className="text-slate-400 text-sm">floors {e.floors}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlantTooltipContent({ plant }: { plant?: ForageableEntry }) {
  if (!plant) {
    return (
      <div className="text-slate-400 text-xs italic">
        Season data not yet mapped for this item.
      </div>
    );
  }
  const isBoth = plant.source === 'both';
  const isFarmable = plant.source === 'farmable';
  const plantStart = `${TOOLTIP_SEASON_NAMES[plant.start_season]} ${plant.start_day}`;
  const plantEnd = `${TOOLTIP_SEASON_NAMES[plant.end_season]} ${plant.end_day}`;
  const hasForageWindow = isBoth
    && plant.forage_start_season != null && plant.forage_start_day != null
    && plant.forage_end_season != null && plant.forage_end_day != null;
  const forageStart = hasForageWindow
    ? `${TOOLTIP_SEASON_NAMES[plant.forage_start_season!]} ${plant.forage_start_day}`
    : null;
  const forageEnd = hasForageWindow
    ? `${TOOLTIP_SEASON_NAMES[plant.forage_end_season!]} ${plant.forage_end_day}`
    : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 text-sm">Type</span>
        <span className="font-medium text-white text-sm">{plant.type}</span>
      </div>

      {(isFarmable || isBoth) && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">Plant from</span>
            <span className="text-white text-sm">{plantStart}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">Last plant</span>
            <span className="text-white text-sm">{plantEnd}</span>
          </div>
        </>
      )}

      {hasForageWindow && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">Forage Available</span>
            <span className="text-white text-sm">{forageStart}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">Forage Disappears</span>
            <span className="text-white text-sm">{forageEnd}</span>
          </div>
          {plant.locations && plant.locations.length > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-slate-400 text-sm">Locations</span>
              <span className="text-sm leading-snug">
                {plant.locations.map((loc, i) => (
                  <span key={loc}>{i > 0 && <span className="text-slate-300">, </span>}<span className="inline-block whitespace-nowrap"><LocationText loc={loc} /></span></span>
                ))}
              </span>
            </div>
          )}
        </>
      )}

      {!isFarmable && !isBoth && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">Forage Available</span>
            <span className="text-white text-sm">{plantStart}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-sm">Forage Disappears</span>
            <span className="text-white text-sm">{plantEnd}</span>
          </div>
          {plant.locations && plant.locations.length > 0 && (
            <div className="flex items-baseline gap-1.5 pt-0.5">
              <span className="shrink-0 text-slate-400 text-sm">Locations</span>
              <span className="text-sm leading-snug">
                {plant.locations.map((loc, i) => (
                  <span key={loc}>{i > 0 && <span className="text-slate-300">, </span>}<span className="inline-block whitespace-nowrap"><LocationText loc={loc} /></span></span>
                ))}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CritterFoodTooltipContent({ food, forageableInfo, inventoryCount, storageCount, processorCount }: {
  food: CritterFood;
  forageableInfo?: ForageableEntry;
  inventoryCount?: number;
  storageCount?: number;
  processorCount?: number;
}) {
  return (
    <>
      <div className="text-slate-200 text-sm font-semibold mb-1.5 leading-tight">{food.name}</div>
      {food.locationHint ? (
        <>
          <div className="text-slate-300 text-sm leading-snug">{food.locationHint}</div>
          {food.coinCost != null && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-slate-400 text-sm">Cost</span>
              <span className="font-semibold text-amber-300 text-sm">{food.coinCost.toLocaleString()} Coins</span>
            </div>
          )}
        </>
      ) : forageableInfo ? (
        <PlantTooltipContent plant={forageableInfo} />
      ) : null}
      {inventoryCount !== undefined && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-slate-400 text-sm">Inventory:</span>
          <span className="font-semibold text-amber-300 text-sm">{inventoryCount}</span>
        </div>
      )}
      {storageCount !== undefined && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-slate-400 text-sm">Storage:</span>
          <span className="font-semibold text-amber-300 text-sm">{storageCount}</span>
        </div>
      )}
      {processorCount !== undefined && processorCount > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-slate-400 text-sm">Processing:</span>
          <span className="font-semibold text-sky-300 text-sm">{processorCount}</span>
        </div>
      )}
    </>
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
  plantInfo,
  disappearsSoon,
  storageCount,
}: {
  item: MuseumItem;
  inInventory: boolean;
  inventoryAmount: number;
  discovered: boolean;
  inSeason?: boolean;
  fishInfo?: FishScheduleEntry;
  mineralInfo?: MineralInfo;
  plantInfo?: ForageableEntry;
  disappearsSoon?: boolean;
  storageCount?: number;
}) {
  const safeName = (item.name ?? '').replace(/ /g, '_');
  const paths = item.category === 'fish'
    ? [`/fish/${safeName}.png`, `/items/${safeName}.png`]
    : [`/items/${safeName}.png`, `/edibles/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = (item.name ?? '??').split(' ').slice(0, 2).map((w) => w[0]).join('');

  const highlighted = inInventory || inSeason;
  const borderColor = inInventory
    ? 'border-2 border-amber-300 dark:border-amber-500'
    : inSeason
      ? 'border-2 border-amber-700 dark:border-amber-400'
      : 'border border-slate-400 dark:border-slate-500';
  const opacity = highlighted || discovered ? '' : 'opacity-40';

  const hasTooltip = storageCount !== undefined
    || (item.category === 'fish' && fishInfo && fishInfo.locations)
    || (item.category === 'mineral' && mineralInfo)
    || item.category === 'plant';

  const tooltipContent = hasTooltip ? (
    <>
      <div className="text-slate-200 text-sm font-semibold mb-1.5 leading-tight">
        {item.name ?? `Item #${item.id}`}
      </div>
      {storageCount !== undefined && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-slate-400 text-sm">In storage</span>
          <span className="font-semibold text-amber-300 text-sm">{storageCount}</span>
        </div>
      )}
      {item.category === 'fish' && fishInfo && <FishTooltipContent fish={fishInfo} />}
      {item.category === 'mineral' && mineralInfo && <MineralTooltipContent mineral={mineralInfo} />}
      {item.category === 'plant' && <PlantTooltipContent plant={plantInfo} />}
    </>
  ) : null;

  return (
    <AppTooltip content={tooltipContent} width="w-52">
      <div
        className={`h-[84px] w-16 overflow-hidden rounded-lg ${disappearsSoon ? 'bg-orange-100 dark:bg-orange-950/40' : 'bg-slate-50 dark:bg-slate-800/50'} ${borderColor} ${opacity}`}
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
    </AppTooltip>
  );
}

function ResearchIconSmall({ item, fishInfo, mineralInfo, plantInfo, storageCount, inSeason, disappearsSoon }: {
  item: MuseumItem;
  fishInfo?: FishScheduleEntry;
  mineralInfo?: MineralInfo;
  plantInfo?: ForageableEntry;
  storageCount?: number;
  inSeason?: boolean;
  disappearsSoon?: boolean;
}) {
  const safeName = (item.name ?? '').replace(/ /g, '_');
  const paths = item.category === 'fish'
    ? [`/fish/${safeName}.png`, `/items/${safeName}.png`]
    : [`/items/${safeName}.png`, `/edibles/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = (item.name ?? '?').split(' ').slice(0, 2).map((w) => w[0]).join('');

  const tooltipContent = (
    <>
      <div className="text-slate-200 text-sm font-semibold mb-1.5 leading-tight">{item.name ?? `Item #${item.id}`}</div>
      {storageCount !== undefined && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-slate-400 text-sm">In storage</span>
          <span className="font-semibold text-amber-300 text-sm">{storageCount}</span>
        </div>
      )}
      {item.category === 'fish' && fishInfo && <FishTooltipContent fish={fishInfo} />}
      {item.category === 'mineral' && mineralInfo && <MineralTooltipContent mineral={mineralInfo} />}
      {item.category === 'plant' && <PlantTooltipContent plant={plantInfo} />}
    </>
  );

  const borderClass = disappearsSoon
    ? 'border-orange-400 dark:border-orange-600'
    : inSeason
      ? 'border-amber-500 dark:border-amber-400'
      : 'border-slate-300 dark:border-slate-600';
  const bgClass = disappearsSoon
    ? 'bg-orange-50 dark:bg-orange-950/30'
    : 'bg-slate-50 dark:bg-slate-800/50';

  return (
    <AppTooltip content={tooltipContent} width="w-52">
      <div className={`h-[37px] w-[37px] flex-none overflow-hidden rounded border ${borderClass} ${bgClass}`}>
        {safeName && pathIdx < paths.length ? (
          <img
            src={paths[pathIdx]}
            alt={item.name ?? ''}
            className="h-full w-full object-contain p-0.5"
            onError={() => setPathIdx((i) => i + 1)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold leading-none text-slate-400 dark:text-slate-500">
            {initials}
          </span>
        )}
      </div>
    </AppTooltip>
  );
}

function QuestItemIcon({ name, stillNeed, have, amount, questName, invCount, storCount, processorCount, forageableInfo, processorRecipe, isTownQuestItem = false, size = 'md' }: {
  name: string;
  stillNeed: number;
  have: number;
  amount: number;
  questName: string;
  invCount?: number;
  storCount?: number;
  processorCount?: number;
  forageableInfo?: ForageableEntry;
  processorRecipe?: ProcessorRecipe;
  isTownQuestItem?: boolean;
  size?: 'sm' | 'md';
}) {
  const safeName = name.replace(/ /g, '_');
  const paths = [`/dishes/${safeName}.png`, `/processed_foods/${safeName}.png`, `/fish/${safeName}.png`, `/items/${safeName}.png`, `/edibles/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');

  const forageSeason = forageableInfo ? (() => {
    const sn = TOOLTIP_SEASON_NAMES;
    const start = `${sn[forageableInfo.forage_start_season ?? forageableInfo.start_season]} ${forageableInfo.forage_start_day ?? forageableInfo.start_day}`;
    const end   = `${sn[forageableInfo.forage_end_season   ?? forageableInfo.end_season]}   ${forageableInfo.forage_end_day   ?? forageableInfo.end_day}`;
    return `${start} – ${end}`;
  })() : null;

  const tooltipContent = (
    <>
      <div className="text-slate-200 text-sm font-semibold mb-1.5 leading-tight">{name}</div>
      <div className="space-y-1">
        {isTownQuestItem && stillNeed === 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-emerald-400 text-sm">
              ✓ {invCount !== undefined && invCount >= amount ? 'In hand' : 'In storage'} — bring to donation box
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400 text-sm">Still need</span>
            <span className="font-semibold text-amber-300 text-sm">{stillNeed} of {amount}</span>
          </div>
        )}
        {invCount !== undefined && invCount > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400 text-sm">Inventory</span>
            <span className="font-semibold text-emerald-400 text-sm">{invCount}</span>
          </div>
        )}
        {storCount !== undefined && storCount > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400 text-sm">Storage</span>
            <span className="font-semibold text-emerald-400 text-sm">{storCount}</span>
          </div>
        )}
        {invCount === undefined && have > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400 text-sm">On hand</span>
            <span className="font-semibold text-emerald-400 text-sm">{have}</span>
          </div>
        )}
        {processorCount !== undefined && processorCount > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400 text-sm">Processing</span>
            <span className="font-semibold text-sky-300 text-sm">{processorCount}</span>
          </div>
        )}
        {processorRecipe && (
          <div className="mt-1 pt-1.5 border-t border-slate-700 space-y-1">
            <div className="flex items-start gap-1.5">
              <span className="text-slate-400 text-sm shrink-0">Recipe</span>
              <span className="text-slate-200 text-sm leading-snug">{processorRecipe.ingredients}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-slate-400 text-sm shrink-0">Machine</span>
              <span className="text-slate-200 text-sm leading-snug">{processorRecipe.processorLabel.replace(/\s*\([^)]+\)$/, '')}</span>
            </div>
            {processorRecipe.shelfLifeDays > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-sm shrink-0">Shelf life</span>
                <span className="text-amber-300 text-sm">{processorRecipe.shelfLifeDays} days</span>
              </div>
            )}
          </div>
        )}
        {forageableInfo && (
          <div className="mt-1 pt-1.5 border-t border-slate-700 space-y-1">
            {forageSeason && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-sm shrink-0">In season</span>
                <span className="text-slate-200 text-sm">{forageSeason}</span>
              </div>
            )}
            {forageableInfo.locations && forageableInfo.locations.length > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="text-slate-400 text-sm shrink-0">Found in</span>
                <span className="text-slate-200 text-sm leading-snug">{forageableInfo.locations.join(', ')}</span>
              </div>
            )}
          </div>
        )}
        <div className="mt-1 pt-1.5 border-t border-slate-700 text-[11px] text-slate-500 leading-tight">For: {questName}</div>
      </div>
    </>
  );

  const sizeClass = size === 'sm' ? 'h-6 w-6' : 'h-[37px] w-[37px]';
  return (
    <AppTooltip content={tooltipContent} width="w-56">
      <div className={`${sizeClass} flex-none overflow-hidden rounded border border-sky-300 bg-sky-50 dark:border-sky-600/70 dark:bg-sky-950/30`}>
        {safeName && pathIdx < paths.length ? (
          <img
            src={paths[pathIdx]}
            alt={name}
            className="h-full w-full object-contain p-0.5"
            onError={() => setPathIdx((i) => i + 1)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold leading-none text-slate-400 dark:text-slate-500">
            {initials}
          </span>
        )}
      </div>
    </AppTooltip>
  );
}

function CropHarvestIcon({ image, name, plantEntry, canGoToSeed, isMultiHarvest, goneToSeed = false, invCount, storCount }: {
  image: string;
  name: string;
  plantEntry?: ForageableEntry;
  canGoToSeed: boolean;
  isMultiHarvest: boolean;
  goneToSeed?: boolean;
  invCount?: number;
  storCount?: number;
}) {
  const tooltipContent = (
    <>
      <div className="text-slate-200 text-sm font-semibold mb-1.5 leading-tight">{name}</div>
      <div className="space-y-1">
        {plantEntry && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400 text-sm">Plant Starting On</span>
              <span className="text-white text-sm">{TOOLTIP_SEASON_NAMES[plantEntry.start_season]} {plantEntry.start_day}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400 text-sm">Cannot Plant After</span>
              <span className="text-white text-sm">{TOOLTIP_SEASON_NAMES[plantEntry.end_season]} {plantEntry.end_day}</span>
            </div>
          </>
        )}
        {invCount !== undefined && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400 text-sm">Inventory</span>
            <span className="font-semibold text-emerald-400 text-sm">{invCount}</span>
          </div>
        )}
        {storCount !== undefined && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400 text-sm">Storage</span>
            <span className="font-semibold text-amber-300 text-sm">{storCount}</span>
          </div>
        )}
        {isMultiHarvest && (
          <div className="text-[11px] text-slate-400 italic leading-tight pt-0.5">Regrows after harvest</div>
        )}
        {canGoToSeed && !isMultiHarvest && (
          <div className="text-[11px] text-slate-400 italic leading-tight pt-0.5">Can go to seed</div>
        )}
      </div>
    </>
  );

  const borderColor = goneToSeed
    ? 'border-amber-400 dark:border-amber-600'
    : 'border-emerald-400 dark:border-emerald-600';
  const bgColor = goneToSeed
    ? 'bg-amber-50 dark:bg-amber-950/30'
    : 'bg-emerald-50 dark:bg-emerald-950/30';

  return (
    <AppTooltip content={tooltipContent} width="w-52">
      <div className={`h-[37px] w-[37px] flex-none overflow-hidden rounded border ${borderColor} ${bgColor}`}>
        <img src={image} alt={name} className="h-full w-full object-contain p-0.5" />
      </div>
    </AppTooltip>
  );
}

function RewardIcon({ name, amount, type, storageCount, description }: {
  name: string;
  amount: number;
  type: 'item' | 'relationship';
  storageCount?: number;
  description?: string;
}) {
  const safeName = name.replace(/ /g, '_');
  const paths = type === 'item'
    ? [`/dishes/${safeName}.png`, `/processed_foods/${safeName}.png`, `/fish/${safeName}.png`, `/items/${safeName}.png`, `/edibles/${safeName}.png`]
    : [`/villagers/${safeName}.png`, `/characters/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const isRel = type === 'relationship';

  const card = (
    <div
      className={`relative h-[84px] w-16 overflow-hidden rounded-lg border ${
        isRel
          ? 'border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-900/20'
          : 'border-indigo-200 bg-indigo-50 dark:border-indigo-700/50 dark:bg-indigo-900/20'
      }`}
      title={description ? undefined : (isRel ? `+${amount} relationship with ${name}` : `${name} ×${amount}${storageCount !== undefined ? ` • ${storageCount} in storage` : ''}`)}
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

  if (description) {
    return (
      <AppTooltip
        content={
          <div>
            <p className="text-sm font-semibold text-slate-100">{name}</p>
            <p className="mt-1 text-sm text-slate-300">{description}</p>
          </div>
        }
        width="w-64"
      >
        {card}
      </AppTooltip>
    );
  }
  return card;
}

const EFFICIENT_CRAFTER_SKILL_ID = 895;

const BLUEPRINT_BUILD_REQS: Record<string, { material: string; qty: number }[]> = {
  'Smoking Hut': [
    { material: 'Plank', qty: 20 },
    { material: 'Stone', qty: 100 },
  ],
  'Copper Water Pump': [
    { material: 'Copper Bar', qty: 10 },
    { material: 'Stone',      qty: 50 },
  ],
  'Irrigation Pipe': [
    { material: 'Tin Bar', qty: 1 },
  ],
  'Fermentation Barrel': [
    { material: 'Plank',     qty: 32 },
    { material: 'Iron Bar',  qty: 6  },
    { material: 'Nickel Bar', qty: 6 },
  ],
  'Press': [
    { material: 'Iron Bar',  qty: 5  },
    { material: 'Plank',     qty: 20 },
    { material: 'Hard Wood', qty: 20 },
  ],
  'Icebox': [
    { material: 'Ice Chunk', qty: 100 },
    { material: 'Hard Wood', qty: 50  },
    { material: 'Tin Bar',   qty: 25  },
    { material: 'Ice Gem',   qty: 5   },
  ],
  'Kiln': [
    { material: 'Clay',  qty: 50 },
    { material: 'Stone', qty: 30 },
  ],
  'Mushroom Log': [
    { material: 'Medium Wood', qty: 8 },
    { material: 'Compost',     qty: 7 },
  ],
  'Seed Maker': [
    { material: 'Emerald', qty: 5  },
    { material: 'Shell',   qty: 1  },
    { material: 'Plank',   qty: 15 },
  ],
  'Iron Water Pump': [
    { material: 'Copper Water Pump', qty: 1  },
    { material: 'Iron Bar',          qty: 10 },
    { material: 'Clay',              qty: 25 },
  ],
  'Titanium Water Pump': [
    { material: 'Iron Water Pump', qty: 1  },
    { material: 'Titanium Bar',    qty: 10 },
    { material: 'Marble',          qty: 25 },
  ],
};

function BlueprintIngredientIcon({ name }: { name: string }) {
  const safeName = name.replace(/ /g, '_');
  const paths = [`/items/${safeName}.png`, `/edibles/${safeName}.png`, `/processed_foods/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  if (pathIdx >= paths.length) {
    return <span className="inline-flex h-5 w-5 items-center justify-center text-[10px] font-semibold text-slate-400">{name[0]}</span>;
  }
  return (
    <img
      src={paths[pathIdx]}
      alt={name}
      className="h-5 w-5 object-contain"
      style={{ imageRendering: 'pixelated' }}
      onError={() => setPathIdx((i) => i + 1)}
    />
  );
}

function BlueprintRewardIcon({ name, amount, unlockedSkills = [] }: { name: string; amount: number; unlockedSkills?: number[] }) {
  const baseName = name.replace(' Blueprint', '');
  const reqs = BLUEPRINT_BUILD_REQS[baseName];
  const hasEfficientCrafter = unlockedSkills.includes(EFFICIENT_CRAFTER_SKILL_ID);
  return (
    <AppTooltip
      content={
        <div>
          <p className="text-sm font-semibold text-slate-100">{name}</p>
          <p className="mt-1 text-sm text-slate-300">
            Allows you to craft {baseName} at a Crafting Table.
          </p>
          {reqs && (
            <div className="mt-2 border-t border-slate-700 pt-2">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Craft requires</p>
              {hasEfficientCrafter && (
                <p className="mb-1.5 text-xs font-medium text-emerald-400">Efficient Crafter: −20%</p>
              )}
              <div className="space-y-1">
                {reqs.map((r) => {
                  const qty = hasEfficientCrafter ? Math.floor(r.qty * 0.8) : r.qty;
                  return (
                    <div key={r.material} className="flex items-center gap-1.5">
                      <BlueprintIngredientIcon name={r.material} />
                      <span className="text-amber-300 text-sm font-semibold">{qty}×</span>
                      <span className="text-slate-200 text-sm">{r.material}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      }
      width="w-56"
    >
      <div className="relative h-[84px] w-16 overflow-hidden rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-700/50 dark:bg-sky-900/20">
        <svg viewBox="0 0 48 56" className="w-full px-2 pt-2 pb-5" aria-hidden>
          <rect x="3" y="2" width="36" height="46" rx="3" fill="#BFDBFE" stroke="#60A5FA" strokeWidth="1.5" />
          <polygon points="27,2 39,14 27,14" fill="#93C5FD" stroke="#60A5FA" strokeWidth="1" />
          <line x1="9" y1="20" x2="33" y2="20" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="9" y1="27" x2="29" y2="27" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="9" y1="34" x2="31" y2="34" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="9" y1="41" x2="23" y2="41" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
        <span className="absolute bottom-0 right-0 inline-flex items-center justify-center rounded-tl bg-black/65 px-1.5 py-0.5 text-[13px] font-bold text-white">
          {amount}
        </span>
      </div>
    </AppTooltip>
  );
}

function FestivalItemIcon({ name, qty, storageCount }: { name: string; qty: number; storageCount?: number }) {
  const safeName = name.replace(/ /g, '_');
  const [imgOk, setImgOk] = useState(true);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');

  return (
    <div className="flex flex-col items-center gap-1 w-16" title={`${name} ×${qty}${storageCount !== undefined ? ` • ${storageCount} in storage` : ''}`}>
      <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-violet-200/70 bg-white dark:border-violet-600/40 dark:bg-violet-900/20 [box-shadow:inset_0_0_10px_rgba(139,92,246,0.15)]">
        {imgOk ? (
          <img
            src={`/festival_store_items/${safeName}.png`}
            alt={name}
            className="h-full w-full object-contain p-1 image-rendering-pixelated"
            style={{ imageRendering: 'pixelated' }}
            onError={() => setImgOk(false)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-center text-xs font-semibold leading-tight text-violet-400 dark:text-violet-500">
            {initials}
          </span>
        )}
        <span className="absolute bottom-0 right-0 inline-flex items-center justify-center rounded-tl bg-violet-500/80 px-1 py-px text-[11px] font-bold text-white">
          ×{qty}
        </span>
      </div>
      <span className="text-center text-xs leading-tight text-slate-500 dark:text-slate-400 w-full break-words">
        {name}
      </span>
    </div>
  );
}

type VillagerGifts = { favorites: string[]; dislikes: string[] };
const villagerGifts: Record<string, VillagerGifts> = villagerGiftsData as Record<string, VillagerGifts>;

function GiftItemIcon({ name, sentiment, storageCount, processorCount, size = 'default' }: { name: string; sentiment: 'favorite' | 'dislike'; storageCount?: number; processorCount?: number; size?: 'sm' | 'default' }) {
  const safeName = name.replace(/ /g, '_');
  const paths = [`/dishes/${safeName}.png`, `/processed_foods/${safeName}.png`, `/fish/${safeName}.png`, `/items/${safeName}.png`, `/edibles/${safeName}.png`];
  const [pathIdx, setPathIdx] = useState(0);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const isFav = sentiment === 'favorite';

  const tooltipContent = (
    <>
      <div className={`text-sm font-semibold mb-1 leading-tight ${isFav ? 'text-emerald-400' : 'text-red-400'}`}>
        {isFav ? 'Favorite' : 'Dislikes'}
      </div>
      <div className="text-slate-200 text-sm mb-1.5">{name}</div>
      {storageCount !== undefined && (
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-sm">Storage</span>
          <span className="font-semibold text-amber-300 text-sm">{storageCount}</span>
        </div>
      )}
      {processorCount !== undefined && processorCount > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-sm">Processing</span>
          <span className="font-semibold text-sky-300 text-sm">{processorCount}</span>
        </div>
      )}
    </>
  );

  if (size === 'sm') {
    return (
      <AppTooltip content={tooltipContent}>
        <div
          className={`h-9 w-9 cursor-default overflow-hidden rounded-md border ${
            isFav
              ? 'border-[#5c9a30]/50 bg-white dark:border-[#6aae36]/50 dark:bg-emerald-900/20 [box-shadow:inset_0_0_6px_rgba(92,154,48,0.22)]'
              : 'border-red-300/60 bg-white dark:border-red-400/60 dark:bg-red-900/20 [box-shadow:inset_0_0_6px_rgba(239,68,68,0.18)]'
          }`}
        >
          {pathIdx < paths.length ? (
            <img src={paths[pathIdx]} alt={name} className="h-full w-full object-contain p-0.5" onError={() => setPathIdx((i) => i + 1)} />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400 dark:text-slate-500">
              {initials}
            </span>
          )}
        </div>
      </AppTooltip>
    );
  }

  return (
    <AppTooltip content={tooltipContent}>
      <div className="flex flex-col items-center gap-1 w-20">
        <div
          className={`h-16 w-16 overflow-hidden rounded-lg border ${
            isFav
              ? 'border-[#5c9a30]/50 bg-white dark:border-[#6aae36]/50 dark:bg-emerald-900/20 [box-shadow:inset_0_0_10px_rgba(92,154,48,0.22)]'
              : 'border-red-300/60 bg-white dark:border-red-400/60 dark:bg-red-900/20 [box-shadow:inset_0_0_10px_rgba(239,68,68,0.18)]'
          }`}
        >
          {pathIdx < paths.length ? (
            <img
              src={paths[pathIdx]}
              alt={name}
              className="h-full w-full object-contain p-1.5"
              onError={() => setPathIdx((i) => i + 1)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-center text-sm font-semibold leading-tight text-slate-400 dark:text-slate-500">
              {initials}
            </span>
          )}
        </div>
        <span className="text-center text-sm leading-tight text-slate-500 dark:text-slate-400 w-full break-words">
          {name}
        </span>
      </div>
    </AppTooltip>
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
  donationMap,
  storageNameMap,
}: {
  quest: Quest;
  inProgressQuestIds: Set<number>;
  currentAbs: number;
  difficulty?: number | null;
  currentSeasonIdx?: number;
  donationMap?: Map<string, number>;
  storageNameMap?: Map<string, number>;
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
        <span className="text-sm text-slate-500 dark:text-slate-400">{availability}</span>
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
                    <RewardIcon key={i} name={r.icon!.name} amount={r.icon!.amount} type={r.icon!.type} storageCount={r.icon!.type === 'item' && storageNameMap ? storageNameMap.get(r.icon!.name) ?? 0 : undefined} />
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
            <p className={`mb-1.5 text-xs font-medium uppercase tracking-wide ${quest.is_town_quest && donationMap ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
              Requires
            </p>
            <div className="mb-3 flex flex-wrap gap-1">
              {reqs.map((req, i) => {
                const donated = donationMap?.get(req.name) ?? 0;
                const isDone = donationMap != null && donated >= req.amount;
                const displayAmt = donationMap != null ? Math.max(0, req.amount - donated) : req.amount;
                return (
                  <span
                    key={i}
                    className={isDone
                      ? 'rounded px-2 py-0.5 text-sm line-through bg-slate-100 text-slate-400 dark:bg-slate-700/40 dark:text-slate-500'
                      : 'rounded bg-amber-50 px-2 py-0.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}
                  >
                    {isDone ? '✓ ' : (displayAmt > 1 ? `${displayAmt}× ` : '')}{req.name}
                  </span>
                );
              })}
            </div>
            {quest.is_town_quest && donationMap && (
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Remaining
              </p>
            )}
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${bestCols}, 4rem)` }}
            >
              {reqs.map((req, i) => (
                <ItemIcon
                  key={i}
                  name={req.name}
                  amount={req.amount}
                  donated={donationMap?.get(req.name) ?? 0}
                />
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

function ChipTooltip({ children, tipContent }: { children: React.ReactNode; tipContent: React.ReactNode }) {
  return (
    <AppTooltip content={tipContent}>
      {children}
    </AppTooltip>
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

const GRUFF_TOOLS = new Set(['watercan', 'hoe', 'pick', 'axe', 'scythe']);

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

const ORE_FOR_BAR: Record<string, string> = {
  'Copper Bar':   'Copper Ore',
  'Iron Bar':     'Iron Ore',
  'Titanium Bar': 'Titanium Ore',
  'Mithril Bar':  'Mithril Ore',
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

function UpgradeStatusCard({ name, role, toolNames, chipColor, toolData, storageNameMap, processorNameMap, contributedNameMap, money }: {
  name: string;
  role: string;
  toolNames: string[];
  chipColor: string;
  toolData: ToolData[] | null;
  storageNameMap?: Map<string, number>;
  processorNameMap?: Map<string, number>;
  contributedNameMap?: Map<string, number>;
  money?: number | null;
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
        <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-base font-semibold ${chipColor}`}>
          {name}
        </span>
        <span className="text-base text-slate-500 dark:text-slate-400">{role}</span>
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
                  <span className="w-28 text-base text-slate-700 dark:text-slate-300">
                    {TOOL_DISPLAY_NAMES[toolName] ?? toolName}
                  </span>
                  <TierDots current={tier} max={maxTier} />
                  <span className="text-sm text-slate-400 dark:text-slate-500">
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
                    <ChipTooltip tipContent={
                      storageNameMap ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-sm">Storage</span>
                            <span className="font-semibold text-amber-300 text-sm">{storageNameMap.get(req.material) ?? 0}</span>
                          </div>
                          {((processorNameMap?.get(req.material) ?? 0) > 0) && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-sm">Processing</span>
                              <span className="font-semibold text-sky-300 text-sm">{processorNameMap!.get(req.material)}</span>
                            </div>
                          )}
                          {((contributedNameMap?.get(req.material) ?? 0) > 0) && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-sm">Contributed</span>
                              <span className="font-semibold text-rose-300 text-sm">{contributedNameMap!.get(req.material)}</span>
                            </div>
                          )}
                        </div>
                      ) : null
                    }>
                      <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-3 py-1.5 text-base text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        <img src={`/items/${req.material.replace(/ /g, '_')}.png`} alt="" className="h-11 w-11 object-contain -mt-2" />
                        {req.amount}× {req.material}
                      </span>
                    </ChipTooltip>
                    <ChipTooltip tipContent={
                      money != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-sm">You have</span>
                          <span className="font-semibold text-amber-300 text-sm">{money.toLocaleString()} coins</span>
                        </div>
                      ) : null
                    }>
                      <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-3 py-1.5 text-base text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        <img src="/items/Coin.png" alt="" className="h-6 w-6 object-contain" />
                        {req.coins} coins
                      </span>
                    </ChipTooltip>
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

type UpgradeMaterial = { name: string; qty: number };

const BARN_NAMES: Record<number, string> = {
  0: 'Alpheep Barn',
  1: 'Chikree Coop',
  2: 'Girtle Pen',
  3: 'Bluggy Hutch',
};
const ALL_BARN_TYPES = [0, 1, 2, 3];

const HOME_LEVEL_LABELS: Record<number, string> = {
  0: 'Starter Home',
  1: 'Humble Home',
  2: 'Family Den (max)',
};

const HOME_UPGRADE_TARGETS: Record<number, { name: string; coins: number; materials: UpgradeMaterial[] }> = {
  1: { name: 'Humble Home', coins: 1000, materials: [
    { name: 'Plank', qty: 99 },
    { name: 'Stone', qty: 99 },
    { name: 'Clay', qty: 99 },
    { name: 'Nickel Bar', qty: 30 },
  ]},
  2: { name: 'Family Den', coins: 3000, materials: [
    { name: 'Plank', qty: 99 },
    { name: 'Sandstone', qty: 99 },
    { name: 'Marble', qty: 99 },
    { name: 'Titanium Bar', qty: 30 },
  ]},
};

const BARN_REQUIREMENTS: Record<'build' | 'expand', { coins: number; materials: UpgradeMaterial[] }> = {
  build: { coins: 500, materials: [
    { name: 'Plank', qty: 50 },
    { name: 'Stone', qty: 50 },
  ]},
  expand: { coins: 1000, materials: [
    { name: 'Plank', qty: 99 },
    { name: 'Clay', qty: 50 },
    { name: 'Sandstone', qty: 50 },
    { name: 'Nickel Bar', qty: 10 },
  ]},
};

function BuildingStatusCard({ homeLevel, homeConstructionDays, barnData, storageNameMap, processorNameMap, contributedNameMap, money }: {
  homeLevel: number | null;
  homeConstructionDays: number;
  barnData: BarnData[];
  storageNameMap?: Map<string, number>;
  processorNameMap?: Map<string, number>;
  contributedNameMap?: Map<string, number>;
  money?: number | null;
}) {
  const barnByType = new Map(barnData.map((b) => [b.prefabId, b]));

  return (
    <div className="rounded-xl border border-slate-900/10 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-0.5 text-base font-semibold text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
          Rowan
        </span>
        <span className="text-base text-slate-500 dark:text-slate-400">Carpenter · Building Upgrades</span>
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
              <span className="w-32 text-sm text-slate-700 dark:text-slate-300">Home</span>
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
                  <span className="w-32 text-sm text-slate-700 dark:text-slate-300">{label}</span>
                  {barn ? (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {barn.level >= 1 ? 'Big (8 animals)' : 'Basic (4 animals)'}
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
          <div className="space-y-3">
            {homeLevel < 2 && homeConstructionDays === 0 && (() => {
              const target = HOME_UPGRADE_TARGETS[homeLevel + 1];
              if (!target) return null;
              return (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50">
                  <p className="mb-2 text-base font-medium text-slate-600 dark:text-slate-300">
                    Home → {target.name}
                  </p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    <ChipTooltip tipContent={
                      money != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-sm">You have</span>
                          <span className="font-semibold text-amber-300 text-sm">{money.toLocaleString()} coins</span>
                        </div>
                      ) : null
                    }>
                      <span className="inline-flex scale-[1.05] items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        <img src="/items/Coin.png" alt="" className="h-5 w-5 object-contain" />
                        {target.coins.toLocaleString()} coins
                      </span>
                    </ChipTooltip>
                  </div>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${target.materials.length}, 4rem)` }}>
                    {target.materials.map((mat) => (
                      <ItemIcon key={mat.name} name={mat.name} amount={mat.qty} storageCount={storageNameMap ? storageNameMap.get(mat.name) ?? 0 : undefined} processorCount={storageNameMap ? processorNameMap?.get(mat.name) ?? 0 : undefined} contributedCount={storageNameMap ? contributedNameMap?.get(mat.name) ?? 0 : undefined} />
                    ))}
                  </div>
                </div>
              );
            })()}
            {ALL_BARN_TYPES.filter((t) => {
              const b = barnByType.get(t);
              return !b || b.level < 1;
            }).map((typeId) => {
              const barn = barnByType.get(typeId);
              const req = barn ? BARN_REQUIREMENTS.expand : BARN_REQUIREMENTS.build;
              return (
                <div key={typeId} className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50">
                  <p className="mb-2 text-base font-medium text-slate-600 dark:text-slate-300">
                    {barn ? `${BARN_NAMES[typeId]} → Expand to Big` : `${BARN_NAMES[typeId]} → Build`}
                  </p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    <ChipTooltip tipContent={
                      money != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-sm">You have</span>
                          <span className="font-semibold text-amber-300 text-sm">{money.toLocaleString()} coins</span>
                        </div>
                      ) : null
                    }>
                      <span className="inline-flex scale-[1.05] items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        <img src="/items/Coin.png" alt="" className="h-5 w-5 object-contain" />
                        {req.coins.toLocaleString()} coins
                      </span>
                    </ChipTooltip>
                  </div>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${req.materials.length}, 4rem)` }}>
                    {req.materials.map((mat) => (
                      <ItemIcon key={mat.name} name={mat.name} amount={mat.qty} storageCount={storageNameMap ? storageNameMap.get(mat.name) ?? 0 : undefined} processorCount={storageNameMap ? processorNameMap?.get(mat.name) ?? 0 : undefined} contributedCount={storageNameMap ? contributedNameMap?.get(mat.name) ?? 0 : undefined} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DonatedSpecimensCard({
  selectedCharacter,
  donatedSections,
  fishScheduleMap,
  mineralDataMap,
  storageMap,
  refDataReady,
}: {
  selectedCharacter: ReturnType<typeof useAuth>['selectedCharacter'];
  donatedSections: { label: string; items: MuseumItem[] }[];
  fishScheduleMap: Record<number, FishScheduleEntry>;
  mineralDataMap: Record<number, MineralInfo>;
  storageMap: Map<number, number>;
  refDataReady: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-base font-medium text-slate-700 dark:text-slate-300">Items Already Donated</span>
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
          ) : !refDataReady ? (
            <p className="text-sm italic text-slate-400 dark:text-slate-500">
              Item reference data failed to load — please refresh the page.
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
                        storageCount={selectedCharacter ? storageMap.get(item.id) ?? 0 : undefined}
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

// ── Daily To-Do Checklist ────────────────────────────────────────────────────

type ProcessorRecipe = {
  processorLabel: string;
  ingredients: string;
  shelfLifeDays: number;
  perishable: boolean;
};

type ChecklistItem = { id: string; label: string; detail?: string; dividerLabel?: string; asterisk?: boolean; townQuestReadyLabel?: string; kind?: 'callout' | 'research' | 'hold-warning' | 'info' | 'pick-one-header'; iconNode?: ReactNode; museumItemId?: number; rejectCheckbox?: boolean; upgradeDetails?: MinesUpgradeDetails; birthdayFavorites?: Array<{name: string; storageCount?: number}>; questAcceptItems?: Array<{name: string; amount: number; invCount: number; storCount: number; questName: string; forageableInfo?: ForageableEntry; processorRecipe?: ProcessorRecipe}>; groupKey?: string; subtaskIds?: string[]; holdItems?: Array<{ name: string; amount: number }>; pickupSuggestions?: string[]; perishableWarning?: string; pickOneGroupKey?: string; pickOneQuestId?: number; pickOneOptions?: Array<{questId: number; label: string; opensLabel: string; daysUntilStart: number}> };
type ChecklistGroup = { location: string; colorClass: string; items: ChecklistItem[] };

function sceneToStorageLabel(scene: string): string {
  const lower = scene.toLowerCase();
  if (lower.includes('home') || lower.includes('house') || lower.includes('interior')) return 'Home';
  if (lower.includes('farm') || lower.includes('field') || lower.includes('outdoor')) return 'Farm';
  return scene;
}

function buildOresByLocation(chestData: ChestEntry[], oreName: string): { label: string; count: number }[] {
  const byScene = new Map<string, number>();
  for (const chest of chestData) {
    for (const item of chest.items) {
      if (item.name === oreName && item.amount > 0) {
        const scene = chest.scene ?? 'Unknown';
        byScene.set(scene, (byScene.get(scene) ?? 0) + item.amount);
      }
    }
  }
  if (byScene.size === 0) return [];
  const byLabel = new Map<string, number>();
  for (const [scene, count] of byScene.entries()) {
    const label = sceneToStorageLabel(scene);
    byLabel.set(label, (byLabel.get(label) ?? 0) + count);
  }
  return [...byLabel.entries()].map(([label, count]) => ({ label, count }));
}

type MinesUpgradeDetails = {
  material: string;
  amount: number;
  coins: number;
  barCount: number;
  barProcessorCount: number;
  barContributedCount: number;
  money: number | null;
  oreName: string;
  orePerLoc: { label: string; count: number }[];
};

const CHECKLIST_KEY = 'grimshire-daily-checklist';
const RESEARCH_DONE_KEY = 'grimshire-research-done';
const REJECTED_KEY = 'grimshire-daily-rejected';
const FISH_AUDIT_KEY = 'grimshire-fish-audit-debug';
const YEAR_GOALS_CHECKED_KEY = 'grimshire-year-goals-checked';

const FISH_AUDIT_LIST = [
  { id: 184, name: 'Ide',           habitat: 'River', locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 187, name: 'Zander',        habitat: 'Lake',  locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 190, name: 'Smelt',         habitat: 'Marsh', locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 191, name: 'Silver Bream',  habitat: 'River', locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 197, name: 'Eel',           habitat: 'Marsh', locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 198, name: 'Bleak',         habitat: 'River', locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 205, name: 'Whitefish',     habitat: 'Lake',  locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 209, name: 'Danube Salmon', habitat: 'River', locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 216, name: 'Rock Bass',     habitat: 'Lake',  locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 222, name: 'Arctic Char',   habitat: 'Lake',  locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 394, name: 'Vendace',       habitat: 'Lake',    locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
  { id: 670, name: 'Shrimp',        habitat: 'Coastal', locs: ['Farm Coast', 'Marsh Coast', 'Town Coast'] },
] as const;

type AuditAnswer = 'yes' | 'no' | null;
type AuditState = Record<string, AuditAnswer>;

function FishAuditColumn({ fishScheduleMap }: { fishScheduleMap: Record<number, FishScheduleEntry> }) {
  const [answers, setAnswers] = useState<AuditState>(() => {
    try {
      const raw = localStorage.getItem(FISH_AUDIT_KEY);
      return raw ? (JSON.parse(raw) as AuditState) : {};
    } catch { return {}; }
  });

  function pick(fishId: number, loc: string, val: AuditAnswer) {
    setAnswers(prev => {
      const next = { ...prev, [`${fishId}:${loc}`]: val };
      try { localStorage.setItem(FISH_AUDIT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const total = FISH_AUDIT_LIST.length * 3;
  const done = Object.values(answers).filter(Boolean).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-rose-400">
          Debug: Fish Audit
        </p>
        <span className="text-xs text-slate-400">{done}/{total}</span>
      </div>
      <ul className="space-y-2">
        {FISH_AUDIT_LIST.map((fish) => {
          const entry = fishScheduleMap[fish.id];
          const safeName = fish.name.replace(/ /g, '_');
          const iconTooltip = entry ? <FishTooltipContent fish={entry} /> : null;
          return (
            <li key={fish.id} className="rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-2.5 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AppTooltip content={iconTooltip} width="w-52">
                  <div className="h-6 w-6 shrink-0 cursor-default overflow-hidden rounded">
                    <img
                      src={`/fish/${safeName}.png`}
                      alt={fish.name}
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = `/items/${safeName}.png`;
                      }}
                    />
                  </div>
                </AppTooltip>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-none">
                  {fish.name}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">({fish.habitat})</span>
                </p>
              </div>
              <div className="space-y-1">
                {fish.locs.map((loc) => {
                  const key = `${fish.id}:${loc}`;
                  const ans = answers[key] ?? null;
                  return (
                    <div key={loc} className="flex items-center gap-1.5 text-xs">
                      <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">{loc}</span>
                      <span className="shrink-0 text-slate-400">here?</span>
                      <label className="flex cursor-pointer items-center gap-0.5">
                        <input
                          type="radio"
                          name={key}
                          checked={ans === 'yes'}
                          onChange={() => pick(fish.id, loc, 'yes')}
                          className="accent-emerald-500"
                        />
                        <span className="text-slate-600 dark:text-slate-300">Y</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-0.5">
                        <input
                          type="radio"
                          name={key}
                          checked={ans === 'no'}
                          onChange={() => pick(fish.id, loc, 'no')}
                          className="accent-rose-500"
                        />
                        <span className="text-slate-600 dark:text-slate-300">N</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
const NATURE_LOCS = new Set(['In the Forest', 'On the Mountain', 'In the Marsh', 'In the Deep Woods']);
const BARN_PRODUCT: Record<number, string> = { 0: 'wool', 1: 'eggs', 2: 'milk', 3: 'products' };
const BARN_ANIMAL: Record<number, string> = { 0: 'Alpheep', 1: 'Chikree', 2: 'Girtle', 3: 'Bluggy' };
const BARN_INTERACT: Record<number, string> = { 0: 'Pet, Shear, Milk: Alpheep', 1: 'Pet: Chikree', 2: 'Pet, Shear: Girtle', 3: 'Pet: Bluggy' };

function DailyChecklist({ groups, debugColumn }: { groups: ChecklistGroup[]; debugColumn?: ReactNode }) {
  const { selectedCharacter } = useAuth();

  const isLastStandDate =
    selectedCharacter?.current_year === 1 &&
    selectedCharacter?.current_season === 3 &&
    (selectedCharacter?.current_day ?? 0) >= 14 &&
    (selectedCharacter?.current_day ?? 0) <= 25;

  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(CHECKLIST_KEY);
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  // Maps museumItemId → groupLocation where it was checked. Used for cross-column deduplication.
  const [researchDone, setResearchDone] = useState<Map<number, string>>(() => {
    try {
      const raw = sessionStorage.getItem(RESEARCH_DONE_KEY);
      return raw ? new Map<number, string>(JSON.parse(raw) as [number, string][]) : new Map();
    } catch {
      return new Map();
    }
  });
  const [rejected, setRejected] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(REJECTED_KEY);
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [collapsed, setCollapsed] = useState(false);
  const [pickOneOverrides, setPickOneOverrides] = useState<Record<string, number>>({});
  const pickOneDefaults = useMemo(() => {
    const result: Record<string, number> = {};
    for (const group of groups) {
      for (const item of group.items) {
        if (item.kind === 'pick-one-header' && item.pickOneGroupKey && item.pickOneOptions?.length) {
          result[item.pickOneGroupKey] = item.pickOneOptions[0].questId;
        }
      }
    }
    return result;
  }, [groups]);
  const pickOneSelections = { ...pickOneDefaults, ...pickOneOverrides };
  function getPickOneSelected(groupKey: string): number {
    return pickOneSelections[groupKey] ?? -1;
  }

  const allRegularItems = groups.flatMap((g) => g.items).filter((i) => i.kind !== 'callout' && i.kind !== 'research' && i.kind !== 'pick-one-header');
  const allResearchIds = new Set(
    groups.flatMap((g) => g.items)
      .filter((i) => i.kind === 'research' && i.museumItemId !== undefined)
      .map((i) => i.museumItemId!)
  );
  // Cap researchDone so the badge and bar never exceed 100% when session state outlives the item list
  const cappedResearchDone = Math.min(researchDone.size, allResearchIds.size);
  const total = allRegularItems.length + allResearchIds.size;
  const doneCount = allRegularItems.filter((i) => checked.has(i.id) || rejected.has(i.id)).length + cappedResearchDone;

  // Weighted bar: group items by groupKey (singletons use their own id); items with subtaskIds
  // track progress via those sub-IDs rather than the parent's own checked state.
  const taskUnitMap = new Map<string, { items: ChecklistItem[]; subtaskIds?: string[] }>();
  for (const item of allRegularItems) {
    const key = item.groupKey ?? item.id;
    if (!taskUnitMap.has(key)) taskUnitMap.set(key, { items: [], subtaskIds: item.subtaskIds });
    taskUnitMap.get(key)!.items.push(item);
  }
  const numTaskUnits = taskUnitMap.size + allResearchIds.size;
  let barWeight = 0;
  for (const unit of taskUnitMap.values()) {
    if (unit.subtaskIds && unit.subtaskIds.length > 0) {
      barWeight += unit.subtaskIds.filter(id => checked.has(id)).length / unit.subtaskIds.length;
    } else {
      const c = unit.items.filter(i => checked.has(i.id) || rejected.has(i.id)).length;
      barWeight += c / unit.items.length;
    }
  }
  barWeight += cappedResearchDone;
  const barPct = numTaskUnits > 0 ? Math.min(barWeight / numTaskUnits, 1) * 100 : 0;
  const allDone = numTaskUnits > 0 && barPct >= 99.99;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { sessionStorage.setItem(CHECKLIST_KEY, JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
  }

  function toggleReject(id: string) {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { sessionStorage.setItem(REJECTED_KEY, JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
  }

  function toggleResearch(museumItemId: number, groupLocation: string) {
    setResearchDone((prev) => {
      const next = new Map(prev);
      if (next.has(museumItemId)) {
        next.delete(museumItemId);
      } else {
        next.set(museumItemId, groupLocation);
      }
      try { sessionStorage.setItem(RESEARCH_DONE_KEY, JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
  }

  const FIXED_TOP_LOCS = ['On Your Farm (Crops)', 'On Your Farm (Critters)', 'In the Town', 'In the Mines'];
  const FIXED_BOTTOM_LOCS = ['In the Forest', 'On the Mountain', 'In the Marsh', 'In the Deep Woods'];
  const topRowGroups = FIXED_TOP_LOCS.map(loc => groups.find(g => g.location === loc)).filter((g): g is ChecklistGroup => g !== undefined);
  const bottomRowGroups = FIXED_BOTTOM_LOCS.map(loc => groups.find(g => g.location === loc)).filter((g): g is ChecklistGroup => g !== undefined);
  const docksGroup = groups.find(g => g.location === 'At the Docks');
  const extraGroups = groups.filter(g =>
    !FIXED_TOP_LOCS.includes(g.location) &&
    !FIXED_BOTTOM_LOCS.includes(g.location) &&
    g.location !== 'At the Docks'
  );

  const hasMinesUpgradeItem = groups.some((g) => g.items.some((i) => i.id === 'mining-upgrade' && i.upgradeDetails));
  const gruffQuestVisible = hasMinesUpgradeItem && checked.has('mining-upgrade-show');
  const gruffReqsDone = gruffQuestVisible && checked.has('mining-upgrade-req-bar') && checked.has('mining-upgrade-req-coins');
  const gruffChecked = checked.has('mining-upgrade-gruff');

  function resetAll() {
    setChecked(new Set());
    setResearchDone(new Map());
    setRejected(new Set());
    try {
      sessionStorage.removeItem(CHECKLIST_KEY);
      sessionStorage.removeItem(RESEARCH_DONE_KEY);
      sessionStorage.removeItem(REJECTED_KEY);
    } catch { /* storage unavailable */ }
  }

  function toggleGruff() {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has('mining-upgrade-gruff')) {
        next.delete('mining-upgrade-gruff');
        next.delete('mining-upgrade');
      } else {
        next.add('mining-upgrade-gruff');
        next.add('mining-upgrade');
      }
      try { sessionStorage.setItem(CHECKLIST_KEY, JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
  }

  function getGroupCheckableIds(group: ChecklistGroup): {
    regularIds: string[];
    rejectIds: string[];
    researchItems: Array<{ museumItemId: number }>;
    extraIds: string[];
  } {
    const isCrops = group.location === 'On Your Farm (Crops)';
    const isForest = group.location === 'In the Forest';
    const isMines = group.location === 'In the Mines';
    const regularIds: string[] = [];
    const rejectIds: string[] = [];
    const researchItems: Array<{ museumItemId: number }> = [];
    const extraIds: string[] = [];
    for (const item of group.items) {
      if (item.kind === 'callout' || item.kind === 'hold-warning' || item.kind === 'info' || item.kind === 'pick-one-header') continue;
      if (item.pickOneGroupKey && item.pickOneQuestId !== undefined && item.pickOneQuestId !== getPickOneSelected(item.pickOneGroupKey)) continue;
      if (item.kind === 'research' && item.museumItemId !== undefined) {
        researchItems.push({ museumItemId: item.museumItemId });
        continue;
      }
      if (isMines && item.subtaskIds && item.id === 'mining-upgrade') {
        for (const sid of item.subtaskIds) {
          if (sid !== 'mining-upgrade-gruff') extraIds.push(sid);
        }
        continue;
      }
      if (isCrops && item.rejectCheckbox) {
        rejectIds.push(item.id);
      } else {
        regularIds.push(item.id);
      }
    }
    if (isForest && gruffQuestVisible) {
      extraIds.push('mining-upgrade-gruff');
      extraIds.push('mining-upgrade');
    }
    return { regularIds, rejectIds, researchItems, extraIds };
  }

  function isGroupFullyDone(group: ChecklistGroup): boolean {
    const { regularIds, rejectIds, researchItems, extraIds } = getGroupCheckableIds(group);
    const total = regularIds.length + rejectIds.length + researchItems.length + extraIds.length;
    if (total === 0) return false;
    return (
      regularIds.every(id => checked.has(id)) &&
      rejectIds.every(id => rejected.has(id)) &&
      researchItems.every(({ museumItemId }) => researchDone.has(museumItemId)) &&
      extraIds.every(id => checked.has(id))
    );
  }

  function toggleGroupAll(group: ChecklistGroup) {
    const { regularIds, rejectIds, researchItems, extraIds } = getGroupCheckableIds(group);
    const allCheckIds = [...regularIds, ...extraIds];
    const fullyDone = isGroupFullyDone(group);
    setChecked(prev => {
      const next = new Set(prev);
      for (const id of allCheckIds) fullyDone ? next.delete(id) : next.add(id);
      try { sessionStorage.setItem(CHECKLIST_KEY, JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
    setRejected(prev => {
      const next = new Set(prev);
      for (const id of rejectIds) fullyDone ? next.delete(id) : next.add(id);
      try { sessionStorage.setItem(REJECTED_KEY, JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
    setResearchDone(prev => {
      const next = new Map(prev);
      for (const { museumItemId } of researchItems) {
        fullyDone ? next.delete(museumItemId) : next.set(museumItemId, group.location);
      }
      try { sessionStorage.setItem(RESEARCH_DONE_KEY, JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
  }

  function renderGroupColumn(group: ChecklistGroup) {
    const { regularIds, rejectIds, researchItems, extraIds } = getGroupCheckableIds(group);
    const canCheckAll = regularIds.length + rejectIds.length + researchItems.length + extraIds.length > 0;
    const columnFullyDone = isGroupFullyDone(group);
    return (
      <div key={group.location}>
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={`text-sm font-semibold uppercase tracking-wide ${group.colorClass}`}>
            {group.location}
          </p>
          {canCheckAll && (
            <button
              type="button"
              onClick={() => toggleGroupAll(group)}
              className="flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              {columnFullyDone ? (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 flex-none" aria-hidden>
                    <path fillRule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clipRule="evenodd" />
                  </svg>
                  Uncheck all
                </>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 flex-none" aria-hidden>
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  Check all
                </>
              )}
            </button>
          )}
        </div>
        <ul className="space-y-2">
          {group.items.map((item) => {
            if (item.kind === 'pick-one-header') {
              const opts = item.pickOneOptions ?? [];
              const selectedId = getPickOneSelected(item.pickOneGroupKey!);
              const selectedOpt = opts.find((o) => o.questId === selectedId) ?? opts[0];
              return (
                <li key={item.id}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-400">
                    Crisis Choice — pick one
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {opts.map((opt) => {
                      const isSel = opt.questId === selectedId;
                      return (
                        <button
                          key={opt.questId}
                          type="button"
                          onClick={() => setPickOneOverrides((prev) => ({ ...prev, [item.pickOneGroupKey!]: opt.questId }))}
                          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                            isSel
                              ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:ring-rose-600'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {selectedOpt && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
                      Opens {selectedOpt.opensLabel} (in {selectedOpt.daysUntilStart} day{selectedOpt.daysUntilStart !== 1 ? 's' : ''})
                    </p>
                  )}
                </li>
              );
            }
            if (item.pickOneGroupKey && item.pickOneQuestId !== undefined &&
                item.pickOneQuestId !== getPickOneSelected(item.pickOneGroupKey)) {
              return null;
            }
            if (item.kind === 'callout') {
              return (
                <li key={item.id}>
                  <div className="rounded border border-pink-300 bg-white px-3 py-2 dark:border-pink-500/50 dark:bg-pink-950/10">
                    {item.label.split('\n').map((line, i) => (
                      <p key={i} className={`text-base text-slate-600 dark:text-slate-300 ${i > 0 ? 'mt-1' : ''}`}>
                        {i === 0 && <span className="font-bold text-pink-500 dark:text-pink-400">* </span>}
                        {line}
                      </p>
                    ))}
                  </div>
                </li>
              );
            }
            if (item.kind === 'info') {
              return (
                <li key={item.id}>
                  {item.dividerLabel && (
                    <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 first:mt-0">
                      {item.dividerLabel}
                    </p>
                  )}
                  <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-600/50 dark:bg-amber-900/20">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">{item.label}</p>
                    {item.detail && (
                      <p className="text-sm text-amber-700 dark:text-amber-400 leading-snug">{item.detail}</p>
                    )}
                  </div>
                </li>
              );
            }
            if (item.kind === 'hold-warning') {
              return (
                <li key={item.id}>
                  <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-600/50 dark:bg-amber-900/20">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                      Hold on to your items!
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 leading-snug">
                      {item.holdItems && item.holdItems.length > 0 ? (
                        <>
                          Do not sell or otherwise lose your{' '}
                          {item.holdItems.map((hi, idx) => (
                            <span key={hi.name}>
                              {idx > 0 && (idx === item.holdItems!.length - 1 ? ' or ' : ', ')}
                              <strong>{hi.amount > 1 ? `${hi.amount}× ` : ''}{hi.name}</strong>
                            </span>
                          ))}
                          {' '}— keep {item.holdItems.length === 1 ? 'it' : 'them'} to turn in for <strong>{item.label}</strong>.
                        </>
                      ) : (
                        <>Do not sell items needed for <strong>{item.label}</strong>.</>
                      )}
                    </p>
                    {item.detail && (
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">{item.detail}</p>
                    )}
                  </div>
                </li>
              );
            }
            const done = checked.has(item.id);
            if (item.kind === 'research') {
              const mid = item.museumItemId;
              if (mid !== undefined) {
                const checkedInGroup = researchDone.get(mid);
                if (checkedInGroup !== undefined && checkedInGroup !== group.location) return null;
                const researchDone_ = checkedInGroup === group.location;
                return (
                  <li key={item.id}>
                    {item.dividerLabel && (
                      <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 first:mt-0">
                        {item.dividerLabel}
                      </p>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        checked={researchDone_}
                        onChange={() => toggleResearch(mid, group.location)}
                        className="h-4 w-4 flex-none cursor-pointer rounded border-slate-300 accent-emerald-500"
                      />
                      {item.iconNode}
                      <span className={`text-base leading-snug ${researchDone_ ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                        {item.label}
                      </span>
                    </label>
                  </li>
                );
              }
              return null;
            }
            const isRejected = rejected.has(item.id);
            const isStruck = done || isRejected;
            const showUpgradeReqs = item.upgradeDetails ? checked.has(item.id + '-show') : false;
            const isUpgradeParent = item.id === 'mining-upgrade' && !!item.upgradeDetails;
            const showInfoIcon = isUpgradeParent && !showUpgradeReqs;
            const upgradeLabelCursor = isUpgradeParent
              ? (showUpgradeReqs && !done ? 'cursor-not-allowed' : 'cursor-default')
              : (isRejected ? 'cursor-not-allowed' : 'cursor-pointer');
            return (
              <li key={item.id}>
                {item.dividerLabel && (
                  <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 first:mt-0">
                    {item.dividerLabel}
                  </p>
                )}
                <label className={`flex select-none gap-2 ${upgradeLabelCursor} ${item.iconNode ? 'items-center' : 'items-start gap-2.5'}`}>
                  {showInfoIcon ? (
                    <svg viewBox="0 0 20 20" className="h-5 w-5 flex-none mt-0.5 shrink-0" aria-hidden style={{ filter: 'none' }}>
                      <circle cx="10" cy="10" r="9" stroke="#d97706" strokeWidth="1.75" fill="#ffffff"/>
                      <circle cx="10" cy="6.5" r="1.2" fill="#d97706" style={{ filter: 'none' }}/>
                      <rect x="8.85" y="9" width="2.3" height="6" rx="1.15" fill="#d97706" style={{ filter: 'none' }}/>
                    </svg>
                  ) : (
                    <AppTooltip
                      content={isUpgradeParent && !done ? <span className="text-slate-200 text-sm leading-snug">Please gather the items, check their boxes below, and check that you have delivered to Gruff under "IN THE FOREST", then this task will be auto-completed.</span> : null}
                      width="w-72"
                    >
                      <span className={`inline-flex flex-none shrink-0${item.iconNode ? '' : ' mt-0.5'}`}>
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggle(item.id)}
                          disabled={isRejected || isUpgradeParent}
                          className={`h-4 w-4 block rounded border-slate-300 accent-emerald-500 ${
                            isUpgradeParent
                              ? `cursor-not-allowed${done ? '' : ' opacity-40'}`
                              : isRejected
                                ? 'cursor-not-allowed opacity-40'
                                : 'cursor-pointer'
                          }`}
                        />
                      </span>
                    </AppTooltip>
                  )}
                  {item.iconNode}
                  <span className={`text-base leading-snug ${isStruck ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                    {item.label}
                    {item.asterisk && (
                      <span className="ml-0.5 font-bold text-pink-500 dark:text-pink-400"> *</span>
                    )}
                    {item.townQuestReadyLabel && (
                      <span className="ml-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ {item.townQuestReadyLabel}</span>
                    )}
                    {item.detail && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-base text-slate-400 dark:text-slate-500 flex-wrap">
                        {item.questAcceptItems && item.questAcceptItems.length > 0 && (
                          <span className="flex flex-none items-center gap-1">
                            {item.questAcceptItems.map((qi) => (
                              <QuestItemIcon
                                key={qi.name}
                                name={qi.name}
                                stillNeed={Math.max(0, qi.amount - qi.invCount - qi.storCount)}
                                have={qi.invCount + qi.storCount}
                                amount={qi.amount}
                                questName={qi.questName}
                                invCount={qi.invCount}
                                storCount={qi.storCount}
                                forageableInfo={qi.forageableInfo}
                                processorRecipe={qi.processorRecipe}
                              />
                            ))}
                          </span>
                        )}
                        <span>
                          {item.detail}
                          {item.upgradeDetails && (
                            <span onClick={(e) => e.stopPropagation()}>
                              {' '}
                              <input
                                type="checkbox"
                                checked={showUpgradeReqs}
                                onChange={() => toggle(item.id + '-show')}
                                className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-500 align-middle"
                              />
                            </span>
                          )}
                          {item.rejectCheckbox && (
                            <span onClick={(e) => e.stopPropagation()}>
                              {' '}?{' '}
                              <input
                                type="checkbox"
                                checked={isRejected}
                                onChange={() => toggleReject(item.id)}
                                className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-400 align-middle"
                              />
                            </span>
                          )}
                        </span>
                      </span>
                    )}
                  </span>
                </label>
                {item.birthdayFavorites && item.birthdayFavorites.length > 0 && (
                  <div className="ml-6 mt-1.5 flex flex-wrap gap-1.5">
                    {item.birthdayFavorites.map((gift) => (
                      <GiftItemIcon key={gift.name} name={gift.name} sentiment="favorite" storageCount={gift.storageCount} size="sm" />
                    ))}
                  </div>
                )}
                {item.pickupSuggestions && item.pickupSuggestions.length > 0 && (
                  <div className="ml-6 mt-1.5 space-y-0.5">
                    <p className="text-xs text-slate-400 dark:text-slate-500">You have enough bars to start another upgrade:</p>
                    {item.pickupSuggestions.map((s) => (
                      <p key={s} className="text-xs text-emerald-600 dark:text-emerald-400">• {s}</p>
                    ))}
                  </div>
                )}
                {item.upgradeDetails && showUpgradeReqs && (() => {
                  const ud = item.upgradeDetails!;
                  const barTooltip = (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-400 text-sm">Storage</span>
                        <span className="font-semibold text-amber-300 text-sm">{ud.barCount}</span>
                      </div>
                      {ud.barProcessorCount > 0 && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400 text-sm">Processing</span>
                          <span className="font-semibold text-sky-300 text-sm">{ud.barProcessorCount}</span>
                        </div>
                      )}
                      {ud.barContributedCount > 0 && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400 text-sm">Contributed</span>
                          <span className="font-semibold text-rose-300 text-sm">{ud.barContributedCount}</span>
                        </div>
                      )}
                      {ud.orePerLoc.length > 0 ? (
                        <div className="border-t border-slate-700 pt-1.5">
                          <div className="text-slate-400 text-sm mb-1">{ud.oreName}:</div>
                          {ud.orePerLoc.map(({ label, count }) => (
                            <div key={label} className="flex items-center justify-between gap-4">
                              <span className="text-slate-400 text-sm">{label}</span>
                              <span className="font-semibold text-amber-300 text-sm">{count}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border-t border-slate-700 pt-1.5 text-slate-500 text-sm">{ud.oreName}: none in storage</div>
                      )}
                    </div>
                  );
                  const coinTooltip = ud.money != null ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-400 text-sm">You have</span>
                      <span className="font-semibold text-amber-300 text-sm">{ud.money.toLocaleString()} coins</span>
                    </div>
                  ) : null;
                  const barDone = checked.has(item.id + '-req-bar') || done;
                  const coinDone = checked.has(item.id + '-req-coins') || done;
                  // Bar icons match research icon size; coin PNG is visually denser so kept smaller
                  const barIconCls = 'h-[37px] w-[37px] flex-none object-contain';
                  const coinIconCls = 'h-6 w-6 flex-none object-contain';
                  return (
                    <div className="mt-2 ml-6 space-y-1.5">
                      <AppTooltip content={barTooltip} width="w-52">
                        <label className="flex cursor-pointer select-none items-center gap-2">
                          <input
                            type="checkbox"
                            checked={barDone}
                            onChange={() => toggle(item.id + '-req-bar')}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-500"
                          />
                          <span className={`flex items-center gap-2 text-sm leading-snug ${barDone ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-600 dark:text-slate-400'}`}>
                            <img src={`/items/${ud.material.replace(/ /g, '_')}.png`} alt="" className={barIconCls} />
                            {ud.amount}× {ud.material}
                          </span>
                        </label>
                      </AppTooltip>
                      <AppTooltip content={coinTooltip}>
                        <label className="flex cursor-pointer select-none items-center gap-2">
                          <input
                            type="checkbox"
                            checked={coinDone}
                            onChange={() => toggle(item.id + '-req-coins')}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-500"
                          />
                          <span className={`flex items-center gap-2 text-sm leading-snug ${coinDone ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-600 dark:text-slate-400'}`}>
                            <img src="/items/Coin.png" alt="" className={coinIconCls} />
                            {ud.coins} coins
                          </span>
                        </label>
                      </AppTooltip>
                    </div>
                  );
                })()}
              </li>
            );
          })}
          {group.location === 'In the Forest' && gruffQuestVisible && (
            <li>
              <label className={`flex select-none items-start gap-2.5 ${gruffReqsDone ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={gruffChecked}
                  onChange={toggleGruff}
                  disabled={!gruffReqsDone}
                  className={`h-4 w-4 flex-none rounded border-slate-300 accent-emerald-500 mt-0.5 ${gruffReqsDone ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                />
                <span className={`text-base leading-snug ${gruffChecked ? 'text-slate-400 line-through dark:text-slate-500' : gruffReqsDone ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                  Deliver pickaxe upgrade items to Gruff
                </span>
              </label>
            </li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={!collapsed}
      >
        <div className="flex flex-1 min-w-0 items-center gap-3">
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Today's To-Do
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-base font-medium ${
            allDone
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
          }`}>
            {doneCount}/{total}
          </span>
          <AppTooltip
            content={
              <p className="text-slate-200 text-sm">
                Click Reset to uncheck all tasks on the whole list.
              </p>
            }
            width="w-56"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetAll();
              }}
              className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-800 dark:border-amber-600/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 dark:hover:text-amber-300"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 flex-none" aria-hidden>
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
              </svg>
              RESET
            </button>
          </AppTooltip>
          {isLastStandDate && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex flex-1 min-w-0 items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 mx-[2em] px-3 py-2 text-base leading-relaxed text-yellow-900 dark:border-yellow-600/30 dark:bg-yellow-900/20 dark:text-yellow-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-7 w-7 flex-none text-red-500" aria-hidden="true">
                <polygon points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5" fill="currentColor" />
                <rect x="10.75" y="5.5" width="2.5" height="8.5" rx="1.25" fill="white" />
                <circle cx="12" cy="17.5" r="1.5" fill="white" />
              </svg>
              <span>Year 1 concludes the currently released version of this game, at sleep time on Winter 28. The event that night will end your ability to play as {selectedCharacter?.character_name ?? 'your character'} (until the new game content is released).</span>
            </div>
          )}
          {allDone && (
            <span className="text-base font-medium text-emerald-600 dark:text-emerald-400">All done!</span>
          )}
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-5 w-5 flex-none text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} aria-hidden>
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      <div className="mx-5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${barPct}%` }}
        />
      </div>

      {!collapsed && (
        <div className="flex gap-5 px-5 pb-5 pt-4">
          <div className="min-w-0 flex-1">
            <div className="space-y-5">
              <div className="grid gap-5 items-start sm:grid-cols-2 lg:grid-cols-4">
                {topRowGroups.map(renderGroupColumn)}
              </div>
              {bottomRowGroups.length > 0 && (
                <div className="grid gap-5 items-start sm:grid-cols-2 lg:grid-cols-4">
                  {bottomRowGroups.map(renderGroupColumn)}
                  {docksGroup && topRowGroups.length + bottomRowGroups.length === 7 && renderGroupColumn(docksGroup)}
                </div>
              )}
              {docksGroup && topRowGroups.length + bottomRowGroups.length !== 7 && (
                <div className="grid gap-5 items-start sm:grid-cols-2 lg:grid-cols-4">
                  {renderGroupColumn(docksGroup)}
                </div>
              )}
              {extraGroups.length > 0 && (
                <div className={`grid gap-5 items-start sm:grid-cols-2 ${extraGroups.length === 1 ? 'lg:grid-cols-2' : 'lg:grid-cols-2'}`}>
                  {extraGroups.map(renderGroupColumn)}
                </div>
              )}
            </div>
          </div>
          {debugColumn && (
            <div className="w-52 shrink-0 border-l border-slate-200 pl-5 dark:border-slate-700">
              {debugColumn}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function YearGoalsCard({ items, mutexPairs }: { items: ChecklistItem[]; mutexPairs: number[][] }) {
  const [collapsed, setCollapsed] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(YEAR_GOALS_CHECKED_KEY);
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  // Per-pair selection: which crisis option is currently displayed
  function pairStorageKey(ids: number[]) { return 'grimshire-yg-mx-' + [...ids].sort((a, b) => a - b).join('_'); }
  const [mutexSelections, setMutexSelections] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const pair of mutexPairs) {
      const k = pairStorageKey(pair);
      try { const raw = sessionStorage.getItem(k); if (raw !== null) result[k] = JSON.parse(raw) as number; } catch { /* ignore */ }
    }
    return result;
  });
  function getSelectedForPair(pair: number[]): number { return mutexSelections[pairStorageKey(pair)] ?? pair[0]; }
  function selectInPair(pair: number[], questId: number) {
    const k = pairStorageKey(pair);
    setMutexSelections((prev) => {
      const next = { ...prev, [k]: questId };
      try { sessionStorage.setItem(k, JSON.stringify(questId)); } catch { /* storage full */ }
      return next;
    });
  }

  // Map groupKey → index into mutexPairs (for undecided pairs only)
  const mutexPairByGroupKey = new Map<string, number>();
  for (let i = 0; i < mutexPairs.length; i++) {
    for (const qId of mutexPairs[i]) mutexPairByGroupKey.set(`ygq-${qId}`, i);
  }

  // Group items by groupKey, preserving insertion order (already chronologically sorted)
  type QuestGroup = { key: string; title: string; opensStr: string; items: ChecklistItem[] };
  const questGroups: QuestGroup[] = [];
  const seenKeys = new Map<string, number>();
  for (const item of items) {
    const key = item.groupKey ?? item.id;
    if (!seenKeys.has(key)) {
      const rawTitle = item.dividerLabel ?? key;
      const dashIdx = rawTitle.indexOf(' — ');
      const title = dashIdx >= 0 ? rawTitle.slice(0, dashIdx) : rawTitle;
      const opensStr = dashIdx >= 0 ? rawTitle.slice(dashIdx + 3) : '';
      seenKeys.set(key, questGroups.length);
      questGroups.push({ key, title, opensStr, items: [] });
    }
    questGroups[seenKeys.get(key)!].items.push(item);
  }

  // Combine mutex-paired groups into single render entries
  type RenderItem =
    | { type: 'normal'; group: QuestGroup }
    | { type: 'mutex'; pairIndex: number; pairIds: number[]; groups: QuestGroup[] };
  const seenMutexPairIndices = new Set<number>();
  const renderList: RenderItem[] = [];
  for (const group of questGroups) {
    const pairIdx = mutexPairByGroupKey.get(group.key);
    if (pairIdx !== undefined) {
      if (!seenMutexPairIndices.has(pairIdx)) {
        seenMutexPairIndices.add(pairIdx);
        renderList.push({
          type: 'mutex',
          pairIndex: pairIdx,
          pairIds: mutexPairs[pairIdx],
          groups: questGroups.filter(g => mutexPairByGroupKey.get(g.key) === pairIdx),
        });
      }
    } else {
      renderList.push({ type: 'normal', group });
    }
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { sessionStorage.setItem(YEAR_GOALS_CHECKED_KEY, JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
  }

  const checkableItems = items.filter((i) => i.kind !== 'info' && i.kind !== 'callout');
  const doneCount = checkableItems.filter((i) => checked.has(i.id)).length;
  const totalCheckable = checkableItems.length;
  const allDone = totalCheckable > 0 && doneCount === totalCheckable;

  const n = renderList.length;
  const gridCols =
    n <= 1 ? 'grid-cols-1' :
    n === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    n === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  function renderItemsList(groupItems: ChecklistItem[]) {
    return (
      <ul className="space-y-2">
        {groupItems.map((item) => {
          if (item.kind === 'info') {
            return (
              <li key={item.id}>
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-600/50 dark:bg-amber-900/20">
                  <div className="flex items-center gap-2 mb-1">
                    {item.iconNode}
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{item.label}</p>
                  </div>
                  {item.detail && (
                    <p className="text-sm text-amber-700 dark:text-amber-400 leading-snug">{item.detail}</p>
                  )}
                </div>
              </li>
            );
          }
          const done = checked.has(item.id);
          return (
            <li key={item.id}>
              <label className={`flex cursor-pointer select-none gap-2 ${item.iconNode ? 'items-center' : 'items-start'}`}>
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(item.id)}
                  className={`h-4 w-4 flex-none rounded border-slate-300 accent-emerald-500 cursor-pointer ${item.iconNode ? '' : 'mt-0.5'}`}
                />
                {item.iconNode}
                <span className={`text-base leading-snug ${done ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                  {item.label}
                  {item.detail && (
                    <span className="mt-0.5 block text-sm text-slate-400 dark:text-slate-500">
                      {item.detail}
                    </span>
                  )}
                  {item.perishableWarning && !done && (
                    <span className="mt-1.5 flex items-start gap-1.5 rounded border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-sm text-orange-700 dark:border-orange-600/50 dark:bg-orange-900/20 dark:text-orange-300 leading-snug not-italic">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-none mt-0.5 shrink-0" aria-hidden>
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      {item.perishableWarning}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderQuestGroup(group: QuestGroup) {
    return (
      <div key={group.key} className="min-w-0">
        <div className="mb-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400 leading-tight">
            {group.title}
          </p>
          {group.opensStr && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{group.opensStr}</p>
          )}
        </div>
        {renderItemsList(group.items)}
      </div>
    );
  }

  function renderMutexGroup(ri: Extract<RenderItem, { type: 'mutex' }>) {
    const selectedQuestId = getSelectedForPair(ri.pairIds);
    const selectedGroup = ri.groups.find(g => g.key === `ygq-${selectedQuestId}`) ?? ri.groups[0];
    return (
      <div key={`mutex-${ri.pairIndex}`} className="min-w-0">
        <div className="mb-2">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-400">
            Crisis Choice — pick one
          </p>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {ri.groups.map(g => {
              const qId = parseInt(g.key.slice(4)); // 'ygq-123' → 123
              const isSelected = qId === selectedQuestId;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => selectInPair(ri.pairIds, qId)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:ring-rose-600'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                  }`}
                >
                  {g.title}
                </button>
              );
            })}
          </div>
          {selectedGroup.opensStr && (
            <p className="text-xs text-slate-400 dark:text-slate-500">{selectedGroup.opensStr}</p>
          )}
        </div>
        {renderItemsList(selectedGroup.items)}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={!collapsed}
      >
        <div className="flex flex-1 min-w-0 items-center gap-3 flex-wrap">
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Year Goals
          </span>
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-base font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
            {renderList.length} quest{renderList.length !== 1 ? 's' : ''}
          </span>
          {totalCheckable > 0 && (
            <span className={`rounded-full px-2.5 py-0.5 text-base font-medium ${allDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
              {doneCount}/{totalCheckable} noted
            </span>
          )}
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-5 w-5 flex-none text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} aria-hidden>
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 pt-2">
          <div className={`grid gap-5 items-start ${gridCols}`}>
            {renderList.map((ri) =>
              ri.type === 'normal' ? renderQuestGroup(ri.group) : renderMutexGroup(ri)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type TipsTab = 'events' | 'quests' | 'research' | 'upgrades' | 'critters' | 'farm';
const TIPS_TAB_KEY = 'tips-active-tab';

function critterSeasonContainerClass(colCount: number, itemCount: number): string {
  const base = 'grid divide-y divide-slate-900/10 dark:divide-slate-700 pt-4';
  if (colCount === 1) return `${base} grid-cols-1`;
  if (colCount === 2) return `${base} grid-cols-1 sm:grid-cols-2 sm:grid-rows-[auto_auto_auto_auto_auto_auto] sm:divide-x sm:divide-y-0`;
  if (colCount === 3) return `${base} grid-cols-1 sm:grid-cols-3 sm:grid-rows-[auto_auto_auto_auto_auto_auto] sm:divide-x sm:divide-y-0`;
  if (colCount === 4 && itemCount === 8) return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0`;
  if (colCount === 4) return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0`;
  if (colCount === 5) return `${base} grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:grid-rows-[auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0`;
  return `${base} grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:grid-rows-[auto_auto_auto_auto_auto_auto] lg:divide-x lg:divide-y-0`;
}

function critterSeasonArticleClass(colCount: number): string {
  if (colCount === 1) return 'flex flex-col';
  if (colCount <= 3) return 'flex flex-col sm:grid sm:grid-rows-subgrid sm:row-span-6';
  return 'flex flex-col lg:grid lg:grid-rows-subgrid lg:row-span-6';
}

function renderCritterCard(variant: Critter, dateStr: string, articleClass: string, extraClass = '', forageableByName?: Map<string, ForageableEntry>, storageNameMap?: Map<string, number>, inventoryNameMap?: Map<string, number>, processorNameMap?: Map<string, number>) {
  const isActive = daysRemainingInRange(variant.activeAt, dateStr) > 0;
  const bg = `transition-colors duration-200${isActive ? ' bg-yellow-50 dark:bg-teal-900/40' : ''}`;
  const imgBg = isActive ? 'bg-gradient-to-b from-white to-yellow-50 dark:from-slate-800 dark:to-teal-900/40' : '';
  const foods = [...variant.foods, ...CUSTOM_CRITTER_FOODS];
  return (
    <article key={variant.id} className={`${articleClass}${extraClass ? ` ${extraClass}` : ''}`}>
      <div className={`flex h-36 items-center justify-center overflow-hidden px-6 pt-6 transition-colors duration-200${imgBg ? ` ${imgBg}` : ''}`}>
        <img
          src={variant.image}
          alt={`${variant.subtype} ${variant.critterType}`}
          className={`rounded-lg object-contain ${variant.critterType === 'Bluggy' ? 'max-h-[72px] max-w-[90px]' : 'max-h-full max-w-[180px]'}`}
        />
      </div>
      <div className={`px-6 pt-3 ${bg}`}>
        <h2 className="font-bold text-slate-900 dark:text-slate-100 [text-shadow:0_1px_3px_rgba(0,0,0,0.18)] dark:[text-shadow:0_1px_4px_rgba(0,0,0,0.55)] [@media(min-width:1920px)]:text-xl">
          {variant.subtype} {variant.critterType}
        </h2>
      </div>
      <div className={`px-6 pt-4 ${bg}`}>
        <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tame With</dt>
        <dd className="mt-1 text-slate-800 dark:text-slate-200">
          {foods.length === 0 ? (
            <span className="italic text-slate-400 dark:text-slate-500">None listed</span>
          ) : (
            <ul className="space-y-1">
              {foods.map((food, i) => {
                const forageableInfo = forageableByName?.get(food.name.toLowerCase());
                const storageCount = storageNameMap ? (storageNameMap.get(food.name) ?? 0) : undefined;
                const inventoryCount = inventoryNameMap ? (inventoryNameMap.get(food.name) ?? 0) : undefined;
                const hasTooltip = food.locationHint || forageableInfo || storageCount !== undefined || inventoryCount !== undefined;
                if (!hasTooltip) {
                  return (
                    <li key={i} className="flex items-center gap-2">
                      {food.image && <img src={food.image} alt={food.name} className="h-9 w-9 flex-shrink-0 rounded object-contain" />}
                      <span>{food.name}</span>
                    </li>
                  );
                }
                return (
                  <AppTooltip key={i} content={<CritterFoodTooltipContent food={food} forageableInfo={forageableInfo} inventoryCount={inventoryCount} storageCount={storageCount} processorCount={processorNameMap ? (processorNameMap.get(food.name) ?? 0) : undefined} />} width="w-56">
                    <li className="flex cursor-help items-center gap-2">
                      {food.image && <img src={food.image} alt={food.name} className="h-9 w-9 flex-shrink-0 rounded object-contain" />}
                      <span>{food.name}</span>
                    </li>
                  </AppTooltip>
                );
              })}
            </ul>
          )}
        </dd>
      </div>
      <div className={`px-6 pt-4 ${bg}`}>
        <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Habitat</dt>
        <dd className="mt-1 text-slate-800 dark:text-slate-200">{variant.habitat}</dd>
      </div>
      <div className={`px-6 pt-4 ${bg}`}>
        <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Active</dt>
        <dd className="mt-1 text-slate-800 dark:text-slate-200">
          {variant.activeAt.includes(' to ') ? (
            <>{variant.activeAt.split(' to ')[0]}<br />{'to ' + variant.activeAt.split(' to ')[1]}</>
          ) : variant.activeAt}
        </dd>
      </div>
      <div className={`px-6 pt-4 pb-6 ${bg}`}>
        <p className="text-sm italic text-slate-700 dark:text-white">{variant.description}</p>
      </div>
    </article>
  );
}

type CropGroup = {
  cropRefId: number;
  name: string;
  image: string;
  daysToMaturity: number;
  goneToSeedDays: number | null;
  isMultiHarvest: boolean;
  readyCount: number;       // harvestable for crop produce (daysToMaturity ≤ daysWatered < goneToSeedDays)
  goneToSeedCount: number;  // gone to seed — yields seeds, crop only on bumper
  growingEntries: number[];  // daysWatered values for still-growing tiles
  deadCount: number;
};

function SeedHarvestCalc({ cropsData }: { cropsData: CropEntry[] | null }) {
  type CropOption = { name: string; daysToMaturity: number; avgFertility: number; tileCount: number };
  const cropOptions: CropOption[] = [];
  if (cropsData) {
    const seen = new Map<number, { name: string; daysToMaturity: number; fertilitySum: number; count: number }>();
    for (const c of cropsData) {
      if (c.requiresWatering === false) continue;
      if (!seen.has(c.cropRefId)) {
        seen.set(c.cropRefId, { name: c.name, daysToMaturity: c.daysToMaturity, fertilitySum: c.fertility ?? 0, count: 1 });
      } else {
        const e = seen.get(c.cropRefId)!;
        e.fertilitySum += c.fertility ?? 0;
        e.count++;
      }
    }
    cropOptions.push(
      ...Array.from(seen.values())
        .map((e) => ({ name: e.name, daysToMaturity: e.daysToMaturity, avgFertility: e.fertilitySum / e.count, tileCount: e.count }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  const [daysToMaturity, setDaysToMaturity] = useState(10);
  const [daysOnCompost, setDaysOnCompost] = useState(0);
  const [skill876, setSkill876] = useState(false);

  const rawMin = daysToMaturity > 0 ? daysOnCompost / (daysToMaturity + 1) : 0;
  const minChance = Math.min(rawMin + (skill876 ? 0.1 : 0), 0.8);
  const bumperPct = (0.1 / (1 - minChance)) * 100;
  const onlySeedsPct = 100 - bumperPct;

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">
        Gone-to-Seed Harvest Calculator
      </h2>
      <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
        When a crop goes to seed you always receive seeds — getting the crop produce too requires a
        hidden bumper-crop roll tied to how long the plant grew on fertilized soil. That roll is seeded
        per crop tile so the outcome is already fixed for each individual plant; more compost shifts the
        threshold and improves your odds across all tiles you plant.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 space-y-4">
        {cropOptions.length > 0 && (
          <div>
            <label className="block mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
              Pick a crop from your farm to auto-fill
            </label>
            <select
              defaultValue=""
              onChange={(e) => {
                const found = cropOptions.find((c) => c.name === e.target.value);
                if (found) {
                  setDaysToMaturity(found.daysToMaturity);
                  setDaysOnCompost(Math.round(found.avgFertility));
                }
              }}
              className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              <option value="">— select crop —</option>
              {cropOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.daysToMaturity} day{c.daysToMaturity !== 1 ? 's' : ''}{c.tileCount > 1 ? `, avg ${Math.round(c.avgFertility)} compost days across ${c.tileCount} tiles` : c.avgFertility > 0 ? `, ${Math.round(c.avgFertility)} compost days` : ''})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
              Days to maturity
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={daysToMaturity}
              onChange={(e) => setDaysToMaturity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
              Days grown on fertilized / composted soil
            </label>
            <input
              type="number"
              min={0}
              max={999}
              value={daysOnCompost}
              onChange={(e) => setDaysOnCompost(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
          </div>
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            checked={skill876}
            onChange={(e) => setSkill876(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Skill 876 unlocked{' '}
            <span className="text-slate-400 dark:text-slate-500">(+10% to bumper chance)</span>
          </span>
        </label>
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-700/50">
          <div className="mb-2 flex items-baseline gap-2.5">
            <span className={`text-3xl font-bold tabular-nums ${onlySeedsPct > 70 ? 'text-red-500 dark:text-red-400' : onlySeedsPct > 40 ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {onlySeedsPct.toFixed(1)}%
            </span>
            <span className="text-base text-slate-600 dark:text-slate-400">chance: seeds only (crop lost)</span>
          </div>
          <div className="mb-3 flex items-baseline gap-2.5">
            <span className={`text-3xl font-bold tabular-nums ${bumperPct >= 40 ? 'text-emerald-600 dark:text-emerald-400' : bumperPct >= 20 ? 'text-amber-500 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {bumperPct.toFixed(1)}%
            </span>
            <span className="text-base text-slate-600 dark:text-slate-400">chance: seeds + crop (bumper harvest)</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Fertility factor: {daysOnCompost} ÷ {daysToMaturity + 1} = {(rawMin * 100).toFixed(0)}%
            {skill876 ? ' + 10% (skill)' : ''} → {(minChance * 100).toFixed(0)}% of 80% cap
          </p>
        </div>
      </div>
    </section>
  );
}

function FarmTab({ cropsData, hasCharacter }: { cropsData: CropEntry[] | null; hasCharacter: boolean }) {
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  if (!hasCharacter) {
    return (
      <>
        <section>
          <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Farm Crops</h2>
          <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
            See what&apos;s planted and how close each crop is to harvest.
          </p>
          <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
            Load a save file to see your farm status.
          </p>
        </section>
        <SeedHarvestCalc cropsData={null} />
      </>
    );
  }

  if (!cropsData || cropsData.length === 0) {
    return (
      <>
        <section>
          <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Farm Crops</h2>
          <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
            See what&apos;s planted and how close each crop is to harvest.
          </p>
          <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
            No crops detected on your farm.
          </p>
        </section>
        <SeedHarvestCalc cropsData={null} />
      </>
    );
  }

  // Aggregate tiles by crop type
  const groupMap = new Map<number, CropGroup>();
  for (const entry of cropsData) {
    if (!groupMap.has(entry.cropRefId)) {
      groupMap.set(entry.cropRefId, {
        cropRefId: entry.cropRefId,
        name: entry.name,
        image: entry.image,
        daysToMaturity: entry.daysToMaturity,
        goneToSeedDays: entry.goneToSeedDays,
        isMultiHarvest: entry.isMultiHarvest,
        readyCount: 0,
        goneToSeedCount: 0,
        growingEntries: [],
        deadCount: 0,
      });
    }
    const g = groupMap.get(entry.cropRefId)!;
    const gts = entry.goneToSeedDays;
    if (entry.isDead) {
      g.deadCount++;
    } else if (gts !== null && entry.daysWatered >= gts) {
      g.goneToSeedCount++;
    } else if (entry.daysWatered >= entry.daysToMaturity) {
      g.readyCount++;
    } else {
      g.growingEntries.push(entry.daysWatered);
    }
  }

  // Sort: ready first, then gone-to-seed, then growing (fewest days remaining first), then dead-only groups
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const aHarvestable = a.readyCount > 0 || a.goneToSeedCount > 0;
    const bHarvestable = b.readyCount > 0 || b.goneToSeedCount > 0;
    if (aHarvestable !== bHarvestable) return aHarvestable ? -1 : 1;
    const aGrowing = a.growingEntries.length > 0;
    const bGrowing = b.growingEntries.length > 0;
    if (aGrowing !== bGrowing) return aGrowing ? -1 : 1;
    // Both growing: sort by min days remaining
    const aMinDays = a.daysToMaturity - Math.max(...a.growingEntries);
    const bMinDays = b.daysToMaturity - Math.max(...b.growingEntries);
    return aMinDays - bMinDays;
  });

  const totalTiles = cropsData.length;
  const readyTiles = cropsData.filter((c) => {
    const gts = c.goneToSeedDays;
    return !c.isDead && c.daysWatered >= c.daysToMaturity && (gts === null || c.daysWatered < gts);
  }).length;
  const goneToSeedTiles = cropsData.filter((c) => {
    const gts = c.goneToSeedDays;
    return !c.isDead && gts !== null && c.daysWatered >= gts;
  }).length;
  const deadTiles = cropsData.filter((c) => c.isDead).length;

  return (
    <>
    <section>
      <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Farm Crops</h2>
      <p className="mb-4 text-lg text-slate-700 dark:text-slate-300">
        <span className="font-semibold">{totalTiles}</span> crop tile{totalTiles !== 1 ? 's' : ''} planted
        {readyTiles > 0 && <> — <span className="font-semibold text-emerald-700 dark:text-emerald-400">{readyTiles} ready to harvest</span></>}
        {goneToSeedTiles > 0 && <> — <span className="font-semibold text-amber-600 dark:text-amber-400">{goneToSeedTiles} gone to seed</span></>}
        {deadTiles > 0 && <> — <span className="font-semibold text-slate-500">{deadTiles} dead</span></>}
        .
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const hasReady = g.readyCount > 0;
          const hasGoneToSeed = g.goneToSeedCount > 0;
          const hasGrowing = g.growingEntries.length > 0;
          const hasOnlyDead = g.deadCount > 0 && !hasReady && !hasGoneToSeed && !hasGrowing;
          const isFullyReady = hasReady && !hasGoneToSeed && !hasGrowing && g.deadCount === 0;
          const isFullyGoneToSeed = !hasReady && hasGoneToSeed && !hasGrowing && g.deadCount === 0;
          const minDaysWatered = hasGrowing ? Math.max(...g.growingEntries) : 0;
          const daysLeft = hasGrowing ? g.daysToMaturity - minDaysWatered : 0;

          return (
            <div
              key={g.cropRefId}
              className={`flex items-start gap-3 rounded-xl p-3 shadow-sm ${
                hasOnlyDead
                  ? 'border border-slate-200 bg-slate-50 opacity-60 dark:border-slate-700 dark:bg-slate-800/40'
                  : isFullyReady
                    ? 'border-2 border-emerald-600 bg-white dark:border-emerald-500 dark:bg-slate-800'
                    : isFullyGoneToSeed
                      ? 'border-2 border-amber-500 bg-white dark:border-amber-400 dark:bg-slate-800'
                      : (hasReady || hasGoneToSeed)
                        ? 'border-2 border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                        : 'border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              {/* Crop icon */}
              {!imgErrors[g.cropRefId] ? (
                <img
                  src={g.image}
                  alt={g.name}
                  className={`h-11 w-11 flex-none rounded object-contain ${hasOnlyDead ? 'grayscale' : ''}`}
                  onError={() => setImgErrors((prev) => ({ ...prev, [g.cropRefId]: true }))}
                />
              ) : (
                <div className="flex h-11 w-11 flex-none items-center justify-center rounded bg-slate-100 text-lg dark:bg-slate-700">
                  🌱
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-lg font-semibold text-slate-800 dark:text-slate-200">{g.name}</span>
                  {g.isMultiHarvest && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      multi-harvest
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 pb-3">
                  {hasReady && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3.5 py-1 text-base font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      ✓ {g.readyCount} ready to harvest
                    </span>
                  )}
                  {hasGoneToSeed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3.5 py-1 text-base font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      ⚠ {g.goneToSeedCount} gone to seed — harvest for seeds
                    </span>
                  )}
                  {hasGrowing && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3.5 py-1 text-base font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      {g.growingEntries.length} growing — {daysLeft} day{daysLeft !== 1 ? 's' : ''} to first ready
                    </span>
                  )}
                  {g.deadCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3.5 py-1 text-base font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {g.deadCount} dead
                    </span>
                  )}
                </div>

                {/* Progress bar for growing tiles */}
                {hasGrowing && (
                  <div className="w-full pr-14">
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-orange-300 dark:bg-orange-300 transition-all"
                        style={{ width: `${Math.round((minDaysWatered / g.daysToMaturity) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-base text-slate-600 dark:text-slate-300">
                      {minDaysWatered}/{g.daysToMaturity} days (furthest along)
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
    <SeedHarvestCalc cropsData={cropsData} />
    </>
  );
}

export default function Tips() {
  const { season, day, getCurrentDateString } = useDate();
  const { selectedCharacter, characterDetailLoading } = useAuth();
  const { preferences } = useSettings();
  const { isMobile } = useDevice();
  const showCommunityEvents = preferences.spoilers.show_undiscovered_community_events;

  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [museumItems, setMuseumItems] = useState<MuseumItem[]>([]);
  const [museumItemsLoaded, setMuseumItemsLoaded] = useState(false);
  const [useCharacterDate, setUseCharacterDate] = useState(false);
  const revealUndiscovered = preferences.spoilers.show_undiscovered_items;
  const showVillagerGifts = preferences.spoilers.show_villager_gifts;
  const [fishScheduleMap, setFishScheduleMap] = useState<Record<number, FishScheduleEntry>>({});
  const [mineralDataMap, setMineralDataMap] = useState<Record<number, MineralInfo>>({});
  const [forageableScheduleMap, setForageableScheduleMap] = useState<Record<number, ForageableEntry>>({});
  const [forageableByName, setForageableByName] = useState<Map<string, ForageableEntry>>(new Map());
  const [activeTab, setActiveTab] = useState<TipsTab>(() => (sessionStorage.getItem(TIPS_TAB_KEY) as TipsTab) ?? 'quests');
  const [mapLocation, setMapLocation] = useState<string | null>(null);
  const [critters, setCritters] = useState<Critter[]>([]);
  const [crittersLoading, setCrittersLoading] = useState(true);

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
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((data: MuseumItem[]) => { setMuseumItems(data); setMuseumItemsLoaded(true); })
      .catch(() => { setMuseumItemsLoaded(true); });
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

  useEffect(() => {
    fetch('/api/plants/all')
      .then((r) => r.ok ? r.json() : [])
      .then((data: ForageableEntry[]) => {
        const map: Record<number, ForageableEntry> = {};
        const byName = new Map<string, ForageableEntry>();
        for (const f of data) {
          map[f.item_id ?? f.id] = f;
          if (f.name) {
            byName.set(f.name.toLowerCase(), f);
            // The DB stores "Pepperwort Flower" but the JSON entry name is "Pepperwort"
            if (f.name === 'Pepperwort') byName.set('pepperwort flower', f);
          }
        }
        setForageableScheduleMap(map);
        setForageableByName(byName);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchCritters(controller.signal)
      .then((data) => setCritters(data))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      })
      .finally(() => setCrittersLoading(false));
    return () => controller.abort();
  }, []);

  const currentSeasonIdx = SEASON_IDX[season] ?? 0;
  const currentYearOffset = Math.max(0, (selectedCharacter?.current_year ?? 1) - 1);
  const currentAbs = toAbsDay(currentYearOffset, currentSeasonIdx, day);
  const pickaxeTier = selectedCharacter?.tool_data?.find((t) => t.toolName === 'pick')?.tier ?? 0;

  // When "use character date" is checked, ignore the header date picker for donation availability
  const effectiveSeasonIdx = (useCharacterDate && selectedCharacter?.current_season != null)
    ? selectedCharacter.current_season
    : currentSeasonIdx;
  const effectiveDay = (useCharacterDate && selectedCharacter?.current_day != null)
    ? selectedCharacter.current_day
    : day;

  // Deep Woods cannot unlock before Summer 16, Y1 (predator event first becomes playable that morning)
  const deepWoodsUnlocked =
    currentYearOffset > 0 ||
    effectiveSeasonIdx > 1 ||
    (effectiveSeasonIdx === 1 && effectiveDay >= 16);

  const inProgressQuestIds = new Set(
    (selectedCharacter?.quest_data ?? []).filter((q) => q.status === 1).map((q) => q.id),
  );

  const completedOrFailedQuestIds = new Set(
    (selectedCharacter?.quest_data ?? []).filter((q) => q.status === 2 || q.status === 3).map((q) => q.id),
  );

  // Mutually exclusive quest pairs — matches Quests.tsx MUTEX_PAIRS.
  // If one option is chosen (in progress or completed), the other is excluded everywhere.
  // Undecided pairs (neither accepted yet) are passed to YearGoalsCard for the toggle UI.
  const MUTEX_PAIRS: number[][] = [
    [350, 439],  // Herb Garden / Mushroom Hut
    [582, 583],  // Fish Farm / Redtide Remediation
    [584, 585],  // Crow Repellent / Crow Traps
    [586, 587],  // Predator Taming / Hunting Party
  ];
  const excludedByMutexIds = new Set<number>();
  const undecidedMutexPairs: number[][] = [];
  for (const pair of MUTEX_PAIRS) {
    const decided = pair.filter((id) => inProgressQuestIds.has(id) || completedOrFailedQuestIds.has(id));
    if (decided.length > 0) {
      for (const id of pair) {
        if (!decided.includes(id)) excludedByMutexIds.add(id);
      }
    } else {
      undecidedMutexPairs.push(pair);
    }
  }

  const matPileByQuest = new Map<number, Map<string, number>>();
  for (const pile of (selectedCharacter?.project_mat_pile_data ?? []) as MatPileEntry[]) {
    const itemMap = new Map<string, number>();
    for (const item of pile.donatedItems) itemMap.set(item.name, (itemMap.get(item.name) ?? 0) + item.amount);
    matPileByQuest.set(pile.questID, itemMap);
  }

  const activeQuests = allQuests.filter((q) => inProgressQuestIds.has(q.id) && q.id !== 1331);

  // ── Upcoming quest processor-prep alerts ────────────────────────────────────
  // For each not-yet-started quest opening within 7 days, flag any requirement
  // that needs a processor (Smoker, Barrel, Press, Smelter, etc.) so the player
  // knows to start producing it ahead of time.
  const PROCESSOR_RECIPES = processorDataJson.recipes as Record<string, ProcessorRecipe>;
  const RAW_SHELF_LIVES = (processorDataJson as unknown as { shelfLives: Record<string, number> }).shelfLives;
  const PREP_ALERT_DAYS = 7;

  // upcomingQuestPrepItems is built after inventory/storage maps are defined (below)

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

  const storageMap = buildStorageMap(selectedCharacter?.chest_data ?? []);
  const storageNameMap = buildStorageMapByName(selectedCharacter?.chest_data ?? []);
  const processorNameMap = buildProcessorMapByName(selectedCharacter?.chest_data ?? []);
  const contributedNameMap = buildContributedMapByName(selectedCharacter?.project_mat_pile_data ?? []);
  const inventoryNameMap = buildInventoryMapByName(selectedCharacter?.player_inventory ?? []);

  const upcomingQuestPrepItems: ChecklistItem[] = (() => {
    if (!selectedCharacter) return [];

    // First pass: collect all qualifying quests
    type PrepQuest = { quest: Quest; daysUntilStart: number; opensLabel: string };
    const prepQuests: PrepQuest[] = [];
    for (const quest of allQuests) {
      if (inProgressQuestIds.has(quest.id)) continue;
      if (completedOrFailedQuestIds.has(quest.id)) continue;
      if (excludedByMutexIds.has(quest.id)) continue;
      if (!quest.available_start_season || !quest.available_first_day) continue;
      if (!(quest.requirements ?? []).some((r) => PROCESSOR_RECIPES[r.name])) continue;
      let daysUntilStart: number | null = null;
      for (const yearOff of [currentYearOffset, currentYearOffset + 1]) {
        const startAbs = toAbsDay(yearOff, quest.available_start_season, quest.available_first_day);
        const delta = startAbs - currentAbs;
        if (delta >= 1 && delta <= PREP_ALERT_DAYS) { daysUntilStart = delta; break; }
      }
      if (daysUntilStart === null) continue;
      const opensLabel = `${SEASON_NAMES[quest.available_start_season]} ${quest.available_first_day}`;
      prepQuests.push({ quest, daysUntilStart, opensLabel });
    }

    // Identify which prep quests share a mutex pair with another prep quest
    const prepQuestIds = new Set(prepQuests.map((pq) => pq.quest.id));
    const prepMutexPairKey = new Map<number, string>(); // questId → pairKey
    for (const pair of MUTEX_PAIRS) {
      const inPrep = pair.filter((id) => prepQuestIds.has(id));
      if (inPrep.length >= 2) {
        const pairKey = [...pair].sort((a, b) => a - b).join('-');
        for (const id of inPrep) prepMutexPairKey.set(id, pairKey);
      }
    }

    const items: ChecklistItem[] = [];
    const processedPairKeys = new Set<string>();

    function emitPrepItems(pq: PrepQuest, pickOneGroupKey?: string) {
      const { quest, opensLabel, daysUntilStart } = pq;
      const questTitle = quest.display_title || quest.name;
      const prepReqs = (quest.requirements ?? []).filter((r) => PROCESSOR_RECIPES[r.name]);
      let firstEmitted = true;
      prepReqs.forEach((req) => {
        const recipe = PROCESSOR_RECIPES[req.name];
        if (!recipe) return;
        const invCount = inventoryNameMap.get(req.name) ?? 0;
        const storCount = storageNameMap.get(req.name) ?? 0;
        const procCount = processorNameMap.get(req.name) ?? 0;
        const have = invCount + storCount;
        const stillNeed = Math.max(0, req.amount - have);
        if (stillNeed === 0) return; // already have enough — skip
        const amtPrefix = req.amount > 1 ? `${req.amount}× ` : '';
        const isFirst = firstEmitted;
        firstEmitted = false;
        items.push({
          id: `prep-${quest.id}-${req.name.replace(/\s+/g, '-').toLowerCase()}`,
          label: `Make ${amtPrefix}${req.name}`,
          dividerLabel: !pickOneGroupKey && isFirst
            ? `"${questTitle}" — opens ${opensLabel} (in ${daysUntilStart} day${daysUntilStart !== 1 ? 's' : ''})`
            : undefined,
          groupKey: `prep-${quest.id}`,
          pickOneGroupKey,
          pickOneQuestId: pickOneGroupKey ? quest.id : undefined,
          detail: recipe.perishable && recipe.shelfLifeDays > 0
            ? `⚠ Lasts ${recipe.shelfLifeDays} days once made`
            : undefined,
          iconNode: (
            <QuestItemIcon
              name={req.name}
              stillNeed={stillNeed}
              have={have}
              amount={req.amount}
              questName={questTitle}
              invCount={invCount}
              storCount={storCount}
              processorCount={procCount}
              processorRecipe={recipe}
            />
          ),
        });
      });
    }

    for (const pq of prepQuests) {
      const pairKey = prepMutexPairKey.get(pq.quest.id);
      if (pairKey) {
        if (processedPairKeys.has(pairKey)) continue;
        processedPairKeys.add(pairKey);
        const pairPrepQuests = MUTEX_PAIRS
          .find((p) => p.includes(pq.quest.id) && p.some((id) => prepQuestIds.has(id) && id !== pq.quest.id))!
          .map((id) => prepQuests.find((x) => x.quest.id === id)!)
          .filter(Boolean);
        items.push({
          id: `mutex-prep-${pairKey}`,
          kind: 'pick-one-header',
          label: '',
          pickOneGroupKey: pairKey,
          pickOneOptions: pairPrepQuests.map((x) => ({
            questId: x.quest.id,
            label: x.quest.display_title || x.quest.name,
            opensLabel: x.opensLabel,
            daysUntilStart: x.daysUntilStart,
          })),
        });
        for (const pairPq of pairPrepQuests) emitPrepItems(pairPq, pairKey);
      } else {
        emitPrepItems(pq);
      }
    }

    return items;
  })();

  // ── Year-round non-urgent quest goals ──────────────────────────────────────
  // Lists every non-perishable item needed for future (not-yet-open) quests,
  // sorted chronologically.  Items already in inventory/storage show as amber
  // info boxes instead of checkboxes.  Quests open today are excluded here and
  // handled in the Town column instead.
  const currentAbsNorm = effectiveSeasonIdx * 28 + (effectiveDay - 1); // 0–111, year-normalised

  // Helper: where does the player have `name`?
  function itemLocation(name: string, need: number): { haveEnough: boolean; invCount: number; storCount: number; whereLabel: string } {
    const inv = inventoryNameMap.get(name) ?? 0;
    const stor = storageNameMap.get(name) ?? 0;
    const haveEnough = inv + stor >= need;
    let whereLabel = '';
    if (inv >= need) whereLabel = 'inventory';
    else if (stor >= need) whereLabel = 'storage';
    else {
      const parts: string[] = [];
      if (inv > 0) parts.push(`${inv} in inventory`);
      if (stor > 0) parts.push(`${stor} in storage`);
      whereLabel = parts.length ? parts.join(' + ') : '';
    }
    return { haveEnough, invCount: inv, storCount: stor, whereLabel };
  }

  // Quests available today but not yet accepted by the player (goes to town column).
  // Quests with a quest_giver are already shown by availableNotStartedQuests ("Talk to X to accept"),
  // so exclude them here to avoid showing the same quest twice.
  const openTodayNotAccepted: Quest[] = allQuests.filter((q) => {
    if (inProgressQuestIds.has(q.id) || completedOrFailedQuestIds.has(q.id)) return false;
    if (excludedByMutexIds.has(q.id)) return false;
    if (q.quest_giver) return false; // handled by availableNotStartedQuests
    if (!q.available_start_season === null || q.available_first_day === null) return false;
    const [startAbs, endAbs] = questAbsDays(q);
    return currentAbsNorm >= startAbs && currentAbsNorm <= endAbs;
  });

  const openTodayItems: ChecklistItem[] = openTodayNotAccepted.flatMap((quest) => {
    const questTitle = quest.display_title || quest.name;
    const nonPerishReqs = (quest.requirements ?? []).filter((r) => !PROCESSOR_RECIPES[r.name]?.perishable);
    if (nonPerishReqs.length === 0) return [];
    return nonPerishReqs.map((req, i) => {
      const { haveEnough, invCount, storCount, whereLabel } = itemLocation(req.name, req.amount);
      const giverNote = quest.quest_giver ? ` (from ${quest.quest_giver})` : '';
      if (haveEnough) {
        return {
          id: `open-today-${quest.id}-${req.name.replace(/\s+/g, '-').toLowerCase()}`,
          kind: 'info' as const,
          label: `${req.amount > 1 ? `${req.amount}× ` : ''}${req.name} — in ${whereLabel}`,
          detail: `Bring to accept "${questTitle}"${giverNote} — available today.`,
          dividerLabel: i === 0 ? `${questTitle} (available today)` : undefined,
          groupKey: `open-today-${quest.id}`,
        };
      }
      const have = invCount + storCount;
      const stillNeed = req.amount - have;
      return {
        id: `open-today-${quest.id}-${req.name.replace(/\s+/g, '-').toLowerCase()}`,
        label: `${req.amount}× ${req.name}${have > 0 ? ` (have ${have})` : ''}`,
        detail: `Accept "${questTitle}"${giverNote} today — still need ${stillNeed}× ${req.name}.`,
        dividerLabel: i === 0 ? `${questTitle} (available today)` : undefined,
        groupKey: `open-today-${quest.id}`,
      };
    });
  });

  // Non-urgent year goals: future quests sorted chronologically
  const yearGoalItems: ChecklistItem[] = (() => {
    if (!selectedCharacter) return [];

    const sortedQuests = allQuests
      .filter((q) => {
        if (inProgressQuestIds.has(q.id) || completedOrFailedQuestIds.has(q.id)) return false;
        if (excludedByMutexIds.has(q.id)) return false;
        if (openTodayNotAccepted.includes(q)) return false; // open today → town column
        if (q.available_start_season === null || q.available_first_day === null) return false;
        return (q.requirements ?? []).length > 0;
      })
      .sort((a, b) => {
        const [aStart] = questAbsDays(a);
        const [bStart] = questAbsDays(b);
        return aStart - bStart;
      });

    const items: ChecklistItem[] = [];

    for (const quest of sortedQuests) {
      const [startAbs] = questAbsDays(quest);
      if (startAbs <= currentAbsNorm) continue; // already open or past — skip

      const questTitle = quest.display_title || quest.name;
      const opensLabel = `${SEASON_NAMES[quest.available_start_season!]} ${quest.available_first_day}`;
      const daysUntilOpen = startAbs - currentAbsNorm;
      (quest.requirements ?? []).forEach((req, i) => {
        const { haveEnough, invCount, storCount, whereLabel } = itemLocation(req.name, req.amount);
        const itemId = `ygq-${quest.id}-${req.name.replace(/\s+/g, '-').toLowerCase()}`;
        const dividerLabel = i === 0 ? `${questTitle} — opens ${opensLabel}` : undefined;
        const groupKey = `ygq-${quest.id}`;

        const recipe = PROCESSOR_RECIPES[req.name];
        let shelfLife: number | null = null;
        if (recipe) {
          shelfLife = recipe.perishable ? (recipe.shelfLifeDays ?? null) : null;
        } else {
          const raw = RAW_SHELF_LIVES[req.name];
          shelfLife = (raw != null && raw > 0) ? raw : null;
        }
        const isPerishable = shelfLife !== null;
        const tooSoon = shelfLife !== null && daysUntilOpen > shelfLife;

        let safeStartLabel = '';
        if (tooSoon && shelfLife !== null) {
          const safeStartAbs = startAbs - shelfLife;
          if (safeStartAbs >= 0) {
            const safeSeason = Math.min(3, Math.floor(safeStartAbs / 28));
            const safeDay = (safeStartAbs % 28) + 1;
            safeStartLabel = `${SEASON_NAMES[safeSeason]} ${safeDay}`;
          } else {
            safeStartLabel = 'Day 1';
          }
        }

        // Processor recipes → "making"; farmable crops → "harvesting"; everything else (forageables, animal products) → "gathering"
        const forageEntry = !recipe ? forageableByName.get(req.name.toLowerCase()) : undefined;
        const actionVerb = recipe
          ? 'making'
          : forageEntry?.source === 'farmable'
            ? 'harvesting'
            : 'gathering';

        const have = invCount + storCount;
        const iconNode = (
          <QuestItemIcon
            name={req.name}
            stillNeed={Math.max(0, req.amount - have)}
            have={have}
            amount={req.amount}
            questName={questTitle}
            invCount={invCount}
            storCount={storCount}
            processorCount={processorNameMap.get(req.name) ?? 0}
            forageableInfo={forageEntry}
            processorRecipe={recipe}
          />
        );

        if (haveEnough) {
          if (tooSoon) {
            // Current stock may expire before the quest opens — flip to a warning instead of "ready"
            items.push({
              id: itemId,
              label: `${req.amount}× ${req.name} — in ${whereLabel}`,
              dividerLabel,
              groupKey,
              iconNode,
              perishableWarning: `${shelfLife}-day shelf life — don't rely on current stock. Get a fresh batch on or after ${safeStartLabel}.`,
            });
          } else {
            items.push({
              id: itemId,
              kind: 'info' as const,
              label: `${req.amount}× ${req.name} — in ${whereLabel}`,
              detail: `Don't sell or use these!${isPerishable && shelfLife ? ` (${shelfLife}-day shelf life — still fresh at quest open)` : ''}`,
              dividerLabel,
              groupKey,
              iconNode,
            });
          }
        } else {
          const haveStr = have > 0
            ? ` (have ${have}${invCount > 0 && storCount > 0 ? `: ${invCount} inv + ${storCount} storage` : invCount > 0 ? ' in inventory' : ' in storage'})`
            : '';
          const perishableWarning = tooSoon
            ? `${shelfLife}-day shelf life — don't stock up yet. Start ${actionVerb} on or after ${safeStartLabel}.`
            : isPerishable && shelfLife !== null
              ? `Perishable (${shelfLife}-day shelf life) — safe to start ${actionVerb} now.`
              : undefined;
          items.push({
            id: itemId,
            label: `${req.amount}× ${req.name}${haveStr}`,
            dividerLabel,
            groupKey,
            iconNode,
            perishableWarning,
          });
        }
      });
    }

    return items;
  })();

  const notDonatedNotDiscovered = (selectedCharacter && museumItemsLoaded)
    ? museumItems.filter((item) => !donatedSet.has(item.id) && !discoveredItemIds.has(item.id))
    : [];

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

  // Compute per-category "available today" counts and upcoming items for "When Can I Hit That?" card
  type MilestoneCatAvail = {
    label: string;
    availableCount: number;
    nextItems: Array<{ name: string; daysUntil: number; startSeason: number; startDay: number }>;
    tierLocked: number;
  };
  const milestoneCurrentAbsDay = effectiveSeasonIdx * 28 + (effectiveDay - 1);
  const milestoneNeeded = nextMilestone ? (donationThreshold(nextMilestone) ?? 0) - donatedCount : 0;
  const milestoneCatAvail: MilestoneCatAvail[] = (['fish', 'mineral', 'plant'] as const).map((cat) => {
    const catLabel = cat === 'fish' ? 'Fish' : cat === 'mineral' ? 'Minerals' : 'Plants';
    const notDonated = museumItems.filter((item) => item.category === cat && !donatedSet.has(item.id));
    const catIsAvailableToday = (item: MuseumItem): boolean => {
      if (cat === 'mineral') return isMineAccessible(mineralDataMap[item.id], pickaxeTier);
      const locs = cat === 'fish' ? fishScheduleMap[item.id]?.locations : forageableScheduleMap[item.id]?.locations;
      if (!deepWoodsUnlocked && isExclusivelyDeepWoods(locs)) return false;
      return cat === 'fish'
        ? isFishAvailable(fishScheduleMap[item.id], effectiveSeasonIdx, effectiveDay)
        : isForageableAvailable(forageableScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    };
    const availableCount = notDonated.filter(catIsAvailableToday).length;
    let nextItems: MilestoneCatAvail['nextItems'] = [];
    let tierLocked = 0;
    if (cat === 'mineral') {
      tierLocked = notDonated.filter((item) => !catIsAvailableToday(item)).length;
    } else {
      nextItems = notDonated
        .filter((item) => !catIsAvailableToday(item))
        .flatMap((item) => {
          const sched = cat === 'fish' ? fishScheduleMap[item.id] : forageableScheduleMap[item.id];
          if (!sched || sched.start_season == null || sched.start_day == null) return [];
          const startAbs = sched.start_season * 28 + (sched.start_day - 1);
          const daysUntil = ((startAbs - milestoneCurrentAbsDay) % TOTAL_DAYS + TOTAL_DAYS) % TOTAL_DAYS;
          if (daysUntil === 0) return [];
          return [{ name: item.name ?? '', daysUntil, startSeason: sched.start_season, startDay: sched.start_day }];
        })
        .sort((a, b) => a.daysUntil - b.daysUntil);
    }
    return { label: catLabel, availableCount, nextItems, tierLocked };
  });
  const milestoneTotalAvailableToday = milestoneCatAvail.reduce((sum, c) => sum + c.availableCount, 0);
  const milestoneStillNeeded = Math.max(0, milestoneNeeded - milestoneTotalAvailableToday);

  // Earliest possible date to hit the milestone: take all future fish+plant items sorted by daysUntil,
  // then find when the milestoneStillNeeded-th one becomes available.
  // Minerals have no time window (tier-gated), so they can't contribute here.
  const milestoneAllFutureItems = [
    ...(milestoneCatAvail.find((c) => c.label === 'Fish')?.nextItems ?? []),
    ...(milestoneCatAvail.find((c) => c.label === 'Plants')?.nextItems ?? []),
  ].sort((a, b) => a.daysUntil - b.daysUntil);

  let milestoneEarliestDate: string | null = null;
  if (milestoneStillNeeded > 0 && milestoneAllFutureItems.length >= milestoneStillNeeded) {
    const keyItem = milestoneAllFutureItems[milestoneStillNeeded - 1];
    const futureAbsDay = milestoneCurrentAbsDay + keyItem.daysUntil;
    const earnedSeason = Math.floor(futureAbsDay / 28) % 4;
    const earnedDay = (futureAbsDay % 28) + 1;
    milestoneEarliestDate = `${SEASON_NAMES[earnedSeason]} ${earnedDay}`;
  }

  // Build per-day acquisition table: group future items by daysUntil, stop once milestoneStillNeeded is reached
  // Each entry becomes one column; dates are abbreviated to 3-char season + day number.
  type MilestoneDayCol = { shortLabel: string; count: number; runningTotal: number; isGoal: boolean };
  const milestoneDayCols: MilestoneDayCol[] = [];
  if (milestoneStillNeeded > 0) {
    let cumulative = 0;
    for (const item of milestoneAllFutureItems) {
      if (cumulative >= milestoneStillNeeded) break;
      cumulative++;
      const abs = milestoneCurrentAbsDay + item.daysUntil;
      const shortLabel = `${SEASON_NAMES[Math.floor(abs / 28) % 4].slice(0, 3)} ${(abs % 28) + 1}`;
      const last = milestoneDayCols[milestoneDayCols.length - 1];
      if (last && last.shortLabel === shortLabel) {
        last.count++;
        last.runningTotal = cumulative;
        last.isGoal = cumulative >= milestoneStillNeeded;
      } else {
        milestoneDayCols.push({ shortLabel, count: 1, runningTotal: cumulative, isGoal: cumulative >= milestoneStillNeeded });
      }
    }
  }

  const crittersDateStr = getCurrentDateString();
  const crittersGrouped = critters.reduce<Map<string, Critter[]>>((acc, c) => {
    const group = acc.get(c.critterType) ?? [];
    acc.set(c.critterType, [...group, c]);
    return acc;
  }, new Map());
  const crittersActiveVariants: Critter[] = [];
  for (const [, variants] of crittersGrouped) {
    for (const v of variants) {
      if (daysRemainingInRange(v.activeAt, crittersDateStr) > 0) crittersActiveVariants.push(v);
    }
  }
  const crittersColCount = crittersActiveVariants.length === 8
    ? 4
    : Math.min(Math.max(crittersActiveVariants.length, 1), 6);

  // ─── Build dynamic daily checklist ────────────────────────────────────────

  // Crops
  const cropsData = selectedCharacter?.crops_data ?? [];
  const readyToHarvest = cropsData.filter((c) => {
    const gts = c.goneToSeedDays;
    return !c.isDead && c.daysWatered >= c.daysToMaturity && (gts === null || c.daysWatered < gts);
  });
  const goneToSeedCrops = cropsData.filter((c) => {
    const gts = c.goneToSeedDays;
    return !c.isDead && gts !== null && c.daysWatered >= gts;
  });
  const needsWatering = cropsData.filter((c) => !c.isDead && c.daysWatered < c.daysToMaturity && c.requiresWatering !== false);
  const deadCrops = cropsData.filter((c) => c.isDead);

  // Active quest item requirements vs what player has (inventory + storage combined).
  // For town quests: subtract already-donated amounts, then always show every item still
  // needed from the donation box's perspective — even if the player already has it on hand
  // (they still need to carry it to the box). stillNeed===0 items get a green "in hand" badge.
  const allPendingReqs = activeQuests.flatMap((q) => {
    const isTownQuest = !!q.is_town_quest;
    const donationMap = isTownQuest ? matPileByQuest.get(q.id) : undefined;
    return (q.requirements ?? []).flatMap((req) => {
      const alreadyDonated = donationMap?.get(req.name) ?? 0;
      const trueRemaining = Math.max(0, req.amount - alreadyDonated);
      if (trueRemaining === 0) return [];
      const invCount = inventoryNameMap.get(req.name) ?? 0;
      const storCount = storageNameMap.get(req.name) ?? 0;
      const processorCount = processorNameMap.get(req.name) ?? 0;
      const have = invCount + storCount;
      const stillNeed = Math.max(0, trueRemaining - have);
      // Non-town quests: skip items the player already has (nothing left to gather)
      if (!isTownQuest && stillNeed === 0) return [];
      return [{ name: req.name, amount: trueRemaining, have, stillNeed, isTownQuest, questName: q.display_title || q.name, invCount, storCount, processorCount }];
    });
  });

  // Classify quest items by how they're obtained (farmable plant / wild forageable / other).
  // Only items the player still needs to gather (stillNeed > 0) inform farm/forage hints.
  const farmQuestItems = allPendingReqs.filter((r) => {
    if (r.stillNeed === 0) return false;
    const f = forageableByName.get(r.name.toLowerCase());
    return f && (f.source === 'farmable' || f.source === 'both');
  });
  const forageQuestItems = allPendingReqs.filter((r) => {
    if (r.stillNeed === 0) return false;
    const f = forageableByName.get(r.name.toLowerCase());
    return f && f.source === 'forageable';
  });

  // Location sets
  const FOREST_LOCS = new Set(['Forest', 'Forest Lake', 'Forest River', 'Deep Woods']);
  const MOUNTAIN_LOCS = new Set(['Mountain', 'Mountains', 'Mountain Lake', 'Mountain River']);
  const MARSH_LOCS = new Set(['Marsh', 'Marsh Coast', 'The Marsh']);
  const TOWN_LOCS = new Set(['Town', 'Town Coast', 'Village', 'Village Lake']);


  // Upcoming birthdays today or tomorrow
  const upcomingBirthdays = getUpcomingEvents(effectiveSeasonIdx, effectiveDay)
    .filter((e) => e.type === 'birthday' && e.daysUntil <= 1);


  // DayOfWeek = (day - 1) % 7, Sunday = 0 (matches TimeControl.cs)
  // Day 1, 8, 15, 22 of every season are Sundays; week carries across season boundaries
  const dayOfWeekNow = (effectiveDay - 1) % 7;
  const daysUntilSunday = dayOfWeekNow === 0 ? 0 : 7 - dayOfWeekNow;
  const rationDaysNow = selectedCharacter?.difficulty != null
    ? (RATION_DAYS[selectedCharacter.difficulty]?.[effectiveSeasonIdx] ?? null)
    : null;

  // Tool currently upgrading
  const upgradingTool = (selectedCharacter?.tool_data ?? []).find((t) => t.upgrading);

  // ── Farm: crops ────────────────────────────────────────────────────────────
  // Group ready crops by name for per-type harvest items
  const readyByCropName = new Map<string, CropEntry[]>();
  for (const crop of readyToHarvest) {
    const arr = readyByCropName.get(crop.name) ?? [];
    arr.push(crop);
    readyByCropName.set(crop.name, arr);
  }

  // Group gone-to-seed crops by name
  const goneToSeedByCropName = new Map<string, CropEntry[]>();
  for (const crop of goneToSeedCrops) {
    const arr = goneToSeedByCropName.get(crop.name) ?? [];
    arr.push(crop);
    goneToSeedByCropName.set(crop.name, arr);
  }

  // Farmable quest items that are still growing (not yet ready to harvest)
  const farmQuestItemsGrowing = farmQuestItems.filter((r) => !readyByCropName.has(r.name) && !goneToSeedByCropName.has(r.name));

  const farmCropItems: ChecklistItem[] = [];

  // Watering task
  const isRainyOrStormy = selectedCharacter?.is_rainy_or_stormy ?? false;
  if (!selectedCharacter) {
    farmCropItems.push({ id: 'water-crops', label: 'Water crops & harvest anything ready' });
  } else if (cropsData.length === 0) {
    farmCropItems.push({ id: 'water-crops', label: 'No crops planted — consider planting some!' });
  } else if (isRainyOrStormy) {
    farmCropItems.push({ id: 'water-crops', label: 'Rain today — crops watered automatically' });
  } else {
    const waterLabel = needsWatering.length > 0
      ? `Water ${needsWatering.length} crop${needsWatering.length !== 1 ? 's' : ''}`
      : 'All crops watered for today';
    const waterDetail = farmQuestItemsGrowing.length > 0
      ? 'Still growing for quests: ' + farmQuestItemsGrowing.map((r) => `${r.stillNeed}× ${r.name} ("${r.questName}")`).join(', ')
      : undefined;
    farmCropItems.push({ id: 'water-crops', label: waterLabel, detail: waterDetail });
  }

  // Planting-window-opens notification
  {
    const curAbsDay = effectiveSeasonIdx * 28 + (effectiveDay - 1);
    const openingToday: string[] = [];
    const openingTomorrow: string[] = [];
    for (const entry of forageableByName.values()) {
      if (entry.source !== 'farmable' && entry.source !== 'both') continue;
      const startAbs = entry.start_season * 28 + (entry.start_day - 1);
      const name = entry.name ?? '';
      if (!name) continue;
      if (startAbs === curAbsDay) openingToday.push(name);
      else if (startAbs === curAbsDay + 1) openingTomorrow.push(name);
    }
    const formatList = (names: string[]) =>
      names.length === 1
        ? names[0]
        : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    if (openingToday.length > 0 || openingTomorrow.length > 0) {
      const lines: string[] = [];
      if (openingToday.length > 0)
        lines.push(`${formatList(openingToday)} can be planted starting today.`);
      if (openingTomorrow.length > 0)
        lines.push(`${formatList(openingTomorrow)} can be planted starting tomorrow.`);
      farmCropItems.push({
        id: 'planting-window-opens',
        kind: 'info',
        label: 'Planting season opening!',
        detail: lines.join(' ') + ' Check your storage for seeds.',
      });
    }
  }

  // Donation plant deadline warnings
  if (selectedCharacter && museumItemsLoaded) {
    const curAbsDay = effectiveSeasonIdx * 28 + (effectiveDay - 1);
    for (const item of notDonatedNotDiscovered) {
      if (item.category !== 'plant') continue;
      const sched = forageableScheduleMap[item.id];
      if (!sched) continue;

      const hasForageWindow = sched.forage_end_season != null && sched.forage_end_day != null;
      const isFarmableOnly = sched.source === 'farmable';

      let daysLeft: number;
      let threshold: number;
      let riskReason: string;

      if (hasForageWindow) {
        const endAbs = sched.forage_end_season! * 28 + (sched.forage_end_day! - 1);
        daysLeft = endAbs - curAbsDay;
        threshold = 5;
        riskReason = 'forage season ends';
      } else if (isFarmableOnly) {
        const endAbs = sched.end_season * 28 + (sched.end_day - 1);
        daysLeft = endAbs - curAbsDay;
        threshold = (sched.daysToMaturity ?? 0) + 1;
        riskReason = 'planting window closes';
      } else {
        continue;
      }

      if (daysLeft < 0 || daysLeft > threshold) continue;

      const name = item.name ?? `Item #${item.id}`;
      const daysStr = daysLeft === 0
        ? 'today is the last day'
        : daysLeft === 1
          ? 'only 1 day left'
          : `only ${daysLeft} days left`;
      farmCropItems.push({
        id: `donation-plant-risk-${item.id}`,
        kind: 'info',
        label: `Donation plant at risk: ${name}`,
        detail: `${daysStr.charAt(0).toUpperCase() + daysStr.slice(1)} before the ${riskReason} — you won't be able to obtain this for the museum until next year.`,
      });
    }
  }

  // Per-crop-type harvest tasks
  let isFirstHarvestItem = true;
  const windowClosingNotices: string[] = [];

  for (const [cropName, crops] of readyByCropName) {
    const count = crops.length;
    const isMulti = crops[0].isMultiHarvest;
    const canGoToSeed = crops[0].canGoToSeed;

    // How many does an active quest still need?
    const questNeed = farmQuestItems.find((r) => r.name.toLowerCase() === cropName.toLowerCase());
    const questCount = questNeed ? Math.min(questNeed.stillNeed, count) : 0;

    // Does this crop's planting window close soon?
    const plantEntry = forageableByName.get(cropName.toLowerCase());
    let daysUntilPlantEnd: number | null = null;
    let plantEndStr: string | null = null;
    if (plantEntry && (plantEntry.source === 'farmable' || plantEntry.source === 'both')) {
      const curAbs = effectiveSeasonIdx * 28 + (effectiveDay - 1);
      const endAbs = plantEntry.end_season * 28 + (plantEntry.end_day - 1);
      daysUntilPlantEnd = endAbs - curAbs;
      plantEndStr = `${SEASON_NAMES[plantEntry.end_season]} ${plantEntry.end_day}`;
    }

    // True when the planting window is still open but closing today or tomorrow
    const windowClosingSoon = daysUntilPlantEnd !== null && daysUntilPlantEnd >= 0 && daysUntilPlantEnd <= 1;

    let label: string;
    let detail: string | undefined;
    let asterisk = false;
    let rejectCheckbox = false;

    if (questCount > 0 && questCount >= count) {
      // Quest needs all (or more than available) — harvest everything for the quest
      label = `Harvest all ${count} ${cropName}`;
      detail = `Need ${questCount}× for "${questNeed!.questName}"`;
    } else if (questCount > 0 && windowClosingSoon && canGoToSeed) {
      // Quest needs some AND window is closing AND crop can seed — harvest quest amount, let rest seed for coins
      const leave = count - questCount;
      label = `Harvest ${questCount} of ${count} ${cropName}`;
      detail = `Need ${questCount}× for "${questNeed!.questName}"`;
      asterisk = true;
      windowClosingNotices.push(`${cropName}: let the other ${leave} go to seed and harvest tomorrow for extra coins — planting window closes ${plantEndStr}`);
    } else if (questCount > 0) {
      // Quest needs some — harvest that amount; leave rest to seed only if the crop can go to seed
      const leave = count - questCount;
      label = `Harvest ${questCount} of ${count} ${cropName}`;
      detail = canGoToSeed
        ? `Need ${questCount}× for "${questNeed!.questName}" — leave the other ${leave} to seed`
        : `Need ${questCount}× for "${questNeed!.questName}"`;
    } else if (windowClosingSoon && canGoToSeed) {
      // No quest, planting window closes today/tomorrow, crop can seed — let go to seed for money
      label = `Let ${count} ${cropName} go to seed`;
      asterisk = true;
      windowClosingNotices.push(`${cropName}: planting window closes ${plantEndStr} — let them seed now and harvest tomorrow; seeds sell for more than the raw crop`);
    } else if (isMulti) {
      label = `Harvest ${cropName} (${count} ready, regrows after picking)`;
    } else if (canGoToSeed) {
      // Default for seed-capable crops: leaving to seed is optimal
      label = `${count} ${cropName} ready`;
      detail = `Leave to seed for seed sale or future planting`;
      rejectCheckbox = true;
    } else {
      // Crop cannot go to seed — just harvest it
      label = `Harvest ${cropName} (${count} ready)`;
    }

    farmCropItems.push({
      id: `harvest-${cropName.toLowerCase().replace(/\s+/g, '-')}`,
      label,
      detail,
      asterisk: asterisk || undefined,
      rejectCheckbox: rejectCheckbox || undefined,
      dividerLabel: isFirstHarvestItem ? 'Harvest:' : undefined,
      iconNode: <CropHarvestIcon image={crops[0].image} name={cropName} plantEntry={plantEntry ?? undefined} canGoToSeed={canGoToSeed} isMultiHarvest={isMulti} invCount={inventoryNameMap.get(cropName) ?? 0} storCount={storageNameMap.get(cropName) ?? 0} />,
    });
    isFirstHarvestItem = false;
  }

  // Pink callout notice for any window-closing crops
  if (windowClosingNotices.length > 0) {
    farmCropItems.push({
      id: 'harvest-window-notice',
      kind: 'callout',
      label: 'Seeds sell for more than the raw crop — let crops with this pink star go to seed and harvest them the following morning. These seeds can\'t be planted after tomorrow anyway, so sell them or keep them for next year.',
    });
  }

  // Gone-to-seed harvest tasks folded into the same Harvest: section
  for (const [cropName, crops] of goneToSeedByCropName) {
    const count = crops.length;
    farmCropItems.push({
      id: `gts-harvest-${cropName.toLowerCase().replace(/\s+/g, '-')}`,
      label: `Harvest ${count} ${cropName} (gone to seed)`,
      dividerLabel: isFirstHarvestItem ? 'Harvest:' : undefined,
      iconNode: <CropHarvestIcon image={crops[0].image} name={cropName} plantEntry={forageableByName.get(cropName.toLowerCase())} canGoToSeed={crops[0].canGoToSeed} isMultiHarvest={crops[0].isMultiHarvest} goneToSeed invCount={inventoryNameMap.get(cropName) ?? 0} storCount={storageNameMap.get(cropName) ?? 0} />,
    });
    isFirstHarvestItem = false;
  }

  // Dead crop removal task
  if (deadCrops.length > 0) {
    farmCropItems.push({
      id: 'remove-dead',
      label: `Remove ${deadCrops.length} dead plant${deadCrops.length !== 1 ? 's' : ''}`,
    });
  }

  // ── Farm: barns / critter tasks ────────────────────────────────────────────
  const ownedBarns = selectedCharacter?.barn_data ?? [];
  // Deduplicate by prefabId so multiple barns of the same type get one checkbox each
  const uniqueBarnTypes = [...new Map(ownedBarns.map((b) => [b.prefabId, b])).values()];

  // Build the flat list of per-type collect / feed / interact items.
  // Each sub-group's first item carries a dividerLabel that renders as a small heading.
  const barnItems: ChecklistItem[] = uniqueBarnTypes.length === 0
    ? [
        { id: 'collect-barn', label: selectedCharacter ? 'No barns built yet — consider building one' : 'Collect from barns & coops' },
        { id: 'feed-critters', label: 'Feed & interact with your critters' },
      ]
    : [
        ...uniqueBarnTypes.map((b, i) => ({
          id: `barn-collect-${b.prefabId}`,
          label: BARN_NAMES[b.prefabId] ?? 'Animal Building',
          dividerLabel: i === 0 ? 'Collect from:' : undefined,
          groupKey: 'barn-collect',
        })),
        ...uniqueBarnTypes.map((b, i) => ({
          id: `barn-feed-${b.prefabId}`,
          label: BARN_ANIMAL[b.prefabId] ?? 'Animals',
          dividerLabel: i === 0 ? 'Feed:' : undefined,
          groupKey: 'barn-feed',
        })),
        ...uniqueBarnTypes.map((b, i) => ({
          id: `barn-interact-${b.prefabId}`,
          label: BARN_INTERACT[b.prefabId] ?? `Interact with ${BARN_ANIMAL[b.prefabId] ?? 'animals'}`,
          dividerLabel: i === 0 ? 'Interact:' : undefined,
          groupKey: 'barn-interact',
        })),
      ];

  // ── Town: quests ───────────────────────────────────────────────────────────
  // Villagers with restricted weekly availability (0=Sun, 1=Mon, ..., 6=Sat).
  // Omitted villagers are assumed always available.
  const VILLAGER_AVAILABLE_DAYS: Record<string, number[]> = {
    Fin: [6], // Saturdays only
  };
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const questChecklistItems: ChecklistItem[] = (() => {
    if (!selectedCharacter) {
      return [];
    }
    if (activeQuests.length === 0) {
      return [];
    }

    // Index pending reqs by quest name for O(1) lookup
    const pendingByQuestName = new Map<string, typeof allPendingReqs>();
    for (const r of allPendingReqs) {
      if (!pendingByQuestName.has(r.questName)) pendingByQuestName.set(r.questName, []);
      pendingByQuestName.get(r.questName)!.push(r);
    }

    // Root cellar quests ("Defenders Ration" etc.) are already covered by the
    // dedicated root-cellar line in the same column, so skip them here.
    const checklistQuests = activeQuests.filter((q) => !q.is_rootcellar_quest);
    if (checklistQuests.length === 0) {
      return [];
    }

    const items: ChecklistItem[] = [];
    for (const quest of checklistQuests) {
      const questName = quest.display_title || quest.name;
      const pendingReqs = pendingByQuestName.get(questName) ?? [];
      const isReady = pendingReqs.length === 0;
      const giver = quest.quest_giver;
      const availDays = giver ? (VILLAGER_AVAILABLE_DAYS[giver] ?? null) : null;
      const giverAvailableToday = !availDays || availDays.includes(dayOfWeekNow);

      if (isReady) {
        if (giverAvailableToday) {
          items.push({
            id: `quest-ready-${quest.id}`,
            label: `Turn in: ${questName}`,
            detail: giver ? `Bring to ${giver}` : undefined,
          });
        } else {
          // Villager not available today — warn player to hold their items
          const dueDate = quest.available_end_season_name && quest.available_last_day
            ? `${quest.available_end_season_name} ${quest.available_last_day}`
            : null;
          const nextAvailDay = availDays![0];
          const daysUntilAvail = ((nextAvailDay - dayOfWeekNow + 7) % 7) || 7;
          const nextAvailDayName = DAY_NAMES[nextAvailDay];
          items.push({
            id: `quest-hold-${quest.id}`,
            kind: 'hold-warning',
            label: questName,
            holdItems: (quest.requirements ?? []).map((r) => ({ name: r.name, amount: r.amount })),
            detail: `Turn in to ${giver} — ${nextAvailDayName}s only (in ${daysUntilAvail} day${daysUntilAvail !== 1 ? 's' : ''})${dueDate ? ` · Due by ${dueDate}` : ''}`,
          });
        }
      } else {
        // Show remaining requirements for this quest
        pendingReqs.forEach((r, i) => {
          items.push({
            id: `quest-req-${r.name.replace(/\s+/g, '-').toLowerCase()}-${questName.replace(/\s+/g, '-').toLowerCase()}`,
            label: `${r.amount}× ${r.name}`,
            dividerLabel: i === 0 ? (giver ? `${questName} — ${giver}` : questName) : undefined,
            groupKey: `quest-${questName}`,
            townQuestReadyLabel: (r.isTownQuest && r.stillNeed === 0)
              ? (r.invCount >= r.amount ? 'in hand' : 'in storage')
              : undefined,
            iconNode: (
              <QuestItemIcon
                name={r.name}
                stillNeed={r.stillNeed}
                have={r.have}
                amount={r.amount}
                questName={questName}
                invCount={r.invCount}
                storCount={r.storCount}
                processorCount={r.processorCount}
                isTownQuestItem={r.isTownQuest}
              />
            ),
          });
        });
      }
    }
    return items;
  })();

  // ── Villager home locations → birthday column routing ─────────────────────
  // Maps each villager name to the checklist location key where their birthday
  // reminder should appear. Defaults to 'town' for unassigned villagers.
  const VILLAGER_LOCATION: Record<string, string> = {
    'Gruff':  'forest',
    'Rowan':  'forest',
    'Willow': 'forest',
    'Kai':    'marsh',
    'Tano':   'marsh',
    // Adeline, Beatrix, Beryl, Dudley, Edgar, Ericka, Fin, Greta, Hazel, Jack,
    // Lila, Logan, Oliver, Percy, Poppy, Prudence, Rose, Rufus, Rusty, Theo,
    // Wallace, Wilfred all live in Town and fall through to the 'town' default.
  };

  const birthdayItemsByLoc = new Map<string, ChecklistItem[]>();
  for (const bd of upcomingBirthdays) {
    const loc = VILLAGER_LOCATION[bd.name] ?? 'town';
    if (!birthdayItemsByLoc.has(loc)) birthdayItemsByLoc.set(loc, []);
    birthdayItemsByLoc.get(loc)!.push(bd.daysUntil === 0
      ? {
          id: `birthday-${bd.name}-0`,
          label: `Birthday today: ${bd.name}`,
          detail: 'Bring their favorite gift!',
          birthdayFavorites: (villagerGifts[bd.name]?.favorites ?? []).map((giftName) => ({
            name: giftName,
            storageCount: selectedCharacter ? storageNameMap.get(giftName) ?? 0 : undefined,
          })),
        }
      : {
          id: `birthday-${bd.name}-1`,
          label: `Birthday tomorrow: ${bd.name}`,
          detail: 'Prep tomorrow instead',
          rejectCheckbox: true,
        }
    );
  }

  // ── Available (not yet accepted) quests → location routing ────────────────
  const availableNotStartedQuests = allQuests.filter((q) => {
    if (!q.quest_giver) return false;
    if (inProgressQuestIds.has(q.id)) return false;
    if (completedOrFailedQuestIds.has(q.id)) return false;
    if (excludedByMutexIds.has(q.id)) return false; // other option of a town crisis pair was chosen
    if (q.is_donation_quest || q.is_rootcellar_quest) return false;
    if ((q.requirements ?? []).length === 0) return false;
    return daysUntilActive(q, currentAbs) === 0;
  });

  const availableQuestsByLoc = new Map<string, ChecklistItem[]>();
  for (const quest of availableNotStartedQuests) {
    const giver = quest.quest_giver!;
    const loc = VILLAGER_LOCATION[giver] ?? 'town';
    if (!availableQuestsByLoc.has(loc)) availableQuestsByLoc.set(loc, []);
    const questName = quest.display_title || quest.name;
    const reqs = quest.requirements ?? [];
    const rewardItems = quest.reward_items ?? [];
    const rewardSuffix = rewardItems.length > 0
      ? ` — you will receive ${rewardItems.map((r) => `${r.amount > 1 ? `${r.amount}× ` : ''}${r.name}`).join(', ')} as a quest reward upon turn-in`
      : '';
    const detail = reqs.length === 1
      ? `Bring along ${reqs[0].amount}× ${reqs[0].name}${rewardSuffix}`
      : `Bring: ${reqs.map((r) => `${r.amount}× ${r.name}`).join(', ')}${rewardSuffix}`;
    availableQuestsByLoc.get(loc)!.push({
      id: `available-quest-${quest.id}`,
      label: `Talk to ${giver} to accept "${questName}"`,
      detail,
      questAcceptItems: reqs.map((r) => ({
        name: r.name,
        amount: r.amount,
        invCount: selectedCharacter ? (inventoryNameMap.get(r.name) ?? 0) : 0,
        storCount: selectedCharacter ? (storageNameMap.get(r.name) ?? 0) : 0,
        questName,
        forageableInfo: forageableByName.get(r.name.toLowerCase()),
        processorRecipe: PROCESSOR_RECIPES[r.name],
      })),
    });
  }

  // ── Mine ───────────────────────────────────────────────────────────────────
  const mineAccess = pickaxeTier >= 3
    ? 'Forest, Marsh & Mountain Mine all accessible'
    : pickaxeTier >= 1
      ? 'Forest & Marsh Mine accessible (upgrade pickaxe for Mountain Mine)'
      : 'Forest Mine only — upgrade pickaxe with Copper Bars to unlock Marsh Mine';
  let mineDetail: string = mineAccess;
  if (upgradingTool) {
    const toolName = TOOL_DISPLAY_NAMES[upgradingTool.toolName] ?? upgradingTool.toolName;
    mineDetail += ` · ${toolName} upgrading, ${upgradingTool.upgradeDaysRemaining} day${upgradingTool.upgradeDaysRemaining !== 1 ? 's' : ''} left`;
  }

  const pickEntry = selectedCharacter?.tool_data?.find((t) => t.toolName === 'pick');
  const pickaxeMaxTier = pickEntry?.maxTier ?? 4;
  const pickaxeNeedsUpgrade = selectedCharacter != null && pickaxeTier < pickaxeMaxTier && !(pickEntry?.upgrading ?? false);
  // Only prompt for a mine-access upgrade when there are still mines gated behind the pickaxe tier.
  // Tier 3 unlocks the final mine (Mountain); upgrades beyond that don't unlock new content.
  const pickaxeUnlocksMine = pickaxeNeedsUpgrade && pickaxeTier < 3;
  const nextPickReq = pickaxeNeedsUpgrade ? TOOL_UPGRADE_REQ[pickaxeTier] : undefined;
  const minesUpgradeDetails: MinesUpgradeDetails | undefined = nextPickReq ? (() => {
    const oreName = ORE_FOR_BAR[nextPickReq.material] ?? '';
    return {
      material: nextPickReq.material,
      amount: nextPickReq.amount,
      coins: nextPickReq.coins,
      barCount: storageNameMap.get(nextPickReq.material) ?? 0,
      barProcessorCount: processorNameMap.get(nextPickReq.material) ?? 0,
      barContributedCount: contributedNameMap.get(nextPickReq.material) ?? 0,
      money: selectedCharacter?.money ?? null,
      oreName,
      orePerLoc: oreName ? buildOresByLocation(selectedCharacter?.chest_data ?? [], oreName) : [],
    };
  })() : undefined;

  // ── Tool pickup tasks (upgrading complete, 0 days remaining) ────────────────
  const readyToPickupTools = (selectedCharacter?.tool_data ?? []).filter(
    (t) => t.upgrading && t.upgradeDaysRemaining === 0
  );

  function computePickupSuggestions(excludeToolName: string): string[] {
    if (!selectedCharacter) return [];
    const suggestions: string[] = [];
    for (const t of selectedCharacter.tool_data ?? []) {
      if (t.toolName === excludeToolName) {
        // This tool is being picked up. After collection its tier advances by 1.
        // Check if it can be immediately re-submitted for another upgrade.
        const tierAfterPickup = t.tier + 1;
        if (tierAfterPickup < t.maxTier) {
          const isRodTool = t.toolName === 'rod';
          const req = (isRodTool ? ROD_UPGRADE_REQ : TOOL_UPGRADE_REQ)[tierAfterPickup];
          if (req) {
            const have = (storageNameMap.get(req.material) ?? 0) + (inventoryNameMap.get(req.material) ?? 0);
            if (have >= req.amount) {
              const dn = TOOL_DISPLAY_NAMES[t.toolName] ?? t.toolName;
              suggestions.push(`${dn} — bring it straight back for Tier ${tierAfterPickup + 1}! (${have}/${req.amount}× ${req.material})`);
            }
          }
        }
        continue;
      }
      if (t.upgrading) continue;
      if (t.tier >= t.maxTier) continue;
      const isRodTool = t.toolName === 'rod';
      const req = (isRodTool ? ROD_UPGRADE_REQ : TOOL_UPGRADE_REQ)[t.tier];
      if (!req) continue;
      const have = (storageNameMap.get(req.material) ?? 0) + (inventoryNameMap.get(req.material) ?? 0);
      if (have >= req.amount) {
        const dn = TOOL_DISPLAY_NAMES[t.toolName] ?? t.toolName;
        suggestions.push(`${dn} (${have}/${req.amount}× ${req.material})`);
      }
    }
    return suggestions;
  }

  const gruffPickupItems: ChecklistItem[] = readyToPickupTools
    .filter((t) => GRUFF_TOOLS.has(t.toolName))
    .map((t) => ({
      id: `pickup-${t.toolName}`,
      label: `Pick up your upgraded ${TOOL_DISPLAY_NAMES[t.toolName] ?? t.toolName} from Gruff`,
      pickupSuggestions: computePickupSuggestions(t.toolName),
    }));

  const wilfredPickupItems: ChecklistItem[] = readyToPickupTools
    .filter((t) => t.toolName === 'rod')
    .map((t) => ({
      id: `pickup-${t.toolName}`,
      label: 'Pick up your upgraded Fishing Rod from Wilfred',
      pickupSuggestions: computePickupSuggestions(t.toolName),
    }));

  // ── Root Cellar ────────────────────────────────────────────────────────────
  let rootCellarLabel: string;
  let rootCellarDetail: string | undefined;
  const rationStr = rationDaysNow != null ? `${rationDaysNow} days' worth of herbivore & carnivore food each delivery` : null;
  if (daysUntilSunday === 0) {
    rootCellarLabel = 'Root Cellar delivery TODAY (Sunday) — make sure food is stocked!';
    rootCellarDetail = rationStr ?? undefined;
  } else if (daysUntilSunday <= 2) {
    rootCellarLabel = `Root Cellar delivery in ${daysUntilSunday} day${daysUntilSunday !== 1 ? 's' : ''} — stock up now`;
    rootCellarDetail = rationStr ?? 'Needs herbivore & carnivore food in equal parts.';
  } else {
    rootCellarLabel = `Next Root Cellar Sunday in ${daysUntilSunday} days`;
    rootCellarDetail = rationStr ?? 'Collected every Sunday from Spring 8 — herbivore & carnivore food.';
  }

  // ── Research icons: undiscovered, not-donated, in-season items per location ─

  const buildResearchChecklistItems = (items: MuseumItem[], withDivider = false): ChecklistItem[] =>
    items.map((item, idx) => {
      const fishSched = item.category === 'fish' ? fishScheduleMap[item.id] : null;
      const forageSched = item.category === 'plant' ? forageableScheduleMap[item.id] : null;
      const itemInSeason = item.category === 'mineral'
        ? isMineAccessible(mineralDataMap[item.id], pickaxeTier)
        : item.category === 'fish'
          ? isFishAvailable(fishScheduleMap[item.id], effectiveSeasonIdx, effectiveDay)
          : isForageableAvailable(forageableScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
      const itemDisappearsSoon = isDisappearingSoon(
        fishSched?.end_season ?? forageSched?.end_season ?? null,
        fishSched?.end_day ?? forageSched?.end_day ?? null,
        effectiveSeasonIdx, effectiveDay, itemInSeason,
      );
      return {
        id: `research-${item.id}`,
        label: item.name ?? `Item #${item.id}`,
        kind: 'research' as const,
        museumItemId: item.id,
        dividerLabel: (withDivider && idx === 0) ? 'Find for Donation' : undefined,
        iconNode: (
          <ResearchIconSmall
            item={item}
            fishInfo={fishSched ?? undefined}
            mineralInfo={item.category === 'mineral' ? mineralDataMap[item.id] : undefined}
            plantInfo={forageSched ?? undefined}
            inSeason={itemInSeason}
            disappearsSoon={itemDisappearsSoon}
            storageCount={selectedCharacter ? storageMap.get(item.id) ?? 0 : undefined}
          />
        ),
      };
    });

  // ── Per-mine tasks: all not-donated minerals accessible regardless of spoilergate ─
  const accessibleNotDonatedMinerals = (selectedCharacter && museumItemsLoaded)
    ? museumItems.filter((item) => item.category === 'mineral' && !donatedSet.has(item.id))
    : [];

  function buildMineTasks(mineName: string): ChecklistItem[] {
    const items = accessibleNotDonatedMinerals.filter((item) =>
      mineralDataMap[item.id]?.entries.some((e) => e.mine === mineName)
    );
    return items.map((item, idx) => ({
      id: `research-${item.id}`,
      label: item.name ?? `Item #${item.id}`,
      kind: 'research' as const,
      museumItemId: item.id,
      dividerLabel: idx === 0 ? `${mineName} Mine` : undefined,
      iconNode: (
        <ResearchIconSmall
          item={item}
          mineralInfo={mineralDataMap[item.id]}
          inSeason={true}
        />
      ),
    }));
  }

  const perMineChecklistItems: ChecklistItem[] = [
    ...buildMineTasks('Forest'),
    ...(pickaxeTier >= 1 ? buildMineTasks('Marsh') : []),
    ...(pickaxeTier >= 3 ? buildMineTasks('Mountain') : []),
  ];

  const forestResearchItems = notDonatedNotDiscovered.filter((item) => {
    if (item.category === 'fish') {
      const locs = fishScheduleMap[item.id]?.locations;
      return !!locs?.some((l) => FOREST_LOCS.has(l)) && !isExclusivelyDeepWoods(locs)
        && isFishAvailable(fishScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    if (item.category === 'plant') {
      const locs = forageableScheduleMap[item.id]?.locations;
      return !!locs?.some((l) => FOREST_LOCS.has(l)) && !isExclusivelyDeepWoods(locs)
        && isForageableAvailable(forageableScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    if (item.category === 'mineral') {
      return !!mineralDataMap[item.id]?.entries.some((e) => e.mine === 'Forest');
    }
    return false;
  });

  const mountainResearchItems = notDonatedNotDiscovered.filter((item) => {
    if (item.category === 'fish') {
      const locs = fishScheduleMap[item.id]?.locations;
      return !!locs?.some((l) => MOUNTAIN_LOCS.has(l))
        && isFishAvailable(fishScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    if (item.category === 'plant') {
      const locs = forageableScheduleMap[item.id]?.locations;
      return !!locs?.some((l) => MOUNTAIN_LOCS.has(l))
        && isForageableAvailable(forageableScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    if (item.category === 'mineral') {
      return !!mineralDataMap[item.id]?.entries.some((e) => e.mine === 'Mountain') && pickaxeTier >= 3;
    }
    return false;
  });

  const townResearchItems = notDonatedNotDiscovered.filter((item) => {
    if (item.category === 'fish') {
      const locs = fishScheduleMap[item.id]?.locations;
      return !!locs?.some((l) => TOWN_LOCS.has(l))
        && isFishAvailable(fishScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    if (item.category === 'plant') {
      const locs = forageableScheduleMap[item.id]?.locations;
      return !!locs?.some((l) => TOWN_LOCS.has(l))
        && isForageableAvailable(forageableScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    return false;
  });

  const marshResearchItems = notDonatedNotDiscovered.filter((item) => {
    if (item.category === 'fish') {
      const locs = fishScheduleMap[item.id]?.locations;
      return !!locs?.some((l) => MARSH_LOCS.has(l))
        && isFishAvailable(fishScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    if (item.category === 'plant') {
      const locs = forageableScheduleMap[item.id]?.locations;
      return !!locs?.some((l) => MARSH_LOCS.has(l))
        && isForageableAvailable(forageableScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    if (item.category === 'mineral') {
      return !!mineralDataMap[item.id]?.entries.some((e) => e.mine === 'Marsh') && pickaxeTier >= 1;
    }
    return false;
  });

  const deepWoodsResearchItems = deepWoodsUnlocked ? notDonatedNotDiscovered.filter((item) => {
    if (item.category === 'fish') {
      const locs = fishScheduleMap[item.id]?.locations;
      return !!locs && isExclusivelyDeepWoods(locs)
        && isFishAvailable(fishScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    if (item.category === 'plant') {
      const locs = forageableScheduleMap[item.id]?.locations;
      return !!locs && isExclusivelyDeepWoods(locs)
        && isForageableAvailable(forageableScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
    }
    return false;
  }) : [];

  const isSaturday = dayOfWeekNow === 6;

  const saturdayDocksItems: ChecklistItem[] = isSaturday ? [
    {
      id: 'fin-saturday-visit',
      label: 'Visit Fin at the docks — he only appears on Saturdays!',
      detail: 'Pick up Bottled Surprises and Critter Treat from Fin while he\'s here. He packs up and leaves after today.',
    },
  ] : [];

  const saturdayGruffShopItems: ChecklistItem[] = isSaturday ? [
    {
      id: 'saturday-gruff-shop-restock',
      label: "Buy any remaining metal bars, coal, or smelters from Gruff's shop — restocks tomorrow",
      detail: "Gruff's shop inventory resets on Sunday. If you need bars, coal, or smelters, today is your last chance at this week's stock.",
    },
  ] : [];

  const saturdayGeneralStoreItems: ChecklistItem[] = isSaturday ? [
    {
      id: 'saturday-general-store-restock',
      label: 'Stock up on any supplies from the General Store — restocks tomorrow (Sunday)',
      detail: "The General Store's inventory resets on Sunday. Today is your last chance to buy anything from this week's stock.",
    },
  ] : [];

  const dailyGroups: ChecklistGroup[] = [
    // — top row (always 4) —
    {
      location: 'On Your Farm (Crops)',
      colorClass: 'text-amber-600 dark:text-amber-400',
      items: [...farmCropItems],
    },
    {
      location: 'On Your Farm (Critters)',
      colorClass: 'text-red-600 dark:text-red-400',
      items: [...barnItems],
    },
    {
      location: 'In the Town',
      colorClass: 'text-violet-600 dark:text-violet-400',
      items: [
        ...buildResearchChecklistItems(townResearchItems, true),
        ...(availableQuestsByLoc.get('town') ?? []),
        ...questChecklistItems,
        ...openTodayItems,
        ...(birthdayItemsByLoc.get('town') ?? (birthdayItemsByLoc.size === 0 ? [{ id: 'villagers', label: 'Talk to villagers to build relationships' }] : [])),
        ...wilfredPickupItems,
        { id: 'root-cellar', label: rootCellarLabel, detail: rootCellarDetail },
        ...saturdayGeneralStoreItems,
      ],
    },
    {
      location: 'In the Mines',
      colorClass: 'text-cyan-600 dark:text-cyan-400',
      items: [
        ...(pickaxeUnlocksMine ? [{
          id: 'mining-upgrade',
          label: pickaxeTier === 0
            ? `Upgrade your pickaxe (Copper Bars) to unlock the Marsh Mine.`
            : pickaxeTier === 1
              ? `Upgrade your pickaxe (Iron Bars) — one more upgrade after this unlocks the Mountain Mine.`
              : `Upgrade your pickaxe (Titanium Bars) to unlock the Mountain Mine.`,
          detail: 'Bring the materials to Gruff to start the upgrade.',
          upgradeDetails: minesUpgradeDetails,
          subtaskIds: ['mining-upgrade-req-bar', 'mining-upgrade-req-coins', 'mining-upgrade-gruff'],
        }] : []),
        ...(perMineChecklistItems.length > 0
          ? perMineChecklistItems
          : [{ id: 'mining', label: 'Mine ores, gems & crafting materials', detail: mineDetail }]),
      ],
    },
    // — bottom row (up to 4) —
    {
      location: 'In the Forest',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      items: [
        ...buildResearchChecklistItems(forestResearchItems, true),
        ...(availableQuestsByLoc.get('forest') ?? []),
        ...(birthdayItemsByLoc.get('forest') ?? []),
        ...gruffPickupItems,
        ...saturdayGruffShopItems,
      ],
    },
    {
      location: 'On the Mountain',
      colorClass: 'text-cyan-600 dark:text-cyan-400',
      items: [
        ...buildResearchChecklistItems(mountainResearchItems, true),
        ...(availableQuestsByLoc.get('mountain') ?? []),
        ...(birthdayItemsByLoc.get('mountain') ?? []),
      ],
    },
    {
      location: 'In the Marsh',
      colorClass: 'text-teal-600 dark:text-teal-400',
      items: [
        ...buildResearchChecklistItems(marshResearchItems, true),
        ...(availableQuestsByLoc.get('marsh') ?? []),
        ...(birthdayItemsByLoc.get('marsh') ?? []),
      ],
    },
    ...(deepWoodsUnlocked ? [{
      location: 'In the Deep Woods',
      colorClass: 'text-green-700 dark:text-green-400',
      items: buildResearchChecklistItems(deepWoodsResearchItems),
    }] : []),
    // — extra: Saturday docks then non-urgent conditional groups —
    ...(isSaturday ? [{
      location: 'At the Docks',
      colorClass: 'text-blue-600 dark:text-blue-400',
      items: saturdayDocksItems,
    }] : []),
    ...(upcomingQuestPrepItems.length > 0 ? [{
      location: 'Upcoming Quest Prep',
      colorClass: 'text-orange-600 dark:text-orange-400',
      items: upcomingQuestPrepItems,
    }] : []),
  ];

  return (
    <MapLocationContext.Provider value={setMapLocation}>
      {mapLocation && <MapModal location={mapLocation} onClose={() => setMapLocation(null)} />}
    <div className="space-y-10">
      <header className="grid grid-cols-5 items-center gap-4">
        <div>
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
        </div>
        <div className="col-span-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-slate-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-slate-300 flex items-center gap-3">
          <svg viewBox="0 0 20 20" className="flex-none w-[3.6rem] h-[3.6rem]" aria-hidden style={{ filter: 'none' }}>
            <circle cx="10" cy="10" r="9" stroke="#d97706" strokeWidth="1.75" fill="none"/>
            <circle cx="10" cy="6.5" r="1.2" fill="#d97706" style={{ filter: 'none' }}/>
            <rect x="8.85" y="9" width="2.3" height="6" rx="1.15" fill="#d97706" style={{ filter: 'none' }}/>
          </svg>
          <span>{isMobile ? 'Long-press' : 'Hover over'} any icon or chip for details — fish locations, storage counts, donation progress, and more. For bug reports, feature requests, or to discuss missing/incorrect info, click the ISSUES button in the header. Feedback is welcome!</span>
        </div>
      </header>

      <DailyChecklist groups={dailyGroups} />

      {yearGoalItems.length > 0 && <YearGoalsCard items={yearGoalItems} mutexPairs={undecidedMutexPairs} />}

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-1.5 items-end border-b-2 border-slate-300 dark:border-slate-600">
        {([
          ['quests',   'Quests',   'bg-sky-300 dark:bg-sky-600',         'bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/50 dark:hover:bg-sky-800/70'],
          ['research', 'Research', 'bg-emerald-300 dark:bg-emerald-600', 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:hover:bg-emerald-800/70'],
          ['upgrades', 'Upgrades', 'bg-amber-300 dark:bg-amber-500',     'bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-800/70'],
          ['critters', 'Critters', 'bg-rose-300 dark:bg-rose-600',       'bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/50 dark:hover:bg-rose-800/70'],
          ['events',   'Events',   'bg-violet-300 dark:bg-violet-600',   'bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/50 dark:hover:bg-violet-800/70'],
          ['farm',     'Farm',     'bg-orange-300 dark:bg-orange-500',   'bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/50 dark:hover:bg-orange-800/70'],
        ] as [TipsTab, string, string, string][]).map(([tab, label, activeColor, inactiveColor]) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); sessionStorage.setItem(TIPS_TAB_KEY, tab); }}
              className={`relative px-5 rounded-t-lg text-base font-semibold transition-all text-slate-900 dark:text-slate-100 ${
                isActive
                  ? `pt-3 pb-3 -mb-px border border-b-0 border-slate-300 dark:border-slate-500 shadow-sm z-10 ${activeColor}`
                  : `pt-2.5 pb-2 ${inactiveColor}`
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Upcoming Calendar Events */}
      {activeTab === 'events' && (!showCommunityEvents ? (
        <SpoilerGate label="Upcoming community events (birthdays & festivals)" />
      ) : (() => {
        const upcoming = getUpcomingEvents(effectiveSeasonIdx, effectiveDay);
        if (upcoming.length === 0) return null;
        const hasBirthdays = upcoming.some((e) => e.type === 'birthday');
        const soon = upcoming.filter((e) => e.daysUntil <= 7);
        const later = upcoming.filter((e) => e.daysUntil > 7);
        const renderCard = (event: CalendarEventEntry & { daysUntil: number }) => {
          const timeLabel =
            event.daysUntil === 0 ? 'Today' : event.daysUntil === 1 ? 'Tomorrow' : `In ${event.daysUntil} days`;
          const dateStr = `${SEASON_NAMES[event.season]} ${event.day}`;
          const isFestival = event.type === 'festival';
          const isStory = event.type === 'story';
          const isBirthday = event.type === 'birthday';
          const containerClass = isFestival
            ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-700/50 dark:bg-violet-900/20 dark:text-violet-200'
            : isStory
              ? 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-700/50 dark:bg-indigo-900/20 dark:text-indigo-200'
              : 'border-stone-200 bg-amber-50 text-stone-800 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-200';
          const badgeClass = isFestival
            ? 'bg-violet-200 text-violet-700 dark:bg-violet-700/60 dark:text-violet-100'
            : isStory
              ? 'bg-indigo-200 text-indigo-700 dark:bg-indigo-700/60 dark:text-indigo-100'
              : 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700/60 dark:text-yellow-100';
          const typeLabel = isFestival ? 'Festival' : isStory ? 'Event' : 'Birthday';
          const gifts = isBirthday ? (villagerGifts[event.name] ?? null) : null;
          const hasFavs = gifts && gifts.favorites.length > 0;
          const hasDislikes = gifts && gifts.dislikes.length > 0;
          const showGifts = showVillagerGifts && isBirthday && gifts && (hasFavs || hasDislikes);
          const hasShopData = isFestival && event.shopItems && event.shopItems.length > 0;
          return (
            <div
              key={`${event.type}-${event.season}-${event.day}-${event.name}`}
              className={`rounded-xl border ${containerClass}${isFestival && !hasShopData ? ' flex flex-col flex-1' : ''}`}
            >
              <div className="relative z-10 flex items-center gap-3 px-4 py-4 text-base">
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-bold uppercase tracking-wide ${badgeClass}`}>
                  {timeLabel}
                </span>
                {isBirthday && (
                  <div className="-my-4 h-14 shrink-0">
                    <img
                      src={`/villagers/${event.name.replace(/ /g, '_')}.png`}
                      alt={event.name}
                      className="h-full w-auto object-contain object-bottom"
                      style={{ transform: 'translateY(7%) scale(1.15)' }}
                      onError={(e) => {
                        const p = e.currentTarget.parentElement;
                        if (p) p.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <span className={isBirthday ? 'self-end translate-y-4 pl-2 text-4xl font-normal text-slate-700 dark:text-slate-200' : 'font-semibold'}>{event.name}</span>
                <span className={isBirthday ? 'self-end translate-y-4 pl-4 text-xl opacity-60' : 'opacity-60'}>{dateStr}</span>
                <span className={`ml-auto shrink-0 rounded-full px-3 py-1 text-base font-medium ${badgeClass}`}>
                  {typeLabel}
                </span>
              </div>
              {showGifts && (
                <div className="border-t border-stone-200/60 px-4 pb-3 pt-2.5 dark:border-rose-700/30">
                  <div className="flex flex-col items-center gap-y-3">
                  {hasFavs && (
                    <div className="flex flex-col items-center">
                      <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-[#5c9a30] dark:text-[#6aae36]">
                        Favorites
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {gifts!.favorites.map((item) => (
                          <GiftItemIcon key={item} name={item} sentiment="favorite" storageCount={selectedCharacter ? storageNameMap.get(item) ?? 0 : undefined} processorCount={selectedCharacter ? processorNameMap.get(item) ?? 0 : undefined} />
                        ))}
                      </div>
                    </div>
                  )}
                  {hasDislikes && (
                    <div className="flex flex-col items-center">
                      <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-red-400 dark:text-red-300">
                        Dislikes
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {gifts!.dislikes.map((item) => (
                          <GiftItemIcon key={item} name={item} sentiment="dislike" storageCount={selectedCharacter ? storageNameMap.get(item) ?? 0 : undefined} processorCount={selectedCharacter ? processorNameMap.get(item) ?? 0 : undefined} />
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                  {!hasFavs && !hasDislikes && (
                    <p className="text-center text-xs italic text-rose-400/70 dark:text-rose-500/70">
                      Gift data not yet extracted for {event.name} — run extractVillagerGifts.py.
                    </p>
                  )}
                </div>
              )}
              {showVillagerGifts && isBirthday && !gifts && (
                <div className="border-t border-stone-200/60 px-4 pb-3 pt-2.5 dark:border-rose-700/30">
                  <p className="text-center text-xs italic text-stone-400/70 dark:text-rose-500/70">
                    No gift data found for {event.name}.
                  </p>
                </div>
              )}
              {hasShopData && (
                <div className="border-t border-violet-200/60 px-4 pb-3 pt-2.5 dark:border-violet-700/30">
                  <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                    Festival Shop · Decorative Items
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {event.shopItems!.map((item) => (
                      <FestivalItemIcon key={item.name} name={item.name} qty={item.qty} storageCount={selectedCharacter ? storageNameMap.get(item.name) ?? 0 : undefined} />
                    ))}
                  </div>
                </div>
              )}
              {isFestival && !hasShopData && (
                <div className="flex-1 flex items-center justify-center border-t border-violet-200/60 px-4 pb-3 pt-2.5 dark:border-violet-700/30">
                  <p className="px-6 py-3 text-center text-base text-violet-900 dark:text-violet-200">
                    This event does not involve purchaseable items — it is exclusively a plot-based event.<br />Therefore, there are no shop items to display here.
                  </p>
                </div>
              )}
            </div>
          );
        };
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <p className="pl-4 text-xl font-semibold tracking-wide text-slate-700 dark:text-slate-100">
                  Coming Up (Next 7 days)
                </p>
                <div className="flex-1 flex flex-col gap-3">
                  {soon.length > 0
                    ? soon.map(renderCard)
                    : <p className="text-sm italic text-slate-400 dark:text-slate-500">Nothing in the next 7 days.</p>}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <p className="pl-4 text-xl font-semibold tracking-wide text-slate-700 dark:text-slate-100">
                  Coming Up (7-14 Days Away)
                </p>
                <div className="flex-1 flex flex-col gap-3">
                  {later.length > 0
                    ? later.map(renderCard)
                    : <p className="text-sm italic text-slate-400 dark:text-slate-500">Nothing 8–14 days out.</p>}
                </div>
              </div>
            </div>
          </div>
        );
      })())}

      {/* Active Quests */}
      {activeTab === 'quests' && <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Active Quests</h2>
        <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
          Quests you've accepted and are currently working on.
        </p>
        {loading ? (
          <p className="text-slate-600 dark:text-slate-400">Loading quests...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : characterDetailLoading ? (
          <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
            Loading character data…
          </p>
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
                donationMap={quest.is_town_quest ? (matPileByQuest.get(quest.id) ?? new Map()) : undefined}
                storageNameMap={selectedCharacter ? storageNameMap : undefined}
              />
            ))}
          </div>
        )}
      </section>}

      {/* Museum Donations */}
      {activeTab === 'research' && <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Museum Donations</h2>
        <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
          Track your specimen milestones and see what you could donate next.
        </p>

        {/* Specimen milestone tracker + When Can I Hit That? */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Left: milestone tracker — 1/3 width */}
          <div className="md:col-span-1 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-700/50 dark:bg-amber-900/20">
            <p className="mb-1 text-base font-semibold text-slate-700 dark:text-slate-200">
              Specimens donated:{' '}
              <span className="text-amber-700 dark:text-amber-400">
                {selectedCharacter ? donatedCount : '—'}
              </span>
            </p>
            {characterDetailLoading ? (
              <p className="text-base text-slate-500 dark:text-slate-400 italic">Loading character data…</p>
            ) : !selectedCharacter ? (
              <p className="text-base text-slate-500 dark:text-slate-400 italic">Load a save file to see your donation progress.</p>
            ) : nextMilestone ? (
              <div className="text-base text-slate-600 dark:text-slate-400">
                <p>
                  Next milestone:{' '}
                  <span className="font-semibold">{donationThreshold(nextMilestone)} specimens</span>
                  {' '}— {nextMilestone.display_title || nextMilestone.name}. You need{' '}
                  <span className="font-semibold">{(donationThreshold(nextMilestone) ?? 0) - donatedCount} more</span>.
                </p>
                {(() => {
                  const allRewards = nextMilestone.reward_items ?? [];
                  if (!allRewards.length) return null;
                  return (
                    <div className="mt-2.5">
                      <p className="mb-1.5 text-base font-medium text-slate-500 dark:text-slate-400">Rewards:</p>
                      <div className="flex flex-wrap gap-2">
                        {allRewards.map((r) => {
                          const isBlueprint = r.name.endsWith(' Blueprint');
                          const info = (researchRewardsData as Record<string, { description: string }>)[r.name];
                          return (
                            <div key={r.name} className="flex flex-col items-center gap-1">
                              {isBlueprint
                                ? <BlueprintRewardIcon name={r.name} amount={r.amount} unlockedSkills={selectedCharacter?.unlocked_skills ?? []} />
                                : <RewardIcon name={r.name} amount={r.amount} type="item" description={info?.description} />
                              }
                              <span className="text-center text-xs leading-tight text-slate-500 dark:text-slate-400 max-w-[64px]">{r.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : donationMilestones.length > 0 ? (
              <p className="text-base text-slate-600 dark:text-slate-400">All donation milestones completed!</p>
            ) : null}
          </div>

          {/* Right: When Can I Hit That? — 2/3 width */}
          {nextMilestone && selectedCharacter && (
            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 flex flex-col">
              <p className="mb-3 text-base font-semibold text-slate-700 dark:text-slate-200">When Can I Hit that Milestone?</p>

              {/* Top row: availability table + "After today…" side by side */}
              {(() => {
                const CAT_ICON: Record<string, string> = { Fish: '🐟', Minerals: '💎', Plants: '🌿' };
                const mineralFilter = { filter: 'hue-rotate(155deg) saturate(3) brightness(1.15) contrast(1.6)' };
                const catIconEl = (label: string) => (
                  <span aria-hidden className="mr-1 select-none" style={label === 'Minerals' ? mineralFilter : undefined}>
                    {CAT_ICON[label]}
                  </span>
                );
                return (
              <div className={`grid grid-cols-2 gap-4${milestoneStillNeeded === 0 ? ' flex-1 items-center pb-3' : ''}`}>
                {/* Left: per-category table */}
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-700 dark:border-slate-700">
                  {milestoneCatAvail.map((cat) => (
                    <div key={cat.label} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {catIconEl(cat.label)}{cat.label} Remaining (Available Today)
                      </span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {cat.availableCount}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Total Available Today</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{milestoneTotalAvailableToday}</span>
                  </div>
                </div>

                {/* Right: "After today…" next-available list */}
                {milestoneStillNeeded > 0 ? (
                  <div>
                    <p className="text-base text-slate-500 dark:text-slate-400">
                      After today you'd still need{' '}
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{milestoneStillNeeded}</span>{' '}
                      more.
                    </p>
                    <p className="mb-2 mt-1.5 text-base text-slate-500 dark:text-slate-400">Next to become available:</p>
                    <div className="space-y-1.5">
                      {milestoneCatAvail.map((cat) => {
                        if (cat.tierLocked > 0) return (
                          <p key={cat.label} className="text-base text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{catIconEl(cat.label)}{cat.label}:</span>{' '}
                            {cat.tierLocked} locked behind pickaxe upgrade
                          </p>
                        );
                        if (cat.nextItems.length === 0) return null;
                        const next = cat.nextItems[0];
                        return (
                          <p key={cat.label} className="text-base text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{catIconEl(cat.label)}{cat.label}:</span>{' '}
                            {next.name} in {next.daysUntil} day{next.daysUntil !== 1 ? 's' : ''}{' '}
                            <span className="text-slate-400 dark:text-slate-500">({SEASON_NAMES[next.startSeason]} {next.startDay})</span>
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="self-center text-base font-medium text-emerald-600 dark:text-emerald-400 md:px-10 lg:px-16">
                    Everything available today is enough to get you there!
                  </p>
                )}
              </div>
                ); })()}

              {/* Bottom: text left, day-by-day table right */}
              {milestoneStillNeeded > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                  <p className="self-center text-base leading-snug text-slate-500 dark:text-slate-400">
                    Assuming you do not get anything from the root cellar that unlocks an item early, the earliest you could hit this Specimen goal is{' '}
                    {milestoneEarliestDate ? (
                      <span className="font-semibold text-slate-700 dark:text-slate-200"> {milestoneEarliestDate}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500"> unknown — some remaining items require a pickaxe upgrade</span>
                    )}
                    .
                  </p>

                  {milestoneDayCols.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-separate border-spacing-0 text-sm">
                        <thead>
                          <tr>
                            <th className="w-12 pb-1" />
                            {milestoneDayCols.map((col) => (
                              <th
                                key={col.shortLabel}
                                className={`whitespace-nowrap px-2 pb-1 text-center font-semibold ${col.isGoal ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
                              >
                                {col.shortLabel}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="pr-2 text-right text-slate-400 dark:text-slate-500">+new</td>
                            {milestoneDayCols.map((col) => (
                              <td
                                key={col.shortLabel}
                                className={`px-2 py-0.5 text-center ${col.isGoal ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
                              >
                                +{col.count}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="pr-2 text-right text-slate-400 dark:text-slate-500">total</td>
                            {milestoneDayCols.map((col) => (
                              <td
                                key={col.shortLabel}
                                className={`px-2 py-0.5 text-center font-semibold ${col.isGoal ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}
                              >
                                {col.runningTotal}{col.isGoal ? ' ✓' : ''}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Items available to donate */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-5 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-medium text-slate-700 dark:text-slate-300">Items Available to Donate</p>
            <div className="flex flex-wrap items-center gap-2">
              {selectedCharacter && (
                <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-base font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                  <input
                    type="checkbox"
                    checked={useCharacterDate}
                    onChange={(e) => setUseCharacterDate(e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  Use Character's In-Game Date (ignore Date Picker in Header)
                </label>
              )}
              {selectedCharacter && toDonateSections.length > 0 && !revealUndiscovered && (
                <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                  Undiscovered hidden — enable in Settings to reveal
                </span>
              )}
            </div>
          </div>
          <div className="mb-3 flex flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <p className="flex items-center gap-1.5 text-base text-slate-600 dark:text-slate-300">
              <span className="inline-block h-3 w-3 shrink-0 rounded border-2 border-amber-300 dark:border-amber-500" />
              Yellow = in your inventory but not yet donated.
            </p>
            <p className="flex items-center gap-1.5 text-base text-slate-600 dark:text-slate-300">
              <span className="inline-block h-3 w-3 shrink-0 rounded border-2 border-amber-700 dark:border-amber-400" />
              Orange = available now to find, in season.
            </p>
            {!revealUndiscovered && (
              <p className="text-base text-slate-600 dark:text-slate-300">Dimmed = undiscovered.</p>
            )}
          </div>

          {characterDetailLoading ? (
            <p className="text-base italic text-slate-400 dark:text-slate-500">Loading character data…</p>
          ) : !selectedCharacter ? (
            <p className="text-base italic text-slate-400 dark:text-slate-500">
              Load a save file to see items available to donate.
            </p>
          ) : !museumItemsLoaded ? (
            <p className="text-base italic text-slate-400 dark:text-slate-500">Loading item data…</p>
          ) : museumItems.length === 0 ? (
            <p className="text-base italic text-slate-amber-600 dark:text-slate-400">
              Item reference data failed to load — please refresh the page.
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
                        <> ({hiddenCount} undiscovered — enable in Settings to reveal)</>
                      )}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {visibleItems.map((item) => {
                          const itemInSeason = (() => {
                            if (item.category === 'mineral') {
                              return isMineAccessible(mineralDataMap[item.id], pickaxeTier);
                            }
                            const locations = item.category === 'fish'
                              ? fishScheduleMap[item.id]?.locations
                              : forageableScheduleMap[item.id]?.locations;
                            if (!deepWoodsUnlocked && isExclusivelyDeepWoods(locations)) return false;
                            return item.category === 'fish'
                              ? isFishAvailable(fishScheduleMap[item.id], effectiveSeasonIdx, effectiveDay)
                              : isForageableAvailable(forageableScheduleMap[item.id], effectiveSeasonIdx, effectiveDay);
                          })();
                          const fishEnd = item.category === 'fish' ? fishScheduleMap[item.id] : null;
                          const forageEnd = item.category === 'plant' ? forageableScheduleMap[item.id] : null;
                          const itemDisappearsSoon = isDisappearingSoon(
                            fishEnd?.end_season ?? forageEnd?.end_season ?? null,
                            fishEnd?.end_day ?? forageEnd?.end_day ?? null,
                            effectiveSeasonIdx, effectiveDay, itemInSeason,
                          );
                          return (
                            <DonationItemIcon
                              key={item.id}
                              item={item}
                              inInventory={inventoryMap.has(item.id)}
                              inventoryAmount={inventoryMap.get(item.id) ?? 0}
                              discovered={discoveredItemIds.has(item.id)}
                              inSeason={itemInSeason}
                              fishInfo={item.category === 'fish' ? fishScheduleMap[item.id] : undefined}
                              mineralInfo={item.category === 'mineral' ? mineralDataMap[item.id] : undefined}
                              plantInfo={item.category === 'plant' ? forageableScheduleMap[item.id] : undefined}
                              disappearsSoon={itemDisappearsSoon}
                              storageCount={selectedCharacter ? storageMap.get(item.id) ?? 0 : undefined}
                            />
                          );
                        })}
                      </div>
                      {hiddenCount > 0 && !revealUndiscovered && (
                        <p className="mt-1.5 text-base italic text-slate-400 dark:text-slate-500">
                          +{hiddenCount} undiscovered {label.toLowerCase()} specimen{hiddenCount !== 1 ? 's' : ''} hidden — enable in Settings to reveal.
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
          storageMap={storageMap}
          refDataReady={museumItemsLoaded && museumItems.length > 0}
        />
      </section>}

      {/* Upgrade Progression */}
      {activeTab === 'upgrades' && <section>
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
            storageNameMap={selectedCharacter ? storageNameMap : undefined}
            processorNameMap={selectedCharacter ? processorNameMap : undefined}
            contributedNameMap={selectedCharacter ? contributedNameMap : undefined}
            money={selectedCharacter?.money}
          />
          <div className="flex flex-col gap-6">
            <UpgradeStatusCard
              name="Wilfred"
              role="Fisherman · Rod Upgrades"
              toolNames={['rod']}
              chipColor="bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
              toolData={selectedCharacter?.tool_data ?? null}
              storageNameMap={selectedCharacter ? storageNameMap : undefined}
              processorNameMap={selectedCharacter ? processorNameMap : undefined}
              contributedNameMap={selectedCharacter ? contributedNameMap : undefined}
              money={selectedCharacter?.money}
            />
            <BuildingStatusCard
              homeLevel={selectedCharacter?.home_level ?? null}
              homeConstructionDays={selectedCharacter?.home_construction_days ?? 0}
              barnData={selectedCharacter?.barn_data ?? []}
              storageNameMap={selectedCharacter ? storageNameMap : undefined}
              processorNameMap={selectedCharacter ? processorNameMap : undefined}
              contributedNameMap={selectedCharacter ? contributedNameMap : undefined}
              money={selectedCharacter?.money}
            />
          </div>
        </div>
      </section>}

      {/* Farm Crops */}
      {activeTab === 'farm' && (
        <FarmTab cropsData={selectedCharacter?.crops_data ?? null} hasCharacter={!!selectedCharacter} />
      )}

      {/* In-Season Critters */}
      {activeTab === 'critters' && (
        <section>
          <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">In-Season Critters</h2>
          <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
            Tameable creatures currently active in Grimshire.
          </p>
          {crittersLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-700" />
            </div>
          ) : crittersActiveVariants.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-slate-600 dark:text-slate-400">No critters are currently in season.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-900/10 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
              <div className={critterSeasonContainerClass(crittersColCount, crittersActiveVariants.length)}>
                {crittersActiveVariants.map((v, i) =>
                  renderCritterCard(
                    v,
                    crittersDateStr,
                    critterSeasonArticleClass(crittersColCount),
                    crittersActiveVariants.length === 8 && i >= 4 ? 'lg:border-t lg:border-slate-900/10' : '',
                    forageableByName,
                    selectedCharacter ? storageNameMap : undefined,
                    selectedCharacter ? inventoryNameMap : undefined,
                    selectedCharacter ? processorNameMap : undefined,
                  )
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
    </MapLocationContext.Provider>
  );
}
