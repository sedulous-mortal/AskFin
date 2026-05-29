import crittersData from '../data/critters.json';

type Critter = {
  id: string;
  name: string;
  type: string;
  habitat: string;
  foods: string[];
  activeAt: string;
  description: string;
  image: string;
};

const critters = crittersData as Critter[];

// const rarityStyles: Record<Critter['type'], string> = {
//   Common: 'bg-stone-100 text-stone-700',
//   Uncommon: 'bg-emerald-100 text-emerald-800',
//   Rare: 'bg-amber-100 text-amber-800',
// };

export default function Critters() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Critters</h1>
        <p className="mt-2 text-lg text-slate-700">
          Field notes on the small creatures of Grimshire.
        </p>
      </header>

      <div className="space-y-6">
        {critters.map((critter) => (
          <section
            key={critter.type +critter.name}
            className="overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="grid grid-cols-24 md:grid-cols-[260px_1fr]">
              
              <div className="col-span-3 p-6">
                <div className="col-span-12"></div>
                <img
                  src={critter.image}
                  alt={`${critter.name} placeholder`}
                  className="col-span-12"
                />
              </div>
              
              <div className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-bold text-slate-900">{critter.type} {critter.name}</h2>
                  {/* <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rarityStyles[critter.type]}`}>
                    {critter.type}
                  </span> */}
                  </div>
                  <dl className="gap-3 text-sm sm:grid-cols-3">
                   <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-500">Tame With</dt>
                      <dd className="mt-1 text-slate-800">{critter.foods.join(', ')}</dd>
                    </div>
                  </dl>
                
                
                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-500">Habitat</dt>
                    <dd className="mt-1 text-slate-800">{critter.habitat}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-500">Active</dt>
                    <dd className="mt-1 text-slate-800">{critter.activeAt}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-slate-700">{critter.description}</p>
              </div>
            </div>
            <div className="p-6 rounded-tl-2x2 border-t border-slate-900/10 bg-slate-300">
              <p className="text-xl font-semibold text-slate-900 object-cover">
                {critter.name} Variants
              </p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
