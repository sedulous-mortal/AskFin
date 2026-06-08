import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const sampleCharacter = {
  id: 'sample',
  character_name: 'Sample Character',
  user_id: '',
  save_file_name: null as string | null,
  updated_at: null as string | null,
};

export default function CharacterSelector() {
  const { characters, selectedCharacterId, setSelectedCharacterId } = useAuth();
  const { preferences } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasCharacters = characters.length > 0;
  const options = hasCharacters ? characters : [sampleCharacter];
  const selectedId = selectedCharacterId ?? options[0].id;
  const selectedOption = options.find((c) => c.id === selectedId) ?? options[0];

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={ref} className="relative min-w-[10rem]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
      >
        <span className="flex-1 text-center">{selectedOption.character_name}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {options.map((character) => (
            <div
              key={character.id}
              onClick={() => {
                setSelectedCharacterId(character.id);
                setOpen(false);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 ${
                character.id === selectedId
                  ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-700 dark:text-slate-300'
              }`}
            >
              {/* Info icon with tooltip — only when a save_file_name exists */}
              {character.save_file_name ? (
                <div className="group relative flex-shrink-0">
                  <svg
                    className="h-4 w-4 text-gray-400 group-hover:text-slate-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 group-hover:block">
                    <div className="whitespace-nowrap rounded bg-slate-800 px-2 py-1.5 text-xs font-sans text-white">
                      <div className="font-mono">{character.save_file_name}</div>
                      {character.updated_at && (
                        <div className="mt-0.5 text-slate-400">
                          last load:{' '}
                          {new Date(character.updated_at).toLocaleString(undefined, {
                            timeZone: preferences.timezone,
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </div>
                    <div className="mx-auto h-1.5 w-1.5 rotate-45 bg-slate-800" />
                  </div>
                </div>
              ) : (
                <div className="h-4 w-4 flex-shrink-0" />
              )}
              {character.character_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
