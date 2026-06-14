import { useCallback, useRef, useState } from 'react';
import { useSettings, SpoilerPreferences } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';

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

type SpoilerGroup = {
  heading: string;
  items: { key: keyof SpoilerPreferences; label: string }[];
};

const SPOILER_GROUPS: SpoilerGroup[] = [
  {
    heading: 'Dashboard',
    items: [
      { key: 'show_undiscovered_fish', label: 'Show undiscovered fish' },
      { key: 'show_undiscovered_items', label: 'Show undiscovered items' },
      { key: 'show_undiscovered_cooking_recipes', label: 'Show undiscovered cooking recipes' },
      { key: 'show_undiscovered_crafting_recipes', label: 'Show undiscovered crafting recipes' },
      { key: 'show_undiscovered_critters', label: 'Show undiscovered critters' },
      { key: 'show_undiscovered_forageables', label: 'Show undiscovered forageables' },
    ],
  },
  {
    heading: 'Quests',
    items: [
      { key: 'show_undiscovered_villager_quests', label: 'Show upcoming / undiscovered villager quests' },
      { key: 'show_undiscovered_community_quests', label: 'Show upcoming / undiscovered community quests' },
      { key: 'show_undiscovered_community_events', label: 'Show upcoming community events (birthdays & festivals)' },
    ],
  },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 ${
        checked ? 'bg-slate-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'saving') return <span className="text-xs text-slate-400">Saving…</span>;
  if (state === 'saved') return <span className="text-xs font-medium text-emerald-600">✓ Saved</span>;
  return <span className="text-xs font-medium text-red-600">Save failed</span>;
}

function useSaveState() {
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (timer.current) clearTimeout(timer.current);
    setState('saving');
    try {
      await fn();
      setState('saved');
    } catch (err) {
      console.error('[Settings] save failed:', err);
      setState('error');
    }
    timer.current = setTimeout(() => setState('idle'), 2000);
  }, []);

  return { state, run };
}

export default function Settings() {
  const { preferences, loading, updateTimezone, updateDarkMode, updateSpoiler } = useSettings();
  const { isGuestSession } = useAuth();
  const darkSave = useSaveState();
  const tzSave = useSaveState();
  const spoilerSave = useSaveState();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Settings</h1>
        {isGuestSession && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2 dark:bg-amber-900/20 dark:text-amber-300">
            You're in guest mode. Settings changes will apply for this session only.
          </p>
        )}
      </header>

      {loading ? (
        <p className="text-slate-600 dark:text-slate-400">Loading settings…</p>
      ) : (
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-start">

          {/* LEFT / TOP — Spoiler settings (first in DOM = first on mobile) */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Spoiler Settings</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Turn off a toggle to hide undiscovered content and avoid spoilers.
                </p>
              </div>
              <SaveIndicator state={spoilerSave.state} />
            </div>
            <div className="space-y-6">
              {SPOILER_GROUPS.map((group) => (
                <div key={group.heading}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {group.heading}
                  </h3>
                  <ul className={
                    group.items.length > 2
                      ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
                      : 'space-y-3'
                  }>
                    {group.items.map(({ key, label }) => (
                      <li key={key} className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2.5 dark:border-slate-700/60">
                        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                        <Toggle
                          checked={preferences.spoilers[key]}
                          onChange={(v) => spoilerSave.run(() => updateSpoiler(key, v))}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* RIGHT / BOTTOM — Appearance + Timezone stacked */}
          <div className="space-y-8">
            {/* Appearance */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Appearance</h2>
                <SaveIndicator state={darkSave.state} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700 dark:text-slate-300">Dark mode</span>
                <Toggle
                  checked={preferences.dark_mode}
                  onChange={(v) => darkSave.run(() => updateDarkMode(v))}
                />
              </div>
            </section>

            {/* Timezone */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Timezone</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Used to display save-file upload times in your local time.
                  </p>
                </div>
                <SaveIndicator state={tzSave.state} />
              </div>
              <select
                value={preferences.timezone}
                disabled={tzSave.state === 'saving'}
                onChange={(e) => tzSave.run(() => updateTimezone(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </section>
          </div>

        </div>
      )}
    </div>
  );
}
