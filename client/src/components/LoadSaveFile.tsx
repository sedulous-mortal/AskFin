import { useRef, ChangeEvent } from 'react';

export default function LoadSaveFile() {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileNames = Array.from(files).map((file) => file.name);
      console.log('Selected game files:', fileNames);
    }
    // Reset so selecting the same file(s) again still fires onChange.
    event.target.value = '';
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleClick}
        className="rounded-lg bg-[#5c9a30] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6aae36] active:bg-[#4e8228]"
      >
        Load Files
      </button>

      {/* Info icon with tooltip */}
      <div className="group relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 cursor-help text-slate-400 hover:text-slate-200 transition-colors"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>

        <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-72 rounded-lg bg-slate-800 p-3 text-xs leading-relaxed text-slate-200 shadow-xl group-hover:block">
          <p>
            Click <strong>Load Files</strong> to upload your <code className="rounded bg-slate-900 px-1 py-0.5 text-slate-300">.grimshire</code> save files and load your game data into AskFin.
          </p>
          <p className="mt-2 text-slate-400">Your save files are typically located at:</p>
          <code className="mt-1 block break-all rounded bg-slate-900 px-2 py-1.5 text-slate-300">
            C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\
          </code>
        </div>
      </div>
    </div>
  );
}
