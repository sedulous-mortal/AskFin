import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Character = {
  id: string;
  user_id: string;
  character_name: string;
  save_file_name: string | null;
  updated_at: string | null;
};

export type ResolvedItem = { id: number; name: string | null };
export type EdibleSource = 'forageable' | 'farmable' | 'both';
export type EdibleItem = { id: number; name: string | null; source: EdibleSource };
export type CraftingRecipeItem = { id: number; name: string | null; category: string | null };
export type CookingRecipeItem = { id: number; name: string | null; diet: string | null };

export type QuestStatus = { id: number; status: number };
export type MatPileEntry = { questID: number; donatedItems: { name: string; amount: number }[] };
export type InventorySlot = { id: number; name: string | null; amount: number };
export type MuseumItem = { id: number; name: string | null; category: 'fish' | 'mineral' | 'plant' };
export type ChestItem = { id: number; name: string | null; amount: number };
export type ChestEntry = {
  objId: number;
  itemId: number | null;
  scene: string | null;
  isIcebox: boolean;
  isRotten: boolean;
  items: ChestItem[];
};

// Item IDs that correspond to crafting/processing stations (not storage containers).
// Based on game_id_maps.json: Smelter (63, 550), Smoker (551), Kiln (1316, 1320),
// Press (675), Spinning Wheel (264), Compost Bin (175), Saw (676).
const PROCESSOR_ITEM_IDS = new Set([63, 175, 264, 550, 551, 675, 676, 1316, 1320]);

function isProcessor(chest: ChestEntry): boolean {
  return chest.itemId !== null && PROCESSOR_ITEM_IDS.has(chest.itemId);
}

// Mine scenes contain world-spawned treasure chests that are not player storage.
// Exclude them so mine loot doesn't inflate the player's "in storage" counts.
function isMineLoot(chest: ChestEntry): boolean {
  return chest.scene != null && chest.scene.startsWith('Mine_');
}

export function buildStorageMap(chestData: ChestEntry[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const chest of chestData) {
    if (isProcessor(chest) || isMineLoot(chest)) continue;
    for (const { id, amount } of chest.items) {
      map.set(id, (map.get(id) ?? 0) + amount);
    }
  }
  return map;
}

export function buildStorageMapByName(chestData: ChestEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const chest of chestData) {
    if (isProcessor(chest) || isMineLoot(chest)) continue;
    for (const { name, amount } of chest.items) {
      if (name) map.set(name, (map.get(name) ?? 0) + amount);
    }
  }
  return map;
}

export function buildProcessorMapByName(chestData: ChestEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const chest of chestData) {
    if (!isProcessor(chest)) continue;
    for (const { name, amount } of chest.items) {
      if (name) map.set(name, (map.get(name) ?? 0) + amount);
    }
  }
  return map;
}

export function buildContributedMapByName(matPileData: MatPileEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const pile of matPileData) {
    for (const { name, amount } of pile.donatedItems) {
      map.set(name, (map.get(name) ?? 0) + amount);
    }
  }
  return map;
}

export function buildInventoryMapByName(inventory: InventorySlot[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const { name, amount } of inventory) {
    if (name) map.set(name, (map.get(name) ?? 0) + amount);
  }
  return map;
}

export type ToolData = {
  toolName: string;
  tier: number;
  isUnlocked: boolean;
  upgrading: boolean;
  upgradeDaysRemaining: number;
  slotNum: number;
  maxTier: number;
};

export type BarnData = {
  prefabId: number;  // 0=Barn, 1=Coop, 2=Pen, 3=Hutch
  level: number;     // 0=base (4 animals), 1=upgraded (8 animals)
  name: string | null;
};

export type CropEntry = {
  cropRefId: number;
  name: string;
  image: string;
  daysToMaturity: number;
  goneToSeedDays: number | null;
  canGoToSeed: boolean;
  isMultiHarvest: boolean;
  requiresWatering: boolean;
  daysWatered: number;
  isDead: boolean;
  fertility: number;
};

