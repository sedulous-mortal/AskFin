import Critters from './Critters';
import Forageables from './Forageables';
import Quests from './Quests';
import Events from './Events';

type RefTab = 'critters' | 'forageables' | 'quests' | 'events';
const REF_TAB_KEY = 'ref-active-tab';

const TABS: [RefTab, string, string, string][] = [
  ['critters',    'Critters',    'bg-rose-300 dark:bg-rose-600',     'bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/50 dark:hover:bg-rose-800/70'],
  ['forageables', 'Forageables', 'bg-lime-300 dark:bg-lime-600',     'bg-lime-100 hover:bg-lime-200 dark:bg-lime-900/50 dark:hover:bg-lime-800/70'],
  ['quests',      'Quests',      'bg-sky-300 dark:bg-sky-600',       'bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/50 dark:hover:bg-sky-800/70'],
  ['events',      'Events',      'bg-violet-300 dark:bg-violet-600', 'bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/50 dark:hover:bg-violet-800/70'],
];

function getInitialTab(): RefTab {
  const stored = sessionStorage.getItem(REF_TAB_KEY) as RefTab | null;
  return stored && TABS.some(([t]) => t === stored) ? stored : 'critters';
}

import { useState } from 'react';

export default function Ref() {
  const [activeTab, setActiveTab] = useState<RefTab>(getInitialTab);

  return (
    <div className="space-y-6">
      {/* Tab Bar */}
      <div className="flex flex-wrap gap-1.5 items-end border-b-2 border-slate-300 dark:border-slate-600">
        {TABS.map(([tab, label, activeColor, inactiveColor]) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); sessionStorage.setItem(REF_TAB_KEY, tab); }}
              className={`relative px-5 rounded-t-lg text-base font-semibold transition-all text-slate-900 dark:text-slate-100 ${
                isActive
                  ? `pt-3 pb-3 -mb-px border border-b-0 border-slate-300 dark:border-slate-500 shadow-sm z-10 ${activeColor}`
                  : `pt-2.5 pb-2 ${inactiveColor}`
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'critters'    && <Critters />}
      {activeTab === 'forageables' && <Forageables />}
      {activeTab === 'quests'      && <Quests />}
      {activeTab === 'events'      && <Events />}
    </div>
  );
}
