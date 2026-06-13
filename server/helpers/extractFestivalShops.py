"""
Extract festival shop item pools from resources.assets by parsing raw binary.

StoreStockProfile layout (after standard 28-byte MonoBehaviour header + m_Name string):
  itemsList: [count:4] then N * [fileID:4, pathID:8, minAmount:4, maxAmount:4, itemTier:4]
  storeType:        int32  (12=Flower, 13=Shedding, 14=Harvest, 15=NewYears)
  basicItemCredits: int32
  goodItemCredits:  int32
  rareItemCredits:  int32
  OffsetStockByAWeek: bool (1 byte + 3 padding)

InventoryItem m_Name is read from the same fixed-offset header.
The game item id field sits right after m_Name — at exactly offset 32 when name="" (our approach:
we use the m_Name (asset name) as the fallback, and look it up in game_id_maps.json).
"""
import UnityPy
import struct
import json

RESOURCES = r'C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets'
GAME_ID_MAPS_PATH = r'C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json'
OUTPUT_PATH = r'C:\Users\ansob\claude-tests\AskFin\server\helpers\festival_shops.json'

FESTIVAL_SHOP_TYPES = {
    12: "Flower Festival",
    13: "Shedding Festival",
    14: "Harvest Festival",
    15: "New Years Festival",
}
TIER_NAMES = {0: "Basic", 1: "Good", 2: "Rare"}

# Load item name/id maps
with open(GAME_ID_MAPS_PATH, encoding='utf-8') as f:
    game_id_maps = json.load(f)
id_to_name = {int(k): v for k, v in game_id_maps.get('InventoryItems_en', {}).items()}

# Build asset_name -> game_id reverse map by scanning localization keys
# Key format in shared table: "{game_id}_name"
name_to_id: dict[str, int] = {}
for gid, gname in id_to_name.items():
    # Normalise: 'Flower Seeds' -> 'Flower_Seeds' (Unity asset names use underscores)
    asset_key = gname.replace(' ', '_')
    name_to_id[asset_key] = gid
    name_to_id[gname] = gid  # also keep spaced version

print("Loading resources.assets...")
env = UnityPy.load(RESOURCES)

# Collect raw bytes for every MonoBehaviour, keyed by path_id
print("Reading raw MonoBehaviour data...")
pid_to_raw: dict[int, bytes] = {}
for obj in env.objects:
    if obj.type.name != 'MonoBehaviour':
        continue
    try:
        pid_to_raw[obj.path_id] = obj.get_raw_data()
    except Exception:
        pass
print(f"  {len(pid_to_raw)} objects loaded")


def read_unity_string(data: bytes, offset: int) -> tuple[str, int]:
    """Read a Unity-serialised string (4-byte length + chars + alignment padding).
    Returns (string, next_offset)."""
    length = struct.unpack_from('<i', data, offset)[0]
    offset += 4
    text = data[offset:offset + length].decode('utf-8', errors='replace')
    offset += length
    # align to 4-byte boundary
    remainder = (length) % 4
    if remainder:
        offset += 4 - remainder
    return text, offset


def get_mb_name(raw: bytes) -> str:
    """Extract m_Name from a MonoBehaviour's raw serialised data.
    Header layout: m_GameObject(12) + m_Enabled(4) + m_Script(12) = 28 bytes, then m_Name string."""
    if len(raw) < 32:
        return ''
    try:
        name, _ = read_unity_string(raw, 28)
        return name
    except Exception:
        return ''


# Index all MonoBehaviours by m_Name
print("Indexing by m_Name...")
name_to_pids: dict[str, list[int]] = {}
for pid, raw in pid_to_raw.items():
    name = get_mb_name(raw)
    if name:
        name_to_pids.setdefault(name, []).append(pid)

print(f"  Named objects: {len(name_to_pids)}")

# Verify we can find festival shop objects
for target in ('FlowerFestivalStock', 'SheddingFestivalStock', 'HarvestFestivalStock', 'NewYearsFestivalStock'):
    pids = name_to_pids.get(target, [])
    print(f"  {target}: path_ids = {pids}")

if not any(name_to_pids.get(n) for n in ('FlowerFestivalStock', 'SheddingFestivalStock', 'HarvestFestivalStock')):
    # Debug: show all named objects
    print("\nAll named MonoBehaviours:")
    for n, pids in sorted(name_to_pids.items())[:60]:
        print(f"  {n!r}: {pids}")
    raise SystemExit("Could not find festival shop objects by name.")


def parse_store_stock_profile(raw: bytes) -> dict | None:
    """Parse a StoreStockProfile from its raw MonoBehaviour bytes."""
    name, offset = read_unity_string(raw, 28)

    # Read itemsList
    count = struct.unpack_from('<i', raw, offset)[0]
    offset += 4

    items = []
    for _ in range(count):
        file_id, path_id = struct.unpack_from('<iq', raw, offset)  # int32 + int64
        offset += 12
        min_amt, max_amt, tier = struct.unpack_from('<iii', raw, offset)
        offset += 12
        items.append({'file_id': file_id, 'path_id': path_id,
                      'min_amount': min_amt, 'max_amount': max_amt, 'tier': tier})

    store_type, basic_credits, good_credits, rare_credits = struct.unpack_from('<iiii', raw, offset)
    return {
        'name': name,
        'store_type': store_type,
        'basic_credits': basic_credits,
        'good_credits': good_credits,
        'rare_credits': rare_credits,
        'raw_items': items,
    }


results = {}

shop_asset_names = [
    'FlowerFestivalStock',
    'SheddingFestivalStock',
    'HarvestFestivalStock',
    'NewYearsFestivalStock',
]

for asset_name in shop_asset_names:
    pids = name_to_pids.get(asset_name, [])
    if not pids:
        continue
    raw = pid_to_raw[pids[0]]
    profile = parse_store_stock_profile(raw)
    if not profile:
        continue

    store_type = profile['store_type']
    festival_name = FESTIVAL_SHOP_TYPES.get(store_type, f'ShopType{store_type}')

    print(f"\n=== {festival_name} (storeType={store_type}) ===")
    print(f"  Credits — Basic: {profile['basic_credits']}, Good: {profile['good_credits']}, Rare: {profile['rare_credits']}")

    items = []
    for raw_item in profile['raw_items']:
        pid = raw_item['path_id']
        tier_label = TIER_NAMES.get(raw_item['tier'], str(raw_item['tier']))

        # Resolve item name from the InventoryItem's m_Name
        item_asset_name = ''
        game_id = None
        if pid in pid_to_raw:
            item_asset_name = get_mb_name(pid_to_raw[pid])
            # Look up game ID from asset name
            game_id = name_to_id.get(item_asset_name) or name_to_id.get(item_asset_name.replace('_', ' '))

        display_name = id_to_name.get(game_id, item_asset_name) if game_id else item_asset_name

        entry = {
            'id': game_id,
            'name': display_name,
            'asset_name': item_asset_name,
            'tier': tier_label,
            'min_amount': raw_item['min_amount'],
            'max_amount': raw_item['max_amount'],
        }
        items.append(entry)
        print(f"  [{tier_label:5}] {display_name!r:35} (asset={item_asset_name!r}, id={game_id}, min={raw_item['min_amount']}, max={raw_item['max_amount']})")

    results[festival_name] = {
        'shop_type_id': store_type,
        'credit_budget': {
            'basic': profile['basic_credits'],
            'good': profile['good_credits'],
            'rare': profile['rare_credits'],
        },
        'items': sorted(items, key=lambda x: (x['tier'], x.get('name', ''))),
    }

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(f"\nWritten to {OUTPUT_PATH}")
