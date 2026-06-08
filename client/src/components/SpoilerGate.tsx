import { Link } from 'react-router-dom';

export function SpoilerGate({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center dark:border-amber-700/50 dark:bg-amber-900/20">
      <p className="font-sans text-sm font-medium text-amber-800 dark:text-amber-300">
        {label} are hidden by your spoiler settings.
      </p>
      <Link
        to="/settings"
        className="font-sans mt-2 inline-block text-sm text-amber-600 underline hover:text-amber-700 dark:text-amber-400"
      >
        Change spoiler settings
      </Link>
    </div>
  );
}
