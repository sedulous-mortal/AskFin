// Reformats data across the Supabase `critters` table <-> client boundary.
//
// The `critters` table provides (snake_case):
//   id, critter_type, subtype, habitat, active_at, description, sprite
// where `sprite` is a bare filename (e.g. "bluggy_frostberry.png") that maps to a
// local asset under the client's public/critters/ folder.
//
// Foods come from the `critter_foods` junction table (critter_id, edible_id) with
// the related `edibles` row embedded. The endpoint selects:
//   critters.select('*, critter_foods ( edibles ( * ) )')
// Each edible has a `name` and an `image_path` bare filename that maps to
// the client's public/edibles/ folder.
//
// Client-facing Critter shape:
//   { id, critterType, subtype, habitat, foods: {name,image}[], activeAt, description, sprite, image }
// The display "name" (subtype + critter_type) is composed on the client.

const SPRITE_BASE_PATH = '/critters/';
const EDIBLE_IMAGE_BASE_PATH = '/edibles/';

// Prepends the local asset path to a bare sprite filename. Idempotent.
export function resolveSpritePath(sprite) {
  if (!sprite) return '';
  if (sprite.startsWith('/') || sprite.startsWith('http')) return sprite;
  return `${SPRITE_BASE_PATH}${sprite}`;
}

// Prepends the local asset path to a bare edible image_location. Idempotent.
function resolveEdibleImagePath(imageLocation) {
  if (!imageLocation) return '';
  if (imageLocation.startsWith('/') || imageLocation.startsWith('http')) return imageLocation;
  return `${EDIBLE_IMAGE_BASE_PATH}${imageLocation}`;
}

// Maps a single embedded `edibles` row to a { name, image } food object.
// Returns null if the row is missing or has no usable name.
function extractEdible(edible) {
  const row = Array.isArray(edible) ? edible[0] : edible;
  if (!row || typeof row !== 'object') return null;
  const name = row.name ?? null;
  if (!name) return null;
  return {
    name: String(name),
    image: resolveEdibleImagePath(row.image_path ?? ''),
  };
}

// Flattens an embedded critter_foods array into { name, image }[] food objects.
function extractFoods(critterFoods) {
  if (!Array.isArray(critterFoods)) return [];
  return critterFoods
    .map((cf) => extractEdible(cf?.edibles))
    .filter(Boolean);
}

// INBOUND: a `critters` row (with embedded critter_foods + edibles) -> client-facing Critter.
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
