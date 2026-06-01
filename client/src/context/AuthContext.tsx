import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Character = {
  id: string;
  user_id: string;
  character_name: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  characters: Character[];
  selectedCharacterId: string | null;
  setSelectedCharacterId: (id: string) => void;
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

  const guestCharacters: Character[] = [
    { id: 'guest-character', user_id: 'guest-user', character_name: 'Guest Adventurer' },
  ];

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

  const fetchCharacters = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

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

  const value: AuthContextType = {
    user: effectiveUser,
    loading,
    characters,
    selectedCharacterId,
    setSelectedCharacterId: (id: string) => {
      setSelectedCharacterId(id);
      localStorage.setItem('selectedCharacterId', id);
    },
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
