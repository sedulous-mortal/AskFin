"""
Extract costPrice from InventoryItem ScriptableObjects in Grimshire's resources.assets.

Requires:
  pip install UnityPy TypeTreeGeneratorAPI

Sell price formula (InventoryItem.cs:198): sellPrice = round(costPrice * 0.8)
With skill 874 active the sell price is * 1.05, but we store the base value here.
"""

from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
import UnityPy, json, os

GAME_DATA    = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
GAME_ID_MAPS = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"
OUTPUT_PATH  = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\item_prices.json"
LOG_PATH     = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\extract_prices_log.txt"

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

# Load name -> game_id reverse map
with open(GAME_ID_MAPS, encoding="utf-8") as f:
    raw = json.load(f)
inv_map = raw.get("InventoryItems_en", {})  # {str(game_id): name}
name_to_ids: dict[str, list[int]] = {}
for gid_str, name in inv_map.items():
    name_to_ids.setdefault(name.strip().lower(), []).append(int(gid_str))

log(f"Loaded {len(inv_map)} known item names from game_id_maps.json")

# Set up TypeTreeGenerator so UnityPy can resolve MonoBehaviour type trees from the DLL
log("Loading TypeTreeGenerator from Managed DLLs...")
gen = TypeTreeGenerator("2022.3.62f2")
gen.load_local_dll_folder(os.path.join(GAME_DATA, "Managed"))

env = UnityPy.load(os.path.join(GAME_DATA, "resources.assets"))
env.typetree_generator = gen
log("Assets loaded")

# Scan all MonoBehaviours for InventoryItem fields
found: dict[str, dict] = {}  # lowercase name -> data
count = 0
for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
    except Exception:
        continue

    if "costPrice" not in tree or "label" not in tree:
        continue

    label = tree.get("label", "").strip()
    cost  = tree.get("costPrice", 0)
    if not label:
        continue

    sell = round(cost * 0.8)
    ids  = name_to_ids.get(label.lower(), [])
    key  = label.lower()
    if key not in found:
        found[key] = {"name": label, "costPrice": cost, "sellPrice": sell, "game_ids": ids}
        count += 1

log(f"Found {count} InventoryItem entries in resources.assets")

# ---- Seed vs. raw crop comparison ----
SEED_CROPS = [
    ("Asparagus",  "Asparagus Seeds"),
    ("Carrot",     "Carrot Seeds"),
    ("Cabbage",    "Cabbage Seeds"),
    ("Radish",     "Radish Seeds"),
    ("Rhubarb",    "Rhubarb Seeds"),
    ("Onion",      "Onion Seeds"),
    ("Sunroot",    "Sunroot Seeds"),
]

log("\n=== Seed vs. Raw Crop Sell Prices ===")
log(f"{'Crop':<18} {'Crop buy':>8} {'Crop sell':>9}  |  {'Seed buy':>8} {'Seed sell':>9}  {'Seeds > Crop?':>14}")
log("-" * 80)

comparison = {}
for crop_name, seed_name in SEED_CROPS:
    crop = found.get(crop_name.lower())
    seed = found.get(seed_name.lower())

    cb = crop["costPrice"] if crop else "?"
    cs = crop["sellPrice"] if crop else "?"
    sb = seed["costPrice"] if seed else "?"
    ss = seed["sellPrice"] if seed else "?"

    if crop and seed:
        verdict = "YES" if seed["sellPrice"] > crop["sellPrice"] else (
                  "EQUAL" if seed["sellPrice"] == crop["sellPrice"] else "NO <- WRONG")
    else:
        verdict = "MISSING DATA"

    log(f"{crop_name:<18} {str(cb):>8} {str(cs):>9}  |  {str(sb):>8} {str(ss):>9}  {verdict:>14}")

    comparison[crop_name] = {
        "crop":  {"buy": cb, "sell": cs, "game_ids": crop["game_ids"]  if crop else []},
        "seeds": {"buy": sb, "sell": ss, "game_ids": seed["game_ids"]  if seed else []},
        "seeds_sell_more": (seed["sellPrice"] > crop["sellPrice"]) if (crop and seed) else None,
    }

# Save output
output = {
    "note": "sellPrice = round(costPrice * 0.8); skill 874 adds +5% on top",
    "all_items": {
        v["name"]: {"costPrice": v["costPrice"], "sellPrice": v["sellPrice"], "game_ids": v["game_ids"]}
        for v in found.values()
    },
    "seed_crop_comparison": comparison,
}
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)
log(f"\nWritten to {OUTPUT_PATH}")

with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"Log saved to {LOG_PATH}")
