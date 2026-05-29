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
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          setUser(sessionData.session.user);
          await fetchCharacters(sessionData.session.user.id);
        }
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        await fetchCharacters(session.user.id);
      } else {
        setCharacters([]);
        setSelectedCharacterId(null);
      }
    });

    return () => {
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

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCharacters([]);
    setSelectedCharacterId(null);
    localStorage.removeItem('selectedCharacterId');
  };

  const value: AuthContextType = {
    user,
    loading,
    characters,
    selectedCharacterId,
    setSelectedCharacterId: (id: string) => {
      setSelectedCharacterId(id);
      localStorage.setItem('selectedCharacterId', id);
    },
    logout,
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
