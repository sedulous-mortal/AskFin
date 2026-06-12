"""
Extract EquippableTool upgrade requirements from Grimshire's asset bundles.
Reads requiredMaterials[tier].{item, amount} for each tool ScriptableObject.
Output: server/helpers/tool_upgrade_data.json
"""
import UnityPy
import json
import os

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
OUTPUT_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\tool_upgrade_data.json"

# Load the item name map from game_id_maps.json so we can resolve item IDs to names.
MAPS_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"
with open(MAPS_PATH, encoding="utf-8") as f:
    id_maps = json.load(f)
item_names = id_maps.get("InventoryItems_en", {})
# Keys may be ints or strings depending on extraction; normalise to str
item_names = {str(k): v for k, v in item_names.items()}

def item_name_for_id(item_id):
    return item_names.get(str(item_id), f"item_{item_id}")

# Asset files to scan (resources.assets + all sharedassets*)
asset_files = ["resources.assets"]
for name in os.listdir(GAME_DATA):
    if name.startswith("sharedassets") and name.endswith(".assets"):
        asset_files.append(name)

results = {}
item_id_map = {}  # pathID -> item game ID (populated as we find InventoryItems)

print(f"Scanning {len(asset_files)} asset files...")

for fname in asset_files:
    fpath = os.path.join(GAME_DATA, fname)
    if not os.path.exists(fpath):
        continue
    try:
        env = UnityPy.load(fpath)
    except Exception as e:
        print(f"  Skipping {fname}: {e}")
        continue

    found_tools = False
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:
            continue

        tool_name = tree.get("toolName", "")
        required = tree.get("requiredMaterials", None)

        # Also catalogue InventoryItem IDs so we can resolve item references
        item_id = tree.get("ID", None) or tree.get("id", None)
        if item_id and obj.path_id:
            item_id_map[obj.path_id] = item_id

        if tool_name and required is not None:
            found_tools = True
            tiers = []
            if isinstance(required, list):
                for mat in required:
                    if isinstance(mat, dict):
                        amt = mat.get("amount", mat.get("Amount", 0))
                        item_ref = mat.get("item", {})
                        # item_ref is a PPtr: {"m_FileID": 0, "m_PathID": <int>}
                        item_path_id = None
                        if isinstance(item_ref, dict):
                            item_path_id = item_ref.get("m_PathID")
                        tiers.append({
                            "amount": amt,
                            "item_path_id": item_path_id,
                        })
            results[tool_name] = {
                "source_file": fname,
                "tiers": tiers,
            }
            print(f"  Found tool '{tool_name}' with {len(tiers)} tier(s) in {fname}")

    if found_tools:
        print(f"  -> processed {fname}")

# Second pass: resolve item path IDs to names using the item_id_map we built
print(f"\nResolving {len(item_id_map)} item path IDs...")
for tool_name, data in results.items():
    for tier in data["tiers"]:
        pid = tier.get("item_path_id")
        if pid is not None:
            game_item_id = item_id_map.get(pid)
            if game_item_id:
                tier["item_id"] = game_item_id
                tier["item_name"] = item_name_for_id(game_item_id)
            else:
                tier["item_id"] = None
                tier["item_name"] = f"unresolved_pathid_{pid}"
        del tier["item_path_id"]

print(f"\nExtracted {len(results)} tool(s):")
for tool_name, data in results.items():
    print(f"  {tool_name}:")
    for i, tier in enumerate(data["tiers"]):
        print(f"    Tier {i} -> {tier}")

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(f"\nWritten to {OUTPUT_PATH}")
