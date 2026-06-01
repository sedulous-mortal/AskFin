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
    <>
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
        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
      >
        Load Game Files
      </button>
    </>
  );
}
