/**
 * Diagnostic: fetch donated_museum_items for all characters, classify each ID
 * as fish / mineral / plant / other using museum_items.json and game_id_maps.json.
 *
 * Run from the server directory:
 *   node --env-file=.env helpers/classifyDonations.js
 *
 * Output:
 *   - Per-character breakdown
 *   - Aggregate list of unclassified IDs (not in any known category)
 *   - Suggested additions to museum_items.json donateMineral / donatePlant
 */

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const require = createRequire(import.meta.url);
const museumItemsFile = require('./museum_items.json');
const gameIdMaps      = require('./game_id_maps.json');

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { realtime: { transport: ws } });

const itemNames = gameIdMaps['InventoryItems_en'] || {};

const fishSet    = new Set(museumItemsFile.donateFish    || []);
const mineralSet = new Set(museumItemsFile.donateMineral || []);
const plantSet   = new Set(museumItemsFile.donatePlant   || []);

function classify(id) {
  if (fishSet.has(id))    return 'fish';
  if (mineralSet.has(id)) return 'mineral';
  if (plantSet.has(id))   return 'plant';
  return 'unknown';
}

const { data: characters, error } = await supabase
  .from('characters')
  .select('id, character_name, farm_name, donated_museum_items, donated_specimen_count');

if (error) {
  console.error('Supabase query failed:', error.message);
  process.exit(1);
}

if (!characters?.length) {
  console.log('No characters found in DB.');
  process.exit(0);
}

const unknownAgg = new Map(); // id → Set of char names that donated it

console.log(`\n${'='.repeat(70)}`);
console.log('MUSEUM DONATION CLASSIFICATION REPORT');
console.log(`${'='.repeat(70)}\n`);

for (const char of characters) {
  const donated = char.donated_museum_items || [];
  const byCategory = { fish: [], mineral: [], plant: [], unknown: [] };

  for (const id of donated) {
    const cat = classify(id);
    byCategory[cat].push(id);
    if (cat === 'unknown') {
      if (!unknownAgg.has(id)) unknownAgg.set(id, new Set());
      unknownAgg.get(id).add(char.character_name);
    }
  }

  const total = donated.length;
  const known = total - byCategory.unknown.length;

  console.log(`── ${char.character_name}${char.farm_name ? ` (${char.farm_name})` : ''}`);
  console.log(`   Total donated: ${total}  |  Classified: ${known}  |  Unknown: ${byCategory.unknown.length}`);
  console.log(`   Fish: ${byCategory.fish.length}  Mineral: ${byCategory.mineral.length}  Plant: ${byCategory.plant.length}`);

  if (byCategory.unknown.length > 0) {
    console.log('   Unclassified IDs:');
    for (const id of byCategory.unknown.sort((a, b) => a - b)) {
      const name = itemNames[id] ?? '(no name in map)';
      console.log(`     ${String(id).padStart(5)}  ${name}`);
    }
  }
  console.log('');
}

if (unknownAgg.size > 0) {
  console.log(`${'─'.repeat(70)}`);
  console.log('AGGREGATE UNCLASSIFIED IDs (across all characters)\n');
  console.log('These IDs are in donated_museum_items but not in museum_items.json.');
  console.log('Assign each to donateMineral or donatePlant in museum_items.json.\n');

  const rows = [...unknownAgg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, charSet]) => ({
      id,
      name: itemNames[id] ?? '(no name)',
      chars: [...charSet].join(', '),
    }));

  for (const row of rows) {
    console.log(`  ${String(row.id).padStart(5)}  ${row.name.padEnd(30)}  donated by: ${row.chars}`);
  }

  console.log(`\nTotal unclassified unique IDs: ${unknownAgg.size}`);
  console.log('\nUpdate server/helpers/museum_items.json with the correct arrays,');
  console.log('then re-deploy / restart the server.');
} else {
  console.log('All donated IDs are already classified. museum_items.json looks complete.');
}
