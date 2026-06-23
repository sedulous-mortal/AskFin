"""
Probe v6: resolve m_Script by class name to find StoreStockProfile and InventoryItem.
"""
import UnityPy
import os

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"

SHOP_TYPES = [
    "GeneralStore", "Trader", "Blacksmith", "Furniture", "Herbalist",
    "Ranch", "Trapper", "Baker", "Fisher", "Carpenter", "Artist", "Tavern",
    "FlowerFestival", "SheddingFestival", "HarvestFestival", "NewYearsFestival",
]

print("Loading full game data directory...")
env = UnityPy.load(GAME_DATA)

store_profiles = []
inv_items = []
errors = 0
total = 0

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    total += 1
    try:
        raw = obj.read()
        script_ref = getattr(raw, "m_Script", None)
        if script_ref is None:
            continue
        try:
            script_obj = script_ref.read()
            cname = getattr(script_obj, "m_ClassName", "")
        except Exception:
            continue

        if cname == "StoreStockProfile":
            name = getattr(raw, "m_Name", "")
            print(f"\nStoreStockProfile: path_id={obj.path_id} name={name!r}")
            try:
                tree = obj.read_typetree()
                print(f"  typetree keys: {list(tree.keys())}")
                store_profiles.append({"name": name, "tree": tree})
            except Exception as e:
                print(f"  typetree failed: {e}")
                # Print raw attributes
                attrs = {a: getattr(raw, a, None) for a in dir(raw) if not a.startswith("_") and not callable(getattr(raw, a, None))}
                print(f"  raw attrs: {list(attrs.keys())}")

        elif cname == "InventoryItem":
            name = getattr(raw, "m_Name", "")
            inv_items.append({"path_id": obj.path_id, "name": name, "raw": raw})
            if len(inv_items) <= 3:
                print(f"InventoryItem: path_id={obj.path_id} name={name!r}")
                try:
                    tree = obj.read_typetree()
                    print(f"  typetree keys: {list(tree.keys())}")
                except Exception as e:
                    attrs = {a: getattr(raw, a, None) for a in dir(raw) if not a.startswith("_") and not callable(getattr(raw, a, None))}
                    print(f"  raw attrs: {list(attrs.keys())}")
    except Exception:
        errors += 1

print(f"\nScanned: {total} MonoBehaviours, {errors} errors")
print(f"Found: {len(store_profiles)} StoreStockProfile, {len(inv_items)} InventoryItem")
