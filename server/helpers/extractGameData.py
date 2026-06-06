import UnityPy
import json
import re

SHARED_BUNDLE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\StreamingAssets\aa\StandaloneWindows64\localization-assets-shared_assets_all.bundle"
ENGLISH_BUNDLE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\StreamingAssets\aa\StandaloneWindows64\localization-string-tables-english(en)_assets_all.bundle"
LOG_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\extract_log.txt"
OUTPUT_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

# Step 1: Load shared bundle — maps string key (e.g. "427_name") → numeric m_Id
# SharedTableData has m_Entries: [{m_Id: int, m_Key: "427_name"}, ...]
log("Loading shared bundle...")
shared_env = UnityPy.load(SHARED_BUNDLE)

# numeric_id -> string_key, per collection name
# e.g. id_to_key["InventoryItemsTable"][260246663278592] = "427_name"
id_to_key = {}  # collection_name -> {numeric_id: string_key}

for obj in shared_env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
        name = tree.get("m_Name", "")
        entries = tree.get("m_Entries", [])
        if entries and isinstance(entries, list):
            mapping = {}
            for entry in entries:
                if isinstance(entry, dict):
                    num_id = entry.get("m_Id")
                    str_key = entry.get("m_Key", "")
                    if num_id is not None and str_key:
                        mapping[num_id] = str_key
            if mapping:
                id_to_key[name] = mapping
                log(f"  Shared table '{name}': {len(mapping)} keys")
    except Exception:
        continue

log(f"Shared tables loaded: {list(id_to_key.keys())}")

# Step 2: Load English bundle — maps numeric m_Id → localized string
log("\nLoading English bundle...")
english_env = UnityPy.load(ENGLISH_BUNDLE)

# Final output: table_name -> {game_id (int): localized_name}
results = {}

for obj in english_env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
        table_name = tree.get("m_Name", "")  # e.g. "InventoryItems_en"
        table_data = tree.get("m_TableData", [])
        if not table_data or not isinstance(table_data, list):
            continue

        # Find the matching shared table (strip _en suffix, add " Shared Data")
        base_name = re.sub(r"_en$", "", table_name)  # "InventoryItems_en" -> "InventoryItems"
        shared = id_to_key.get(base_name + " Shared Data")

        game_id_map = {}
        for entry in table_data:
            if not isinstance(entry, dict):
                continue
            num_id = entry.get("m_Id")
            localized = entry.get("m_Localized", "")
            if num_id is None or not localized:
                continue

            if shared:
                str_key = shared.get(num_id, "")
                # Keys are like "427_name", "427_description" — we only want _name
                m = re.match(r"^(\d+)_name$", str_key)
                if m:
                    game_id_map[int(m.group(1))] = localized
            else:
                # No shared table found — store raw numeric id as fallback
                game_id_map[str(num_id)] = localized

        if game_id_map:
            results[table_name] = game_id_map
            log(f"  Table '{table_name}': {len(game_id_map)} named entries")

    except Exception:
        continue

log(f"\nTotal tables with data: {len(results)}")
log(f"Table names: {list(results.keys())}")

# Show a few sample entries from InventoryItems if present
for key in results:
    if "Inventor" in key or "Fish" in key or "Critter" in key:
        sample = dict(list(results[key].items())[:5])
        log(f"\nSample from '{key}': {json.dumps(sample, ensure_ascii=False)}")

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
log(f"\nWritten to {OUTPUT_PATH}")

with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"Log saved to {LOG_PATH}")
