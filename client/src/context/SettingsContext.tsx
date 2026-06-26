import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const LS_DARK_KEY = 'askfin_dark_mode';
const LS_ONBOARDED_KEY = 'askfin_onboarded';

export type SpoilerPreferences = {
  show_undiscovered_fish: boolean;
  show_undiscovered_cooking_recipes: boolean;
  show_undiscovered_crafting_recipes: boolean;
  show_undiscovered_items: boolean;
  show_undiscovered_forageables: boolean;
  show_undiscovered_villager_quests: boolean;
  show_undiscovered_community_quests: boolean;
  show_undiscovered_community_events: boolean;
  show_undiscovered_critters: boolean;
  show_villager_gifts: boolean;
  show_event_choice_outcomes: boolean;
};

export type UserPreferences = {
  timezone: string;
  dark_mode: boolean;
  onboarded: boolean;
  default_tab: string | null;
  default_subtab: string | null;
  spoilers: SpoilerPreferences;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: 'America/New_York',
  dark_mode: false,
  onboarded: false,
  default_tab: 'stats',
  default_subtab: null,
  spoilers: {
    show_undiscovered_fish: true,
    show_undiscovered_cooking_recipes: true,
    show_undiscovered_crafting_recipes: true,
    show_undiscovered_items: true,
    show_undiscovered_forageables: true,
    show_undiscovered_villager_quests: true,
    show_undiscovered_community_quests: true,
    show_undiscovered_community_events: true,
    show_undiscovered_critters: true,
    show_villager_gifts: false,
    show_event_choice_outcomes: false,
  },
};

type SettingsContextType = {
  preferences: UserPreferences;
  loading: boolean;
  updateTimezone: (tz: string) => Promise<void>;
  updateDarkMode: (enabled: boolean) => Promise<void>;
  updateSpoiler: (key: keyof SpoilerPreferences, value: boolean) => Promise<void>;
  updateOnboarded: (value: boolean) => Promise<void>;
  updateManySpoilers: (updates: Partial<SpoilerPreferences>) => Promise<void>;
  updateDefaultLanding: (tab: string, subtab: string | null) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, isGuestSession } = useAuth();

  // Seed dark_mode from localStorage immediately so there's no flash on load.
  // onboarded defaults to true so the enrollment modal never flashes before the
  // server response arrives; the fetch will set it to false for users who haven't
  // completed enrollment yet.
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    ...DEFAULT_PREFERENCES,
    dark_mode: localStorage.getItem(LS_DARK_KEY) === 'true',
    onboarded: true,
  }));
  // Start as true so EnrollmentGate waits for the first fetch before deciding
  // whether to show the modal.
  const [loading, setLoading] = useState(true);

  // Apply / remove `dark` class on <html> and keep localStorage in sync.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.dark_mode);
    try { localStorage.setItem(LS_DARK_KEY, String(preferences.dark_mode)); } catch {}
  }, [preferences.dark_mode]);

  useEffect(() => {
    if (!user || isGuestSession) {
      setPreferences((prev) => ({ ...DEFAULT_PREFERENCES, dark_mode: prev.dark_mode }));
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const token = sessionData.session?.access_token;
      return fetch(`${API_BASE}/api/settings/${user.id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
    })
      .then((r) => r.json())
      .then((data: UserPreferences) => {
        setPreferences((prev) => ({
          ...DEFAULT_PREFERENCES,
          ...data,
          dark_mode: data.dark_mode ?? prev.dark_mode,
          // Server is authoritative for onboarded. Default false if the key is missing
          // (new account that hasn't been through the PATCH endpoint yet).
          onboarded: data.onboarded ?? false,
          spoilers: { ...DEFAULT_PREFERENCES.spoilers, ...(data.spoilers || {}) },
        }));
      })
      .catch(() => setPreferences((prev) => ({
        ...DEFAULT_PREFERENCES,
        dark_mode: prev.dark_mode,
        // Fall back to localStorage when the server is unreachable so an enrolled
        // user doesn't see the modal just because the network is down.
        onboarded: localStorage.getItem(LS_ONBOARDED_KEY) === 'true',
      })))
      .finally(() => setLoading(false));
  }, [user?.id, isGuestSession]);

  const patch = useCallback(
    async (updates: { timezone?: string; dark_mode?: boolean; onboarded?: boolean; default_tab?: string | null; default_subtab?: string | null; spoilers?: Partial<SpoilerPreferences> }) => {
      // Optimistic update first so the UI never lags.
      setPreferences((prev) => ({
        ...prev,
        ...(updates.timezone !== undefined ? { timezone: updates.timezone } : {}),
        ...(updates.dark_mode !== undefined ? { dark_mode: updates.dark_mode } : {}),
        ...(updates.onboarded !== undefined ? { onboarded: updates.onboarded } : {}),
        ...(updates.default_tab !== undefined ? { default_tab: updates.default_tab } : {}),
        ...(updates.default_subtab !== undefined ? { default_subtab: updates.default_subtab } : {}),
        spoilers: { ...prev.spoilers, ...(updates.spoilers || {}) },
      }));
      if (updates.onboarded !== undefined) {
        try { localStorage.setItem(LS_ONBOARDED_KEY, String(updates.onboarded)); } catch {}
      }

      if (!user || isGuestSession) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${API_BASE}/api/settings/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Settings save failed (${res.status})`);
      }
      const data: UserPreferences = await res.json();
      // Merge server response but never let it override dark_mode with a stale/missing
      // value — localStorage is the authoritative source for that key.
      setPreferences((prev) => ({
        ...DEFAULT_PREFERENCES,
        ...data,
        dark_mode: data.dark_mode ?? prev.dark_mode,
        onboarded: data.onboarded ?? prev.onboarded,
        default_tab: data.default_tab ?? prev.default_tab,
        default_subtab: data.default_subtab ?? null,
        spoilers: { ...DEFAULT_PREFERENCES.spoilers, ...(data.spoilers || {}) },
      }));
    },
    [user?.id, isGuestSession]
  );

  const updateTimezone = useCallback(
    (tz: string) => patch({ timezone: tz }),
    [patch]
  );

  const updateDarkMode = useCallback(
    (enabled: boolean) => patch({ dark_mode: enabled }),
    [patch]
  );

  const updateSpoiler = useCallback(
    (key: keyof SpoilerPreferences, value: boolean) =>
      patch({ spoilers: { [key]: value } }),
    [patch]
  );

  const updateOnboarded = useCallback(
    (value: boolean) => patch({ onboarded: value }),
    [patch]
  );

  const updateManySpoilers = useCallback(
    (updates: Partial<SpoilerPreferences>) => patch({ spoilers: updates }),
    [patch]
  );

  const updateDefaultLanding = useCallback(
    (tab: string, subtab: string | null) => patch({ default_tab: tab, default_subtab: subtab }),
    [patch]
  );

  return (
    <SettingsContext.Provider value={{ preferences, loading, updateTimezone, updateDarkMode, updateSpoiler, updateOnboarded, updateManySpoilers, updateDefaultLanding }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
