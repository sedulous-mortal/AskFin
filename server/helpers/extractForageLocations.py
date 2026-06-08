"""
Extract forageable-to-location mappings from Grimshire level files.

Fruits (Pear, Cherry, Apple, Plum, Rosehip, Raspberry, Blackberry, Elderberry,
Wintergreen Berry) do NOT use ForageableSpawnArea - they appear to use fixed tree/
bush objects. Their locations will be left blank (to fill in manually).

ForageableSpawnArea-based items are identified by CropData asset name.
"""

import json, os, struct

GAME_DATA        = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
RESOURCES_ASSETS = os.path.join(GAME_DATA, "resources.assets")
OUTPUT_PATH      = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\forage_locations.json"
LOG_PATH         = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\forage_locations_log.txt"

import UnityPy

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

FSA_SCRIPT_PID  = 445   # ForageableSpawnArea
CROP_SCRIPT_PID = 932   # CropData

# CropData asset name (lowercase, stripped of _data/_Data suffix) -> item_id
# Covers the 17 ground-forageable items that use ForageableSpawnArea
CROP_NAME_TO_ITEM_ID = {
    "dandelion":       36,
    "cattail":         162,
    "fiddlehead":      165,
    "ramp":            166,
    "morel":           169,
    "oystermushroom":  244,
    "wintergreenberry":304,   # if found
    "chamomile":       309,
    "chantarelle":     312,   # note game uses this spelling
    "chanterelle":     312,
    "wintershroom":    314,
    "ginger":          316,
    "chicory":         318,
    "redclover":       328,
    "yarrow":          331,
    "cranberry":       335,
    "pepperwort":      336,   # both Pepperwort and PepperwortLeaves map here first
    "pepperwortleaves":338,
    "redsorrel":       340,
    # farmables that share names but are NOT forageables — exclude:
    # asparagus, bean, bellpepper, cabbage, cantaloupe, carrot, corn, cucumber
    # hayglass, lavender, mint, oats, onion, peanut, potato, pumpkin, radish
    # rhubarb, strawberry, sunflower, sunroot, daylily
}

def name_to_id(asset_name):
    """Strip _data/_Data suffix and look up. Returns None if not a target forageable."""
    n = asset_name.lower()
    for suffix in ("_data", "-data"):
        if n.endswith(suffix):
            n = n[:-len(suffix)]
    n = n.replace("_", "").replace("-", "").replace(" ", "")
    return CROP_NAME_TO_ITEM_ID.get(n)

