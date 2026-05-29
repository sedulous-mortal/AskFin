import { createContext, useContext, useState, ReactNode } from 'react';

type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';

interface DateContextType {
  season: Season;
  day: number;
  setSeason: (season: Season) => void;
  setDay: (day: number) => void;
  getCurrentDateString: () => string;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

const SEASONS: Season[] = ['Spring', 'Summer', 'Fall', 'Winter'];
const SEASON_ICONS: Record<Season, string> = {
  Spring: '🌸',
  Summer: '☀️',
  Fall: '🍂',
  Winter: '❄️',
};

export function DateProvider({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState<Season>('Spring');
  const [day, setDay] = useState<number>(1);

  const getCurrentDateString = () => `${season} ${day}`;

  const value: DateContextType = {
    season,
    day,
    setSeason,
    setDay,
    getCurrentDateString,
  };

  return <DateContext.Provider value={value}>{children}</DateContext.Provider>;
}

export function useDate() {
  const context = useContext(DateContext);
  if (!context) {
    throw new Error('useDate must be used within DateProvider');
  }
  return context;
}
