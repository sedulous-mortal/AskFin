import type { CritterFood } from '../api/critters';

// Hardcoded food/lure items appended client-side to every critter's "Tame With"
// list, regardless of what the DB returns. Use this for universal bait items or
// anything not yet tracked in the forageables / purchaseables tables.
//
// Each entry needs at minimum a `name`. Add an `image` path (relative to /public)
// once the asset exists — it will render as a small thumbnail next to the name.
//
// Future: per-critter or per-subtype overrides can be added here as a separate
// exported map keyed by critter id if universal injection isn't enough.
export const CUSTOM_CRITTER_FOODS: CritterFood[] = [
  {
    name: 'Critters Delight',
    image: '/purchaseables/Critters_Delight.png',
    locationHint: 'Purchased from Fin on Saturdays at the pier register, next to Wilfred\'s shop.',
    coinCost: 200,
  },
];
