import { useDate } from '../context/DateContext';
import { useState, useRef, useEffect } from 'react';

type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';

const SEASONS: Season[] = ['Spring', 'Summer', 'Fall', 'Winter'];

export default function DatePicker() {
  const { season, day, setSeason, setDay } = useDate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') { setDay(1); return; }
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      if (numValue < 1) setDay(1);
      else if (numValue > 28) setDay(28);
      else setDay(numValue);
    }
  };

  const handleBlur = () => {
    if (day === 0) setDay(1);
  };

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2">
      {/* Custom season dropdown with PNG icons */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
        >
          <img
            src={`/seasons/${season.toLowerCase()}.png`}
            alt={season}
            className="h-4 w-4 object-contain"
          />
          <span>{season}</span>
          <svg className="h-3 w-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-32 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
            {SEASONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setSeason(s); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 ${s === season ? 'bg-gray-100 font-semibold' : ''}`}
              >
                <img
                  src={`/seasons/${s.toLowerCase()}.png`}
                  alt={s}
                  className="h-4 w-4 object-contain"
                />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        type="number"
        min="1"
        max="28"
        value={day}
        onChange={handleDayChange}
        onBlur={handleBlur}
        className="w-10 rounded border border-gray-300 px-1 py-1 text-center text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Day"
      />
      <span className="whitespace-nowrap text-sm text-gray-600">/28</span>
    </div>
  );
}
