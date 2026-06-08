import { useState } from 'react';

function storageKey(questId: number) {
  return `askfin_event_outcome_${questId}`;
}

interface Props {
  questId: number;
  synopsis: string;
}

export function SpoilerOutcome({ questId, synopsis }: Props) {
  const [revealed, setRevealed] = useState(() => {
    try {
      return localStorage.getItem(storageKey(questId)) === 'true';
    } catch {
      return false;
    }
  });
  const [modalOpen, setModalOpen] = useState(false);

  const handleReveal = () => {
    setRevealed(true);
    try {
      localStorage.setItem(storageKey(questId), 'true');
    } catch {
      // localStorage unavailable — reveal for this session only
    }
    setModalOpen(false);
  };

  const handleHide = () => {
    setRevealed(false);
    try {
      localStorage.removeItem(storageKey(questId));
    } catch {
      // ignore
    }
  };

  if (revealed) {
    return (
      <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
        <div className="flex items-stretch justify-between gap-3">
          <p>
            <span className="font-semibold">Outcome: </span>
            {synopsis}
          </p>
          <button
            type="button"
            onClick={handleHide}
            className="shrink-0 self-stretch flex items-center rounded border border-yellow-200 bg-yellow-50 px-2 text-xs font-semibold uppercase tracking-wide text-yellow-700 transition-colors hover:border-yellow-300 hover:bg-yellow-100 dark:border-yellow-700/50 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40"
          >
            Hide<br />This
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:border-red-500/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-current" />
        <span className="font-medium">SPOILER! Show outcome of this choice.</span>
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl bg-white shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Are you sure?
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                This will reveal the outcome of choosing this option. Once shown, it won't ask again.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                No, nevermind
              </button>
              <button
                type="button"
                onClick={handleReveal}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Yes, show me
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
