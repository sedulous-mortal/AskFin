import { useEffect, useState } from 'react';

type Quest = {
  id: 'fetch-items' | 'provide-rations' | 'village-choice';
  title: string;
  subtitle: string;
  category: string;
  description: string;
  goal: string;
  reward: string;
};

const accentStyles: Record<Quest['id'], string> = {
  'fetch-items': 'bg-emerald-100 text-emerald-800',
  'provide-rations': 'bg-amber-100 text-amber-800',
  'village-choice': 'bg-sky-100 text-sky-800',
};

export default function Quests() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/quests')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load quests (${response.status})`);
        }
        return response.json();
      })
      .then((data: Quest[]) => {
        setQuests(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Quests</h1>
        <p className="mt-2 text-lg text-slate-700">
          Current village quests and duties awaiting your guidance.
        </p>
      </header>

      {loading ? (
        <p className="text-slate-600">Loading quests...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : quests.length === 0 ? (
        <p className="text-slate-600">No quests found.</p>
      ) : (
        <div className="space-y-6">
          {quests.map((quest) => (
            <section
              key={quest.id}
              className="overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
                <div className="bg-slate-100 p-8 flex items-center justify-center text-center">
                  <div>
                    <div
                      className={`mb-3 inline-flex rounded-full px-4 py-2 text-xs font-semibold ${accentStyles[quest.id]}`}
                    >
                      {quest.category}
                    </div>
                    <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Quest type
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">{quest.title}</h2>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${accentStyles[quest.id]}`}>
                      {quest.category}
                    </span>
                  </div>
                  <p className="mt-3 text-slate-700">{quest.subtitle}</p>
                  <p className="mt-3 text-slate-700">{quest.description}</p>
                  <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-500">Goal</dt>
                      <dd className="mt-1 text-slate-800">{quest.goal}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-500">Reward</dt>
                      <dd className="mt-1 text-slate-800">{quest.reward}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