export type CharacterDetail = {
  id: string;
  character_name: string;
  exp: number | null;
  player_pronouns: number | null;
  total_play_time_seconds: number | null;
  fish_discovered: ResolvedItem[];
  fish_undiscovered: ResolvedItem[];
  fish_total: number;
  critters_discovered: number[];
  items_discovered: ResolvedItem[];
  unlocked_crafting_recipes: CraftingRecipeItem[];
  unlocked_crafting_recipes_undiscovered: CraftingRecipeItem[];
  unlocked_cooking_recipes: CookingRecipeItem[];
  unlocked_cooking_recipes_undiscovered: CookingRecipeItem[];
  edibles_discovered: EdibleItem[];
  edibles_undiscovered: EdibleItem[];
  edibles_total: number;
  quest_data: QuestStatus[];
  donated_specimen_count: number;
  donated_museum_items: number[];
  player_inventory: InventorySlot[];
  current_day: number | null;
  current_season: number | null;
  current_year: number | null;
  difficulty: number | null;
  updated_at: string | null;
  tool_data: ToolData[];
  home_level: number | null;
  home_construction_days: number;
  money: number | null;
  barn_data: BarnData[];
  crops_data: CropEntry[];
  project_mat_pile_data: MatPileEntry[];
  chest_data: ChestEntry[];
  unlocked_skills: number[];
  is_rainy_or_stormy: boolean;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  characters: Character[];
  selectedCharacterId: string | null;
  selectedCharacter: CharacterDetail | null;
  characterDetailLoading: boolean;
  setSelectedCharacterId: (id: string) => void;
  refreshCharacters: () => Promise<void>;
  refreshSelectedCharacter: () => Promise<CharacterDetail | null>;
  refreshCharacterById: (id: string) => Promise<CharacterDetail | null>;
  logout: () => Promise<void>;
  enterWithoutLogin: () => void;
  isGuestSession: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isGuestSession, setIsGuestSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterDetail | null>(null);
  const [characterDetailLoading, setCharacterDetailLoading] = useState(false);

  const guestCharacters: Character[] = [
    { id: 'guest-character', user_id: 'guest-user', character_name: 'Guest Adventurer', save_file_name: null, updated_at: null },
  ];

  const guestCharacterDetail: CharacterDetail = {
    id: 'guest-character',
    character_name: 'Guest Adventurer',
    exp: 12500,
    player_pronouns: 1,
    total_play_time_seconds: 36000,
    fish_discovered: [
      { id: 228, name: 'Trout' }, { id: 483, name: 'Bass' }, { id: 671, name: 'Carp' },
      { id: 112, name: 'Salmon' }, { id: 345, name: 'Perch' },
    ],
    fish_undiscovered: [
      { id: 501, name: 'Pike' }, { id: 602, name: 'Catfish' }, { id: 700, name: 'Tuna' },
    ],
    fish_total: 8,
    critters_discovered: [1001, 1002, 1003, 1004],
    items_discovered: [
      { id: 34, name: 'Carrot' }, { id: 36, name: 'Dandelions' }, { id: 165, name: 'Fiddlehead Fern' },
      { id: 169, name: 'Morel' }, { id: 278, name: 'Cherry' }, { id: 302, name: 'Raspberry' },
    ],
    unlocked_crafting_recipes: [
      { id: 1453, name: 'Mounted Display', category: 'Furniture' },
      { id: 1454, name: 'Shelf Display', category: 'Furniture' },
      { id: 427, name: 'Bed of Straw', category: 'Furniture' },
      { id: 58, name: 'Crafting Table', category: 'Stations' },
    ],
    unlocked_crafting_recipes_undiscovered: [],
    unlocked_cooking_recipes: [
      { id: 914, name: 'Fried Mushrooms', diet: 'herbivore' },
      { id: 944, name: 'Fried Egg', diet: 'carnivore' },
      { id: 957, name: 'Cake', diet: 'omnivore' },
    ],
    unlocked_cooking_recipes_undiscovered: [],
    edibles_discovered: [
      { id: 34, name: 'Carrot', source: 'farmable' },
      { id: 36, name: 'Dandelions', source: 'forageable' },
      { id: 302, name: 'Raspberry', source: 'both' },
    ],
    edibles_undiscovered: [
      { id: 162, name: 'Cattail', source: 'forageable' },
      { id: 169, name: 'Morel', source: 'forageable' },
    ],
    edibles_total: 5,
    quest_data: [
      { id: 350, status: 3 },
      { id: 351, status: 1 },
    ],
    donated_specimen_count: 0,
    donated_museum_items: [],
    player_inventory: [],
    current_day: 14,
    current_season: 0,
    current_year: 1,
    difficulty: 1,
    updated_at: null,
    tool_data: [
      { toolName: 'watercan', tier: 1, isUnlocked: true, upgrading: false, upgradeDaysRemaining: 0, slotNum: 0, maxTier: 4 },
      { toolName: 'rod',      tier: 2, isUnlocked: true, upgrading: false, upgradeDaysRemaining: 0, slotNum: 1, maxTier: 4 },
      { toolName: 'hoe',      tier: 1, isUnlocked: true, upgrading: false, upgradeDaysRemaining: 0, slotNum: 2, maxTier: 4 },
      { toolName: 'pick',     tier: 2, isUnlocked: true, upgrading: true,  upgradeDaysRemaining: 1, slotNum: 4, maxTier: 4 },
      { toolName: 'axe',      tier: 1, isUnlocked: true, upgrading: false, upgradeDaysRemaining: 0, slotNum: 6, maxTier: 4 },
      { toolName: 'scythe',   tier: 0, isUnlocked: true, upgrading: false, upgradeDaysRemaining: 0, slotNum: 7, maxTier: 4 },
    ],
    home_level: 1,
    home_construction_days: 0,
    barn_data: [
      { prefabId: 0, level: 0, name: 'Barn' },
      { prefabId: 1, level: 1, name: 'Coop' },
    ],
    money: 1250,
    crops_data: [
      { cropRefId: 98,  name: 'Cabbage',    image: '/edibles/Cabbage.png',    daysToMaturity: 6,  goneToSeedDays: 7,    canGoToSeed: true,  isMultiHarvest: false, requiresWatering: true,  daysWatered: 6, isDead: false, fertility: 0 },
      { cropRefId: 93,  name: 'Carrot',     image: '/edibles/Carrot.png',     daysToMaturity: 5,  goneToSeedDays: 6,    canGoToSeed: true,  isMultiHarvest: false, requiresWatering: true,  daysWatered: 3, isDead: false, fertility: 0 },
      { cropRefId: 106, name: 'Strawberry', image: '/edibles/Strawberry.png', daysToMaturity: 9,  goneToSeedDays: null, canGoToSeed: false, isMultiHarvest: true,  requiresWatering: true,  daysWatered: 2, isDead: false, fertility: 0 },
      { cropRefId: 93,  name: 'Carrot',     image: '/edibles/Carrot.png',     daysToMaturity: 5,  goneToSeedDays: 6,    canGoToSeed: true,  isMultiHarvest: false, requiresWatering: true,  daysWatered: 5, isDead: false, fertility: 0 },
      { cropRefId: 104, name: 'Radish',     image: '/edibles/Radish.png',     daysToMaturity: 4,  goneToSeedDays: 5,    canGoToSeed: true,  isMultiHarvest: false, requiresWatering: true,  daysWatered: 1, isDead: true,  fertility: 0 },
    ],
    project_mat_pile_data: [],
    chest_data: [],
    unlocked_skills: [],
    is_rainy_or_stormy: false,
  };

  const guestUser = {
    id: 'guest-user',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'guest@example.com',
    email_confirmed_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    role: 'authenticated',
    phone: null,
    identities: [],
  } as unknown as User;

  const effectiveUser = isGuestSession ? guestUser : user;

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!mounted) return;
        if (sessionData.session) {
          setUser(sessionData.session.user);
          // Not inside the auth-state-change callback, so this is safe to await.
          await fetchCharacters(sessionData.session.user.id);
        }
      } catch (err) {
        console.error('Auth initialization failed:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // IMPORTANT: this callback is invoked by supabase-js while it holds the
    // navigator Web Lock that guards all auth operations. Calling any supabase
    // method here synchronously (including supabase.from(...), which needs the
    // access token) re-enters that lock and deadlocks — getSession() above then
    // never resolves and `loading` is stuck true (infinite loading spinner).
    // So we only update React state synchronously here and DEFER the character
    // fetch with setTimeout(0), which runs after the lock has been released.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user || null);
      if (session?.user) {
        const userId = session.user.id;
        setTimeout(() => {
          if (mounted) fetchCharacters(userId);
        }, 0);
      } else {
        setCharacters([]);
        setSelectedCharacterId(null);
        setIsGuestSession(false);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedCharacterId) {
      setSelectedCharacter(null);
      return;
    }
    if (selectedCharacterId === 'guest-character') {
      setSelectedCharacter(guestCharacterDetail);
      return;
    }

    let cancelled = false;
    setSelectedCharacter(null);
    setCharacterDetailLoading(true);

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/characters/${selectedCharacterId}`);
        if (!res.ok) throw new Error('Failed to fetch character detail');
        const data: CharacterDetail = await res.json();
        if (!cancelled) setSelectedCharacter(data);
      } catch {
        if (!cancelled) setSelectedCharacter(null);
      } finally {
        if (!cancelled) setCharacterDetailLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedCharacterId]);

  const fetchCharacters = async (userId: string) => {
    try {
      console.log('[fetchCharacters] querying for userId:', userId);
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      console.log('[fetchCharacters] result — data:', data, 'error:', error);
      if (error) throw error;
      setCharacters(data || []);

      if (data && data.length > 0) {
        const saved = localStorage.getItem('selectedCharacterId');
        const exists = data.find((c) => c.id === saved);
        setSelectedCharacterId(exists?.id || data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch characters:', err);
    }
  };

  const enterWithoutLogin = () => {
    setIsGuestSession(true);
    setUser(null);
    setCharacters(guestCharacters);
    setSelectedCharacterId(guestCharacters[0].id);
  };

  const clearLocalAuthState = () => {
    setIsGuestSession(false);
    setUser(null);
    setCharacters([]);
    setSelectedCharacterId(null);

    // Remove app-specific cached data and any Supabase session keys.
    try {
      localStorage.removeItem('selectedCharacterId');
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.startsWith('supabase.'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (err) {
      console.error('Failed to clear cached auth data:', err);
    }
  };

  const logout = async () => {
    // Clear local state and cached data first so the UI updates immediately
    // and the app knows the user is logged out even if the network call hangs.
    const wasGuest = isGuestSession;
    clearLocalAuthState();

    if (wasGuest) {
      return;
    }

    // Use a local-scope sign out to avoid hanging on a server round-trip.
    // The session keys were already purged above, so even if this rejects
    // the caller's navigation will still proceed.
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.error('Supabase signOut error:', error.message);
      }
    } catch (err) {
      console.error('Unexpected logout error:', err);
    }
  };

  const refreshCharacterById = async (id: string): Promise<CharacterDetail | null> => {
    if (!id || id === 'guest-character') return null;
    setCharacterDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/characters/${id}`);
      if (!res.ok) throw new Error('Failed');
      const data: CharacterDetail = await res.json();
      setSelectedCharacterId(id);
      localStorage.setItem('selectedCharacterId', id);
      setSelectedCharacter(data);
      return data;
    } catch {
      return null;
    } finally {
      setCharacterDetailLoading(false);
    }
  };

  const refreshSelectedCharacter = async (): Promise<CharacterDetail | null> => {
    const id = selectedCharacterId;
    if (!id || id === 'guest-character') return null;
    return refreshCharacterById(id);
  };

  const value: AuthContextType = {
    user: effectiveUser,
    loading,
    characters,
    selectedCharacterId,
    selectedCharacter,
    characterDetailLoading,
    setSelectedCharacterId: (id: string) => {
      setSelectedCharacterId(id);
      localStorage.setItem('selectedCharacterId', id);
    },
    refreshCharacters: async () => {
      const userId = effectiveUser?.id;
      if (userId && userId !== 'guest-user') {
        await fetchCharacters(userId);
      }
    },
    refreshSelectedCharacter,
    refreshCharacterById,
    logout,
    enterWithoutLogin,
    isGuestSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
