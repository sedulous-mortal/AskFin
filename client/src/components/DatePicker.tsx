import { useDate } from '../context/DateContext';

type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';

const SEASONS: Season[] = ['Spring', 'Summer', 'Fall', 'Winter'];
const SEASON_ICONS: Record<Season, string> = {
  Spring: '🌸',
  Summer: '☀️',
  Fall: '🍂',
  Winter: '❄️',
};

export default function DatePicker() {
  const { season, day, setSeason, setDay } = useDate();

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow numbers
    if (value === '') {
      setDay(1);
      return;
    }

    const numValue = parseInt(value, 10);
    
    // Clamp between 1 and 28
    if (!isNaN(numValue)) {
      if (numValue < 1) {
        setDay(1);
      } else if (numValue > 28) {
        setDay(28);
      } else {
        setDay(numValue);
      }
    }
  };

  const handleBlur = () => {
    if (day === 0) {
      setDay(1);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border border-gray-300 rounded-md bg-white">
      <select
        value={season}
        onChange={(e) => setSeason(e.target.value as Season)}
        className="px-2 py-1 text-sm font-medium text-gray-700 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
      >
        {SEASONS.map((s) => (
          <option key={s} value={s}>
            {SEASON_ICONS[s]} {s}
          </option>
        ))}
      </select>

      <input
        type="number"
        min="1"
        max="28"
        value={day}
        onChange={handleDayChange}
        onBlur={handleBlur}
        className="w-12 px-2 py-1 text-sm text-gray-700 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Day"
      />
      <span className="text-sm text-gray-600">/ 28</span>
    </div>
  );
}