# Scene byte-string indicators (first match wins — order matters).
# Derived from GameObject names unique to each scene:
#   Forest:     DoorToDeepForest (Forest connects TO Deep Woods)
#   Marsh:      FishAreaMarsh (coastal marsh fishing)
#   Deep Woods: AmbientMarsh (damp forest, frog sounds) but NOT FishAreaMarsh
#   Mountains:  DoorToForest (exits to Forest, no other match)
SCENE_SUBSTRINGS = [
    (b"DoorToDeepForest", "Forest"),
    (b"FishAreaMarsh",    "Marsh"),
    (b"AmbientMarsh",     "Deep Woods"),
    (b"DoorToForest",     "Mountains"),
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_mb_raw(obj):
    try:
        r = obj.reader; r.Position = obj.byte_start
        return bytes(r.read_bytes(obj.byte_size))
    except Exception:
        return None

def read_pptr(raw, offset):
    if offset + 12 > len(raw): return None, None, offset
    return struct.unpack_from("<i", raw, offset)[0], struct.unpack_from("<q", raw, offset+4)[0], offset+12

def read_int32(raw, offset):
    if offset + 4 > len(raw): return None, offset
    return struct.unpack_from("<i", raw, offset)[0], offset + 4

def read_float(raw, offset):
    if offset + 4 > len(raw): return None, offset
    return struct.unpack_from("<f", raw, offset)[0], offset + 4

def fields_start(raw):
    if len(raw) < 32: return None
    nlen = struct.unpack_from("<I", raw, 28)[0]
    if nlen > 4096: return None
    return 32 + nlen + (4 - nlen % 4) % 4

def script_pid(raw):
    return struct.unpack_from("<q", raw, 20)[0] if len(raw) >= 28 else None

def script_fid(raw):
    return struct.unpack_from("<i", raw, 16)[0] if len(raw) >= 20 else None

# ── Step 1: Map CropData path_id -> item_id via asset name ────────────────────
log("=== Step 1: Map CropData path_ids from resources.assets ===")
res_env = UnityPy.load(RESOURCES_ASSETS)
all_res_objs = list(res_env.objects)
log(f"Loaded {len(all_res_objs)} objects")

crop_to_item_id = {}  # path_id -> item_id

for obj in all_res_objs:
    if obj.type.name != "MonoBehaviour": continue
    raw = get_mb_raw(obj)
    if not raw: continue
    if script_fid(raw) != 1 or script_pid(raw) != CROP_SCRIPT_PID: continue
    nlen = struct.unpack_from("<I", raw, 28)[0] if len(raw) >= 32 else 0
    if nlen == 0 or nlen > 200: continue
    asset_name = raw[32:32+nlen].decode("utf-8", "replace")
    item_id = name_to_id(asset_name)
    if item_id:
        crop_to_item_id[obj.path_id] = item_id
        log(f"  path_id={obj.path_id} {asset_name!r} -> item_id={item_id}")

log(f"\nMapped {len(crop_to_item_id)} CropData -> item_id entries")
mapped_ids = set(crop_to_item_id.values())
log(f"Item IDs covered: {sorted(mapped_ids)}")

# ── Step 2: Build level -> resources.assets fileID map ────────────────────────
def get_resources_fid(level_idx):
    level_path = os.path.join(GAME_DATA, f"level{level_idx}")
    if not os.path.exists(level_path): return None
    try:
        env = UnityPy.load(level_path)
        for af in env.files.values():
            if af.name == f"level{level_idx}":
                for i, ext in enumerate(getattr(af, "externals", []), 1):
                    if "resources.assets" in str(ext):
                        return i
    except Exception:
        pass
    return 4  # fallback

# ── Step 3: Detect scene app name from raw bytes ──────────────────────────────
def detect_scene(level_path):
    with open(level_path, "rb") as f:
        data = f.read()
    for bkw, app_name in SCENE_SUBSTRINGS:
        if bkw in data:
            return app_name
    return None

# Also try to find scene by looking at what other scenes share FSA-heavy content
# Additional heuristic: levels with 0 FSA but some common substring patterns

# ── Step 4: Scan level files ───────────────────────────────────────────────────
log("\n=== Step 4: Scan level files for ForageableSpawnArea ===")
forage_locations = {}  # item_id -> set of app location names

for i in range(33):
    level_path = os.path.join(GAME_DATA, f"level{i}")
    if not os.path.exists(level_path): continue

    try:
        level_env = UnityPy.load(level_path)
    except Exception as e:
        log(f"  level{i}: load failed - {e}")
        continue

    app_scene = detect_scene(level_path)
    resources_fid = get_resources_fid(i)

    fsa_count = 0
    level_items = set()
    unresolved_pids = set()

    for obj in level_env.objects:
        if obj.type.name != "MonoBehaviour": continue
        raw = get_mb_raw(obj)
        if not raw: continue
        if script_fid(raw) != 1 or script_pid(raw) != FSA_SCRIPT_PID: continue

        off = fields_start(raw)
        if off is None: continue

        try:
            area_id, off = read_int32(raw, off)
            _, off = read_int32(raw, off)    # startingCredits
            _, off = read_int32(raw, off)    # maxCredits
            _, off = read_int32(raw, off)    # maxCrops
            _, off = read_float(raw, off)    # accrualRate
            off += 16                         # gizmoColor
            crop_count, off = read_int32(raw, off)

            if crop_count is None or crop_count <= 0 or crop_count > 200: continue
            if off + crop_count * 12 > len(raw): continue

            fsa_count += 1

            for _ in range(crop_count):
                c_fid, c_pid, off = read_pptr(raw, off)
                if c_fid == resources_fid:
                    item_id = crop_to_item_id.get(c_pid)
                    if item_id:
                        level_items.add(item_id)
                    else:
                        unresolved_pids.add(c_pid)

        except Exception:
            continue

    if fsa_count > 0:
        log(f"  level{i}: {fsa_count} FSA(s) scene={app_scene!r}")
        log(f"    items found: {sorted(level_items)}")
        if unresolved_pids:
            log(f"    unresolved crop PIDs: {sorted(unresolved_pids)}")
        for item_id in level_items:
            if item_id not in forage_locations:
                forage_locations[item_id] = set()
            if app_scene:
                forage_locations[item_id].add(app_scene)
            else:
                forage_locations[item_id].add(f"UNKNOWN_level{i}")

# ── Summary ────────────────────────────────────────────────────────────────────
log("\n=== Summary ===")
for item_id, locs in sorted(forage_locations.items()):
    log(f"  {item_id}: {sorted(locs)}")

all_fsa_items = set(crop_to_item_id.values())
missing_from_levels = all_fsa_items - set(forage_locations.keys())
log(f"\nFSA-type forageables not found in any level: {sorted(missing_from_levels)}")

fruit_items = {277, 278, 283, 288, 301, 302, 303, 304, 305}
log(f"Fruit/berry items (fixed objects, not FSA): {sorted(fruit_items)}")
log("  -> These need manual location verification in-game")

output = {str(k): sorted(v) for k, v in forage_locations.items()}
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2)
log(f"\nWritten to {OUTPUT_PATH}")

with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"Log saved to {LOG_PATH}")
