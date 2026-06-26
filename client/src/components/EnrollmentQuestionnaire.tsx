import { useState, ReactNode } from 'react';
import { useSettings, SpoilerPreferences } from '../context/SettingsContext';

const TIMEZONES = [
  { label: 'UTC−12:00 — Baker Island', value: 'Etc/GMT+12' },
  { label: 'UTC−11:00 — American Samoa', value: 'Pacific/Pago_Pago' },
  { label: 'UTC−10:00 — Hawaii', value: 'Pacific/Honolulu' },
  { label: 'UTC−09:00 — Alaska', value: 'America/Anchorage' },
  { label: 'UTC−08:00 — Pacific Time (US)', value: 'America/Los_Angeles' },
  { label: 'UTC−07:00 — Mountain Time (US)', value: 'America/Denver' },
  { label: 'UTC−06:00 — Central Time (US)', value: 'America/Chicago' },
  { label: 'UTC−05:00 — Eastern Time (US)', value: 'America/New_York' },
  { label: 'UTC−04:00 — Atlantic Time', value: 'America/Halifax' },
  { label: 'UTC−03:00 — Brasília', value: 'America/Sao_Paulo' },
  { label: 'UTC±00:00 — London', value: 'Europe/London' },
  { label: 'UTC+01:00 — Central Europe', value: 'Europe/Paris' },
  { label: 'UTC+02:00 — Eastern Europe', value: 'Europe/Helsinki' },
  { label: 'UTC+03:00 — Moscow', value: 'Europe/Moscow' },
  { label: 'UTC+05:30 — India', value: 'Asia/Kolkata' },
  { label: 'UTC+08:00 — China / Singapore', value: 'Asia/Singapore' },
  { label: 'UTC+09:00 — Japan / Korea', value: 'Asia/Tokyo' },
  { label: 'UTC+10:00 — Sydney', value: 'Australia/Sydney' },
  { label: 'UTC+12:00 — New Zealand', value: 'Pacific/Auckland' },
];

type SettingItem = {
  key: keyof SpoilerPreferences;
  label: ReactNode;
  description: string;
  note?: string;
};

type SettingGroup = {
  heading: string;
  items: SettingItem[];
};

const SETTING_GROUPS: SettingGroup[] = [
  {
    heading: 'What do you want to discover on your own?',
    items: [
      {
        key: 'show_undiscovered_fish',
        label: 'I want to see undiscovered fish in my dashboard',
        description: 'Shows fish you haven\'t caught yet and ones you have.',
      },
      {
        key: 'show_undiscovered_items',
        label: 'I want to see undiscovered items in my dashboard/tips',
        description: 'Shows items you haven\'t found yet in collection views and the museum donation tracker.',
      },
      {
        key: 'show_undiscovered_cooking_recipes',
        label: 'I want to see cooking recipes I haven\'t unlocked yet',
        description: 'Reveals locked recipes so you know what to work toward.',
      },
      {
        key: 'show_undiscovered_crafting_recipes',
        label: 'I want to see crafting recipes I haven\'t unlocked yet',
        description: 'Reveals locked crafting recipes in the dashboard.',
      },
      {
        key: 'show_undiscovered_critters',
        label: 'I want to see critters I haven\'t caught yet',
        description: 'Shows uncaught critters alongside ones in your collection.',
      },
      {
        key: 'show_undiscovered_forageables',
        label: 'I want to see forageables I haven\'t found yet',
        description: 'Reveals forageable items you haven\'t discovered.',
      },
    ],
  },
  {
    heading: 'Quests & Events',
    items: [
      {
        key: 'show_undiscovered_villager_quests',
        label: <>I want to see upcoming villager side quests<br />(including ones I haven't triggered yet)</>,
        description: 'Shows future quests so you can plan ahead.',
      },
      {
        key: 'show_undiscovered_community_quests',
        label: <>I want to see upcoming community quests<br />(crisis events)</>,
        description: 'Shows community quests not yet active in your game.',
      },
      {
        key: 'show_event_choice_outcomes',
        label: <>I want to see event choice outcome info<br />for community quests (assumes success)</>,
        description: '',
        note: 'You can still hide/reveal individual outcomes as needed at any time, by interacting with the Spoiler checkbox on the page.',
      },
      {
        key: 'show_undiscovered_community_events',
        label: 'I want to see upcoming birthdays and festivals',
        description: 'Shows all calendar events so you can prepare gifts and attendance.',
      },
    ],
  },
  {
    heading: 'Tips Page',
    items: [
      {
        key: 'show_villager_gifts',
        label: <>I want to see villagers' favorite and disliked gifts<br />(even if I have not discovered them yet)</>,
        description: 'Shows gift preferences for upcoming birthdays.',
      },
    ],
  },
];

function SettingGroupSection({
  group,
  selections,
  toggle,
}: {
  group: SettingGroup;
  selections: Partial<SpoilerPreferences>;
  toggle: (key: keyof SpoilerPreferences) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {group.heading}
      </h2>
      <ul className="space-y-2">
        {group.items.map(({ key, label, description, note }) => {
          const checked = !!selections[key];
          return (
            <li key={key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/60">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(key)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
                  {description && <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>}
                  {note && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-slate-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-slate-200">
                      {note}
                    </p>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function EnrollmentQuestionnaire() {
  const { preferences, updateOnboarded, updateManySpoilers, updateTimezone } = useSettings();

  const [selections, setSelections] = useState<Partial<SpoilerPreferences>>(() => ({
    ...preferences.spoilers,
  }));
  const [timezone, setTimezone] = useState(preferences.timezone);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = (key: keyof SpoilerPreferences) => {
    setSelections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateTimezone(timezone);
      await updateManySpoilers(selections as SpoilerPreferences);
      await updateOnboarded(true);
    } catch {
      setSaveError('Settings could not be saved to the server. Your preferences may not persist after a refresh. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-[692px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl lg:max-w-[916px] dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="sticky top-0 rounded-t-2xl border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Welcome to AskFin!
          </h1>
          <p className="mt-1 text-base text-slate-500 dark:text-slate-400">
            Choose what you'd like to see — check the boxes that sound good to you.
            You can change any of these at any time in the <strong>Settings</strong> tab.
          </p>
        </div>

        {/* Groups — single column on mobile, two columns on lg+ */}
        <div className="p-6 lg:grid lg:grid-cols-2 lg:gap-8">
          {/* Left column: discovery settings */}
          <div>
            <SettingGroupSection group={SETTING_GROUPS[0]} selections={selections} toggle={toggle} />
          </div>
          {/* Right column: quests/events + tips page */}
          <div className="mt-6 space-y-6 lg:mt-0">
            <SettingGroupSection group={SETTING_GROUPS[1]} selections={selections} toggle={toggle} />
            <SettingGroupSection group={SETTING_GROUPS[2]} selections={selections} toggle={toggle} />
          </div>
        </div>

        {/* Timezone */}
        <div className="border-t border-slate-200 px-6 py-5 dark:border-slate-700">
          <label className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-100">
            Your timezone
          </label>
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            Used to display save-file upload times in your local time.
          </p>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 sm:max-w-xs"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-col gap-2 rounded-b-2xl border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
          {saveError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-300">
              {saveError}
            </p>
          )}
          <div className="flex items-center gap-8">
            <div className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-slate-200">
              Note: these settings are at the User level, not the Character level, so whatever you set these to will apply no matter which of your character files you are looking at.
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-amber-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Start exploring!'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
