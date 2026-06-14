import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const LS_DARK_KEY = 'askfin_dark_mode';

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
  spoilers: SpoilerPreferences;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: 'America/New_York',
  dark_mode: false,
  onboarded: false,
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
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, isGuestSession } = useAuth();

  // Seed dark_mode from localStorage immediately so there's no flash on load.
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    ...DEFAULT_PREFERENCES,
    dark_mode: localStorage.getItem(LS_DARK_KEY) === 'true',
  }));
  const [loading, setLoading] = useState(false);

  // Apply / remove `dark` class on <html> and keep localStorage in sync.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.dark_mode);
    try { localStorage.setItem(LS_DARK_KEY, String(preferences.dark_mode)); } catch {}
  }, [preferences.dark_mode]);

  useEffect(() => {
    if (!user || isGuestSession) {
      setPreferences((prev) => ({ ...DEFAULT_PREFERENCES, dark_mode: prev.dark_mode }));
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/api/settings/${user.id}`)
      .then((r) => r.json())
      .then((data: UserPreferences) => {
        setPreferences((prev) => ({
          ...DEFAULT_PREFERENCES,
          ...data,
          // Server may be returning stale data without dark_mode; localStorage is authoritative.
          dark_mode: data.dark_mode ?? prev.dark_mode,
          spoilers: { ...DEFAULT_PREFERENCES.spoilers, ...(data.spoilers || {}) },
        }));
      })
      .catch(() => setPreferences((prev) => ({ ...DEFAULT_PREFERENCES, dark_mode: prev.dark_mode })))
      .finally(() => setLoading(false));
  }, [user?.id, isGuestSession]);

  const patch = useCallback(
    async (updates: { timezone?: string; dark_mode?: boolean; onboarded?: boolean; spoilers?: Partial<SpoilerPreferences> }) => {
      // Optimistic update first so the UI never lags.
      setPreferences((prev) => ({
        ...prev,
        ...(updates.timezone !== undefined ? { timezone: updates.timezone } : {}),
        ...(updates.dark_mode !== undefined ? { dark_mode: updates.dark_mode } : {}),
        ...(updates.onboarded !== undefined ? { onboarded: updates.onboarded } : {}),
        spoilers: { ...prev.spoilers, ...(updates.spoilers || {}) },
      }));

      if (!user || isGuestSession) return;

      const res = await fetch(`${API_BASE}/api/settings/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <SettingsContext.Provider value={{ preferences, loading, updateTimezone, updateDarkMode, updateSpoiler, updateOnboarded, updateManySpoilers }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
