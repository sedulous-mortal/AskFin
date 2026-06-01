// Reformats data across the Supabase `critters` table <-> client boundary.
//
// The `critters` table provides (snake_case):
//   id, critter_type, subtype, habitat, active_at, description, sprite
// where `sprite` is a bare filename (e.g. "bluggy_frostberry.png") that maps to a
// local asset under the client's public/critters/ folder.
//
// Foods are NOT a column on `critters`; they come from the `critter_foods` join
// table (critter_id, forageable_id) with the related `forageables` row embedded.
// The endpoint requests: critters.select('..., critter_foods ( forageables ( * ) )').
//
// Client-facing Critter shape:
//   { id, critterType, subtype, habitat, foods: string[], activeAt, description, sprite, image }
// The display "name" (subtype + critter_type) is composed on the client.

const SPRITE_BASE_PATH = '/critters/';

// Prepends the local asset path to a bare sprite filename. Idempotent: already
// absolute paths / URLs are left untouched.
export function resolveSpritePath(sprite) {
  if (!sprite) return '';
  if (sprite.startsWith('/') || sprite.startsWith('http')) return sprite;
  return `${SPRITE_BASE_PATH}${sprite}`;
}

// Pulls a display name out of an embedded forageable row, tolerant of the exact
// column name the forageables table uses for its name.
function forageableName(forageable) {
  const row = Array.isArray(forageable) ? forageable[0] : forageable;
  if (!row || typeof row !== 'object') return null;
  return row.name ?? row.title ?? row.label ?? row.forageable_name ?? null;
}

// Flattens an embedded critter_foods array into a list of food (forageable) names.
function extractFoods(critterFoods) {
  if (!Array.isArray(critterFoods)) return [];
  return critterFoods
    .map((cf) => forageableName(cf?.forageables))
    .filter(Boolean)
    .map(String);
}

// INBOUND: a `critters` row (with embedded critter_foods) -> client-facing Critter.
export function toClientCritter(row = {}) {
  const sprite = row.sprite ?? '';
  return {
    id: row.id != null ? String(row.id) : '',
    critterType: row.critter_type ?? row.critterType ?? '',
    subtype: row.subtype ?? '',
    habitat: row.habitat ?? '',
    foods: extractFoods(row.critter_foods),
    activeAt: row.active_at ?? row.activeAt ?? '',
    description: row.description ?? '',
    sprite,
    image: resolveSpritePath(sprite),
  };
}

export function toClientCritters(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(toClientCritter);
}

// OUTBOUND: a client-facing Critter -> a row for inserting/updating `critters`.
// Foods live in the critter_foods join table and are handled separately.
export function toDbCritter(critter = {}) {
  const row = {
    critter_type: critter.critterType,
    subtype: critter.subtype,
    habitat: critter.habitat,
    active_at: critter.activeAt,
    description: critter.description,
    sprite: critter.sprite,
  };
  if (critter.id) row.id = critter.id;
  Object.keys(row).forEach((key) => row[key] === undefined && delete row[key]);
  return row;
}
