import { useState, ReactNode } from 'react';
import { useSettings, SpoilerPreferences } from '../context/SettingsContext';

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
        description: 'Shows fish you haven\'t caught yet alongside ones you have.',
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
  const { preferences, updateOnboarded, updateManySpoilers } = useSettings();

  const [selections, setSelections] = useState<Partial<SpoilerPreferences>>(() => ({
    ...preferences.spoilers,
  }));
  const [saving, setSaving] = useState(false);

  const toggle = (key: keyof SpoilerPreferences) => {
    setSelections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateManySpoilers(selections as SpoilerPreferences);
      await updateOnboarded(true);
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

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center gap-8 rounded-b-2xl border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
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
  );
}
