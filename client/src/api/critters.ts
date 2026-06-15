// Client-side data access + reformatting layer for critter reference data.
//
// The server (GET /api/critters) maps Supabase `critters` rows into this shape
// via server/helpers/critterReformatter.js. We re-normalize here so the UI is
// resilient to partial/legacy rows.
//
// Display name is composed on the client as: `${subtype} ${critterType}`

// A single food/lure item. image is optional — DB foods may not have one yet,
// but custom hardcoded entries (critterCustomFoods.ts) can supply one.
export type CritterFood = {
  name: string;
  image?: string;
  locationHint?: string;
  coinCost?: number;
};

export type Critter = {
  id: string;
  critterType: string;
  subtype: string;
  habitat: string;
  foods: CritterFood[];
  activeAt: string;
  description: string;
  image: string;
};

type RawCritter = {
  id?: string | number;
  critterType?: string;
  critter_type?: string;
  subtype?: string;
  habitat?: string;
  // Server currently sends string[] from the forageables join; future: {name,image}[]
  foods?: unknown[] | string;
  activeAt?: string;
  active_at?: string;
  description?: string;
  image?: string;
  sprite?: string;
  image_url?: string;
};

function normalizeFoods(foods: unknown): CritterFood[] {
  if (Array.isArray(foods)) {
    return foods.map((f) => {
      if (f && typeof f === 'object' && 'name' in f) {
        return { name: String((f as Record<string, unknown>).name), image: (f as Record<string, unknown>).image as string | undefined };
      }
      return { name: String(f) };
    });
  }
  if (typeof foods === 'string') {
    const trimmed = foods.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((f) => ({ name: String(f) }));
      } catch {
        // not valid JSON — fall through to comma split
      }
    }
    return trimmed
      .split(',')
      .map((f) => ({ name: f.trim() }))
      .filter((f) => f.name);
  }
  return [];
}

// INBOUND: an API row -> a component-ready Critter.
export function toCritter(raw: RawCritter = {}): Critter {
  return {
    id: raw.id != null ? String(raw.id) : '',
    critterType: raw.critterType ?? raw.critter_type ?? '',
    subtype: raw.subtype ?? '',
    habitat: raw.habitat ?? '',
    foods: normalizeFoods(raw.foods),
    activeAt: raw.activeAt ?? raw.active_at ?? '',
    description: raw.description ?? '',
    image: raw.image ?? raw.image_url ?? '',
  };
}

// OUTGOING: a component Critter -> a payload for a POST/PUT to the critters API.
export function toCritterPayload(critter: Partial<Critter>): Record<string, unknown> {
  return {
    ...(critter.id ? { id: critter.id } : {}),
    critterType: critter.critterType,
    subtype: critter.subtype,
    habitat: critter.habitat,
    foods: critter.foods ?? [],
    activeAt: critter.activeAt,
    description: critter.description,
    image: critter.image,
  };
}

// Fetches all critter reference data from the server (which reads the Supabase
// `critters` table). Throws an Error with a useful message on failure.
export async function fetchCritters(signal?: AbortSignal): Promise<Critter[]> {
  const res = await fetch('/api/critters', { signal });

  if (!res.ok) {
    let message = `Failed to load critters (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response body wasn't JSON — keep the status-based message
    }
    throw new Error(message);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map(toCritter);
}
