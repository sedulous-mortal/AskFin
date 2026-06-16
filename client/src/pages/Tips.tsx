import { useEffect, useState } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useDate } from '../context/DateContext';
import { useAuth, ToolData, BarnData, MuseumItem, type MatPileEntry, type CropEntry, buildStorageMap, buildStorageMapByName, buildInventoryMapByName } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useDevice } from '../context/DeviceContext';
import { SpoilerGate } from '../components/SpoilerGate';
import calendarEventsData from '../data/calendar_events.json';
import villagerGiftsData from '../data/villager_gifts.json';
import researchRewardsData from '../data/research_rewards.json';
import { fetchCritters, type Critter, type CritterFood } from '../api/critters';
import { CUSTOM_CRITTER_FOODS } from '../data/critterCustomFoods';
import { daysRemainingInRange } from '../utils/seasonalRange';

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

function ItemIcon({ name, amount, donated = 0, storageCount }: { name: string; amount: number; donated?: number; storageCount?: number }) {
  const safeName = name.replace(/ /g, '_');
  const paths = [`/dishes/${safeName}.png`, `/processed_foods/${safeName}.png`, `/items/${safeName}.png`, `/edibles/${safeName}.png`];
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
          <span className="text-slate-400 text-sm">In storage</span>
          <span className="font-semibold text-amber-300 text-sm">{storageCount}</span>
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
  'Farm River':     'text-amber-400',
  Forest:           'text-emerald-400',
  'Forest Coast':   'text-emerald-400',
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
  Village:          'text-violet-400',
  'Village Coast':  'text-violet-400',
  'Village Lake':   'text-violet-400',
};

