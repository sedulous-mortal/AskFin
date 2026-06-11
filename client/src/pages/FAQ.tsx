import { useState } from 'react';

type FaqEntry = {
  id: string;
  question: string;
  answer: React.ReactNode;
  tags?: string[];
};

const FAQ_ITEMS: FaqEntry[] = [
  {
    id: 'romance-cutscenes',
    question: "Can I trigger romance cutscenes yet?",
    tags: ['Villagers', 'Romance'],
    answer: (
      <>
        <p>
          No — romance cutscenes are not yet triggerable in the current version, but you <em>can</em> earn
          hearts and relationship points with Villagers right now, and you can practice gifting liked items.
        </p>
        <p className="mt-3">
          It's worth discovering which items are liked and disliked for both romanceable and non-romanceable
          characters — this pays off for future gameplay and for receiving gifts from villagers who have a
          strong friendship with you.
        </p>
        <p className="mt-3">
          A <span className="inline-flex items-center gap-1 font-semibold align-bottom text-[#4e718f] dark:text-[#7aaac8]">
            <img src="/items/Blue_Rose.png" alt="blue rose icon" className="h-5 w-5 object-contain inline-block" />
            blue rose
          </span> next to a character's name in the ESC menu indicates that they are (or will be) romanceable.
        </p>
        <p className="mt-3">
          At this time, the only known mechanic around romance is that if you gift a loved item to a Villager
          who is romanceable, and with whom you have sufficient relationship points, they will blush when
          receiving the gift. Additionally, their dialogue may change when gifting you items as well.
        </p>
      </>
    ),
  },
  {
    id: 'baby-animals',
    question: "Do baby animals count against my pen's capacity?",
    tags: ['Animals', 'Farm'],
    answer: (
      <>
        <p>
          Baby animals do <em>not</em> take up space in the pen — they only start counting toward capacity
          once they become adults.
        </p>
        <p className="mt-3">
          If your pen is overcrowded with adults, animals can get sick. Keep an eye on adult headcount
          relative to your pen size, especially around the time babies are due to mature. Medicinal feed can
          treat sick animals, and illness can spread between animals in the same pen, so act quickly when you
          spot a sick one.
        </p>
        <p className="mt-3 text-slate-500 dark:text-slate-400 text-base italic">
          Note: More detail on contagion between species and the exact timing of the sickness roll is
          being investigated — this entry will be updated when confirmed.
        </p>
      </>
    ),
  },
];

const TAG_COLORS: Record<string, string> = {
  Villagers: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  Romance:   'bg-rose-100   text-rose-700   dark:bg-rose-900/40   dark:text-rose-300',
  Animals:   'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300',
  Farm:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};
const TAG_COLORS_ACTIVE: Record<string, string> = {
  Villagers: 'bg-violet-500 text-white dark:bg-violet-600',
  Romance:   'bg-rose-500   text-white dark:bg-rose-600',
  Animals:   'bg-amber-500  text-white dark:bg-amber-600',
  Farm:      'bg-emerald-500 text-white dark:bg-emerald-600',
};
const DEFAULT_TAG = 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300';

const ALL_TAGS = Object.keys(TAG_COLORS).sort();

function FaqCard({ item }: { item: FaqEntry }) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`rounded-2xl border shadow-sm transition-shadow duration-200 overflow-hidden
      border-slate-200 bg-white hover:shadow-md
      dark:border-slate-700/70 dark:bg-slate-800/70 dark:hover:shadow-slate-900/40
      ${open ? 'shadow-md dark:shadow-slate-900/40' : ''}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left"
      >
        <span className="text-lg font-normal leading-snug text-slate-800 dark:text-slate-100">
          {item.question}
        </span>
        <svg
          className={`flex-none h-5 w-5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700/60 px-6 py-5 text-slate-600 dark:text-slate-300 text-base leading-relaxed">
          {item.answer}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-4">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className={`rounded-full px-3 py-0.5 text-sm font-medium ${TAG_COLORS[tag] ?? DEFAULT_TAG}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  function toggleFilter(tag: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  const visibleItems = activeFilters.size === 0
    ? FAQ_ITEMS
    : FAQ_ITEMS.filter((item) => item.tags?.some((t) => activeFilters.has(t)));

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">

      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">FAQ</h1>
        <p className="mt-2 text-base text-black dark:text-white">
          AcuteOwl-certified answers to common questions about Grimshire.
        </p>
      </div>

      {/* Community links */}
      <div className="flex flex-wrap gap-2">
        <a
          href="https://discord.gg/grimshire"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition-all duration-150
            border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm
            dark:border-indigo-700/50 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
        >
          <svg className="h-3.5 w-3.5 flex-none" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
          </svg>
          Official Discord
        </a>
        <a
          href="https://www.reddit.com/r/GrimshireGame/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition-all duration-150
            border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm
            dark:border-orange-700/40 dark:bg-orange-950/20 dark:text-orange-300 dark:hover:bg-orange-900/30"
        >
          <svg className="h-3.5 w-3.5 flex-none" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
          </svg>
          r/GrimshireGame
        </a>
      </div>

      {/* Tag filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base text-white">Filter by:</span>
        <button
          type="button"
          onClick={() => setActiveFilters(new Set())}
          className="rounded-full px-3 py-1 text-sm font-medium text-slate-700 dark:text-slate-200 transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(to right, #ddd6fe, #fecdd3, #fef3c7, #a7f3d0, #bfdbfe)' }}
        >
          All
        </button>
        {ALL_TAGS.map((tag) => {
          const active = activeFilters.has(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleFilter(tag)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                active ? (TAG_COLORS_ACTIVE[tag] ?? 'bg-slate-500 text-white') : (TAG_COLORS[tag] ?? DEFAULT_TAG)
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* FAQ list */}
      <div className="space-y-3">
        {visibleItems.length > 0 ? visibleItems.map((item) => (
          <FaqCard key={item.id} item={item} />
        )) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">No entries match the selected filters.</p>
        )}
      </div>

      <p className="text-sm text-slate-400 dark:text-slate-500">
        Have a correction or want to suggest a FAQ entry? Drop a note in the Discord.
      </p>
    </div>
  );
}
