import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type SpoilerPreferences = {
  show_undiscovered_fish: boolean;
  show_undiscovered_cooking_recipes: boolean;
  show_undiscovered_crafting_recipes: boolean;
  show_undiscovered_items: boolean;
  show_undiscovered_forageables: boolean;
  show_undiscovered_quests: boolean;
  show_undiscovered_critters: boolean;
};

export type UserPreferences = {
  timezone: string;
  spoilers: SpoilerPreferences;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: 'America/New_York',
  spoilers: {
    show_undiscovered_fish: true,
    show_undiscovered_cooking_recipes: true,
    show_undiscovered_crafting_recipes: true,
    show_undiscovered_items: true,
    show_undiscovered_forageables: true,
    show_undiscovered_quests: true,
    show_undiscovered_critters: true,
  },
};

type SettingsContextType = {
  preferences: UserPreferences;
  loading: boolean;
  updateTimezone: (tz: string) => Promise<void>;
  updateSpoiler: (key: keyof SpoilerPreferences, value: boolean) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, isGuestSession } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || isGuestSession) {
      setPreferences(DEFAULT_PREFERENCES);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/api/settings/${user.id}`)
      .then((r) => r.json())
      .then((data: UserPreferences) => {
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...data,
          spoilers: { ...DEFAULT_PREFERENCES.spoilers, ...(data.spoilers || {}) },
        });
      })
      .catch(() => setPreferences(DEFAULT_PREFERENCES))
      .finally(() => setLoading(false));
  }, [user?.id, isGuestSession]);

  const patch = useCallback(
    async (updates: { timezone?: string; spoilers?: Partial<SpoilerPreferences> }) => {
      // Optimistic update — apply immediately so the UI never snaps back
      setPreferences((prev) => ({
        ...prev,
        ...(updates.timezone !== undefined ? { timezone: updates.timezone } : {}),
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
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...data,
        spoilers: { ...DEFAULT_PREFERENCES.spoilers, ...(data.spoilers || {}) },
      });
    },
    [user?.id, isGuestSession]
  );

  const updateTimezone = useCallback(
    (tz: string) => patch({ timezone: tz }),
    [patch]
  );

  const updateSpoiler = useCallback(
    (key: keyof SpoilerPreferences, value: boolean) =>
      patch({ spoilers: { [key]: value } }),
    [patch]
  );

  return (
    <SettingsContext.Provider value={{ preferences, loading, updateTimezone, updateSpoiler }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