function LocationText({ loc }: { loc: string }) {
  return <span className={LOCATION_COLOR[loc] ?? 'text-white'}>{loc}</span>;
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
        <span className="text-slate-400 text-xs">Type</span>
        <span className="font-medium text-white text-sm">{plant.type}</span>
      </div>

      {(isFarmable || isBoth) && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs">Plant from</span>
            <span className="text-white text-sm">{plantStart}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs">Last plant</span>
            <span className="text-white text-sm">{plantEnd}</span>
          </div>
        </>
      )}

      {hasForageWindow && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs">Forage Available</span>
            <span className="text-white text-sm">{forageStart}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs">Forage Disappears</span>
            <span className="text-white text-sm">{forageEnd}</span>
          </div>
          {plant.locations && plant.locations.length > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-slate-400 text-xs">Locations</span>
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
            <span className="text-slate-400 text-xs">Forage Available</span>
            <span className="text-white text-sm">{plantStart}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs">Forage Disappears</span>
            <span className="text-white text-sm">{plantEnd}</span>
          </div>
          {plant.locations && plant.locations.length > 0 && (
            <div className="flex items-baseline gap-1.5 pt-0.5">
              <span className="shrink-0 text-slate-400 text-xs">Locations</span>
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

function CritterFoodTooltipContent({ food, forageableInfo, inventoryCount, storageCount }: {
  food: CritterFood;
  forageableInfo?: ForageableEntry;
  inventoryCount?: number;
  storageCount?: number;
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
          <span className="text-slate-400 text-sm">In Inventory:</span>
          <span className="font-semibold text-amber-300 text-sm">{inventoryCount}</span>
        </div>
      )}
      {storageCount !== undefined && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-slate-400 text-sm">In Storage:</span>
          <span className="font-semibold text-amber-300 text-sm">{storageCount}</span>
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

function RewardIcon({ name, amount, type, storageCount, description }: {
  name: string;
  amount: number;
  type: 'item' | 'relationship';
  storageCount?: number;
  description?: string;
}) {
  const safeName = name.replace(/ /g, '_');
  const paths = type === 'item'
    ? [`/items/${safeName}.png`, `/edibles/${safeName}.png`]
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

const BLUEPRINT_BUILD_REQS: Record<string, { material: string; qty: number }[]> = {
  Press: [
    { material: 'Iron Bar',   qty: 5  },
    { material: 'Plank',      qty: 20 },
    { material: 'Hard Wood',  qty: 20 },
  ],
};

function BlueprintRewardIcon({ name, amount }: { name: string; amount: number }) {
  const baseName = name.replace(' Blueprint', '');
  const reqs = BLUEPRINT_BUILD_REQS[baseName];
  return (
    <AppTooltip
      content={
        <div>
          <p className="text-sm font-semibold text-slate-100">{name}</p>
          <p className="mt-1 text-sm text-slate-300">
            Allows you to craft more {baseName} at a Crafting Table.
          </p>
          {reqs && (
            <div className="mt-2 border-t border-slate-700 pt-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Build requires</p>
              <div className="space-y-0.5">
                {reqs.map((r) => (
                  <div key={r.material} className="flex items-center gap-1.5">
                    <span className="text-amber-300 text-sm font-semibold">{r.qty}×</span>
                    <span className="text-slate-200 text-sm">{r.material}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      }
      width="w-52"
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

function GiftItemIcon({ name, sentiment, storageCount }: { name: string; sentiment: 'favorite' | 'dislike'; storageCount?: number }) {
  const safeName = name.replace(/ /g, '_');
  const paths = [`/dishes/${safeName}.png`, `/processed_foods/${safeName}.png`, `/items/${safeName}.png`, `/edibles/${safeName}.png`];
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
          <span className="text-slate-400 text-sm">In storage</span>
          <span className="font-semibold text-amber-300 text-sm">{storageCount}</span>
        </div>
      )}
    </>
  );

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
              {reqs.map((req, i) => (
                <span key={i} className="rounded bg-amber-50 px-2 py-0.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  {req.amount > 1 ? `${req.amount}× ` : ''}{req.name}
                </span>
              ))}
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

function UpgradeStatusCard({ name, role, toolNames, chipColor, toolData, storageNameMap, money }: {
  name: string;
  role: string;
  toolNames: string[];
  chipColor: string;
  toolData: ToolData[] | null;
  storageNameMap?: Map<string, number>;
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
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-sm">In storage</span>
                          <span className="font-semibold text-amber-300 text-sm">{storageNameMap.get(req.material) ?? 0}</span>
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

function BuildingStatusCard({ homeLevel, homeConstructionDays, barnData, storageNameMap, money }: {
  homeLevel: number | null;
  homeConstructionDays: number;
  barnData: BarnData[];
  storageNameMap?: Map<string, number>;
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
                      <ItemIcon key={mat.name} name={mat.name} amount={mat.qty} storageCount={storageNameMap ? storageNameMap.get(mat.name) ?? 0 : undefined} />
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
                      <ItemIcon key={mat.name} name={mat.name} amount={mat.qty} storageCount={storageNameMap ? storageNameMap.get(mat.name) ?? 0 : undefined} />
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
}: {
  selectedCharacter: ReturnType<typeof useAuth>['selectedCharacter'];
  donatedSections: { label: string; items: MuseumItem[] }[];
  fishScheduleMap: Record<number, FishScheduleEntry>;
  mineralDataMap: Record<number, MineralInfo>;
  storageMap: Map<number, number>;
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

function renderCritterCard(variant: Critter, dateStr: string, articleClass: string, extraClass = '', forageableByName?: Map<string, ForageableEntry>, storageNameMap?: Map<string, number>, inventoryNameMap?: Map<string, number>) {
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
                  <AppTooltip key={i} content={<CritterFoodTooltipContent food={food} forageableInfo={forageableInfo} inventoryCount={inventoryCount} storageCount={storageCount} />} width="w-56">
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
  isMultiHarvest: boolean;
  readyCount: number;
  growingEntries: number[];  // daysWatered values for growing (not-yet-ready) tiles
  deadCount: number;
};

function FarmTab({ cropsData, hasCharacter }: { cropsData: CropEntry[] | null; hasCharacter: boolean }) {
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  if (!hasCharacter) {
    return (
      <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Farm Crops</h2>
        <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
          See what&apos;s planted and how close each crop is to harvest.
        </p>
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
          Load a save file to see your farm status.
        </p>
      </section>
    );
  }

  if (!cropsData || cropsData.length === 0) {
    return (
      <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Farm Crops</h2>
        <p className="mb-4 text-base text-slate-600 dark:text-slate-400">
          See what&apos;s planted and how close each crop is to harvest.
        </p>
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
          No crops detected on your farm.
        </p>
      </section>
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
        isMultiHarvest: entry.isMultiHarvest,
        readyCount: 0,
        growingEntries: [],
        deadCount: 0,
      });
    }
    const g = groupMap.get(entry.cropRefId)!;
    if (entry.isDead) {
      g.deadCount++;
    } else if (entry.daysWatered >= entry.daysToMaturity) {
      g.readyCount++;
    } else {
      g.growingEntries.push(entry.daysWatered);
    }
  }

  // Sort: ready first, then growing (fewest days remaining first), then dead-only groups
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const aReady = a.readyCount > 0;
    const bReady = b.readyCount > 0;
    if (aReady !== bReady) return aReady ? -1 : 1;
    const aGrowing = a.growingEntries.length > 0;
    const bGrowing = b.growingEntries.length > 0;
    if (aGrowing !== bGrowing) return aGrowing ? -1 : 1;
    // Both growing: sort by min days remaining
    const aMinDays = a.daysToMaturity - Math.max(...a.growingEntries);
    const bMinDays = b.daysToMaturity - Math.max(...b.growingEntries);
    return aMinDays - bMinDays;
  });

  const totalTiles = cropsData.length;
  const readyTiles = cropsData.filter((c) => !c.isDead && c.daysWatered >= c.daysToMaturity).length;
  const deadTiles = cropsData.filter((c) => c.isDead).length;

  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-200">Farm Crops</h2>
      <p className="mb-4 text-lg text-slate-700 dark:text-slate-300">
        <span className="font-semibold">{totalTiles}</span> crop tile{totalTiles !== 1 ? 's' : ''} planted
        {readyTiles > 0 && <> — <span className="font-semibold text-emerald-700 dark:text-emerald-400">{readyTiles} ready to harvest</span></>}
        {deadTiles > 0 && <> — <span className="font-semibold text-slate-500">{deadTiles} dead</span></>}
        .
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const isFullyReady = g.readyCount > 0 && g.growingEntries.length === 0 && g.deadCount === 0;
          const hasReady = g.readyCount > 0;
          const hasGrowing = g.growingEntries.length > 0;
          const hasOnlyDead = g.deadCount > 0 && g.readyCount === 0 && g.growingEntries.length === 0;
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
                  {hasGrowing && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3.5 py-1 text-base font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      {g.growingEntries.length} growing — {daysLeft} day{daysLeft !== 1 ? 's' : ''} to first ready
                    </span>
                  )}
                  {g.deadCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3.5 py-1 text-base font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {g.deadCount} dead — replant
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
  );
}

export default function Tips() {
  const { season, day, getCurrentDateString } = useDate();
  const { selectedCharacter } = useAuth();
  const { preferences } = useSettings();
  const { isMobile } = useDevice();
  const showCommunityEvents = preferences.spoilers.show_undiscovered_community_events;

  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [museumItems, setMuseumItems] = useState<MuseumItem[]>([]);
  const [useCharacterDate, setUseCharacterDate] = useState(false);
  const revealUndiscovered = preferences.spoilers.show_undiscovered_items;
  const showVillagerGifts = preferences.spoilers.show_villager_gifts;
  const [fishScheduleMap, setFishScheduleMap] = useState<Record<number, FishScheduleEntry>>({});
  const [mineralDataMap, setMineralDataMap] = useState<Record<number, MineralInfo>>({});
  const [forageableScheduleMap, setForageableScheduleMap] = useState<Record<number, ForageableEntry>>({});
  const [forageableByName, setForageableByName] = useState<Map<string, ForageableEntry>>(new Map());
  const [activeTab, setActiveTab] = useState<TipsTab>(() => (sessionStorage.getItem(TIPS_TAB_KEY) as TipsTab) ?? 'quests');
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

  const matPileByQuest = new Map<number, Map<string, number>>();
  for (const pile of (selectedCharacter?.project_mat_pile_data ?? []) as MatPileEntry[]) {
    const itemMap = new Map<string, number>();
    for (const item of pile.donatedItems) itemMap.set(item.name, (itemMap.get(item.name) ?? 0) + item.amount);
    matPileByQuest.set(pile.questID, itemMap);
  }

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

  const storageMap = buildStorageMap(selectedCharacter?.chest_data ?? []);
  const storageNameMap = buildStorageMapByName(selectedCharacter?.chest_data ?? []);
  const inventoryNameMap = buildInventoryMapByName(selectedCharacter?.player_inventory ?? []);

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

  return (
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
          <svg viewBox="0 0 24 24" className="flex-none w-[3.6rem] h-[3.6rem]" aria-hidden>
            <polygon points="21.24,8.17 15.83,2.76 8.17,2.76 2.76,8.17 2.76,15.83 8.17,21.24 15.83,21.24 21.24,15.83" fill="none" stroke="#8B1A1A" strokeWidth="1.5" />
            <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#8B1A1A">!</text>
          </svg>
          <span>{isMobile ? 'Long-press' : 'Hover over'} any icon or chip for details — fish locations, storage counts, donation progress, and more. For bug reports, feature requests, or to discuss missing/incorrect info, click the ISSUES button in the header. Feedback is welcome!</span>
        </div>
      </header>

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
                  <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
                  {hasFavs && (
                    <div className="flex flex-col items-center">
                      <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-[#5c9a30] dark:text-[#6aae36]">
                        Favorites
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {gifts!.favorites.map((item) => (
                          <GiftItemIcon key={item} name={item} sentiment="favorite" storageCount={selectedCharacter ? storageNameMap.get(item) ?? 0 : undefined} />
                        ))}
                      </div>
                    </div>
                  )}
                  {hasFavs && hasDislikes && (
                    <div className="hidden self-stretch sm:block">
                      <div className="h-full w-px bg-stone-200/80 dark:bg-slate-600/40 mb-2" />
                    </div>
                  )}
                  {hasDislikes && (
                    <div className="flex flex-col items-center">
                      <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-red-400 dark:text-red-300">
                        Dislikes
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {gifts!.dislikes.map((item) => (
                          <GiftItemIcon key={item} name={item} sentiment="dislike" storageCount={selectedCharacter ? storageNameMap.get(item) ?? 0 : undefined} />
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
            {!selectedCharacter ? (
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
                                ? <BlueprintRewardIcon name={r.name} amount={r.amount} />
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
            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
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
              <div className="grid grid-cols-2 gap-4">
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
                  <p className="self-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
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
              money={selectedCharacter?.money}
            />
            <BuildingStatusCard
              homeLevel={selectedCharacter?.home_level ?? null}
              homeConstructionDays={selectedCharacter?.home_construction_days ?? 0}
              barnData={selectedCharacter?.barn_data ?? []}
              storageNameMap={selectedCharacter ? storageNameMap : undefined}
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
                  )
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
