interface PageToggleProps {
  leftLabel: string;
  rightLabel: string;
  value: boolean; // false = left active, true = right active
  onChange: (value: boolean) => void;
}

function Checkmark() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

export function PageToggle({ leftLabel, rightLabel, value, onChange }: PageToggleProps) {
  return (
    <div className="flex select-none items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
        {!value && <Checkmark />}
        {leftLabel}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={`Toggle between ${leftLabel} and ${rightLabel}`}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
          value ? 'bg-slate-500' : 'bg-slate-400 dark:bg-slate-600'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
        {value && <Checkmark />}
        {rightLabel}
      </span>
    </div>
  );
}
