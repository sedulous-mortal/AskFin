export default function Donations() {
  return (
    <div className="space-y-8">

      {/* Earliest Completion */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Earliest Possible Museum Completion
        </h2>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-16 py-8 space-y-4 text-lg">

        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          The theoretical minimum to complete all donations is{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400">Year 1, Winter 6</span>
          {' '}— the day Juniper Berries first appear. Everything else can be obtained before that date,
          assuming you catch Atlantic Salmon within its narrow Fall window and have access to the Mountain Mine.
        </p>

        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          Fish and forageables whose seasons carry over from the previous year (e.g. start in Winter,
          end in Spring) are already in-season on Day 1 of the game, so they aren't the bottleneck.
          The items below are the last three to first become available in Year 1.
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-lg">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-left">
                <th className="px-4 py-3 font-semibold">Item</th>
                <th className="px-4 py-3 font-semibold">First Available</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              <tr className="bg-white dark:bg-slate-900">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                      Fish
                    </span>
                    Atlantic Salmon
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Fall 27</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                  <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 mr-1.5">
                    Rare
                  </span>
                  Window closes Winter 3 —{' '}
                  <span className="font-semibold text-rose-600 dark:text-rose-400">only 5 days</span>
                </td>
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                      Fish
                    </span>
                    Common Bream
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Fall 26</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                  <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 mr-1.5">
                    Common
                  </span>
                  Window Fall 26–Winter 28
                </td>
              </tr>
              <tr className="bg-white dark:bg-slate-900">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300">
                      Forage
                    </span>
                    Juniper Berries
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-amber-700 dark:text-amber-400">Winter 6</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                  Window Winter 6–20 — the overall binding item
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-4 py-3 space-y-2">
          <p className="text-lg font-semibold text-amber-800 dark:text-amber-300">Caveats</p>
          <ul className="text-lg text-amber-900 dark:text-amber-200 space-y-1 list-disc list-inside">
            <li>
              Atlantic Salmon is{' '}
              <span className="font-semibold">Rare</span> with only a 5-day window (Fall 27–Winter 3).
              Missing it means waiting until <span className="font-semibold">Fall 27 of Year 2</span>.
            </li>
            <li>
              The Mountain Mine (Gold Ore, Marble, Mithril, Amethyst, Diamond, Obsidian, Ice Chunk,
              Ice Gem) requires a Titanium Pickaxe. If that progression pushes past Winter 6, it becomes
              the true bottleneck instead.
            </li>
          </ul>
        </div>

        </div>{/* end info box */}
      </section>

    </div>
  );
}
