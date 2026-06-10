"""
Extract all inventory item sprites from Atlas_InventoryItems in resources.assets.
Outputs PNG files named by their internal sprite name, plus a mapping JSON
from internal sprite name -> game item display name (where known).

Usage: python extract_icons.py
Output: server/helpers/extracted_sprites/  (raw sprites named by internal name)
        server/helpers/sprite_to_item.json (mapping file)
"""
import UnityPy
import json
import os
from PIL import Image

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
RESOURCES = GAME_DATA + r"\resources.assets"
GAME_ID_MAPS = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"
OUTPUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\extracted_sprites"
MAPPING_OUT = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\sprite_to_item.json"

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Loading resources.assets...")
env = UnityPy.load(RESOURCES)

# Build a map of path_id -> object for fast lookup
objects_by_id = {obj.path_id: obj for obj in env.objects}

# Find Atlas_InventoryItems
atlas_tree = None
atlas_path_id = None
for obj in env.objects:
    if obj.type.name == "SpriteAtlas":
        tree = obj.read_typetree()
        if tree.get("m_Name") == "Atlas_InventoryItems":
            atlas_tree = tree
            atlas_path_id = obj.path_id
            break

if not atlas_tree:
    print("ERROR: Atlas_InventoryItems not found!")
    exit(1)

print(f"Found Atlas_InventoryItems (path_id={atlas_path_id})")

# m_PackedSprites: list of PPtr {m_FileID, m_PathID} pointing to Sprite objects
packed = atlas_tree.get("m_PackedSprites", [])
names = atlas_tree.get("m_PackedSpriteNamesToIndex", [])
print(f"Packed sprites: {len(packed)}, names: {len(names)}")

# Extract each sprite
extracted = {}  # sprite_name -> output_path
failed = []

for i, pptr in enumerate(packed):
    path_id = pptr.get("m_PathID") if isinstance(pptr, dict) else getattr(pptr, "path_id", None)
    sprite_name = names[i] if i < len(names) else f"sprite_{i}"

    if path_id is None or path_id not in objects_by_id:
        print(f"  [{i}] '{sprite_name}': PPtr path_id={path_id} not found, skipping")
        failed.append(sprite_name)
        continue

    try:
        sprite_obj = objects_by_id[path_id]
        sprite = sprite_obj.read()
        img = sprite.image  # PIL Image of just this sprite's region

        safe_filename = sprite_name.replace("/", "_").replace("\\", "_") + ".png"
        out_path = os.path.join(OUTPUT_DIR, safe_filename)
        img.save(out_path)
        extracted[sprite_name] = safe_filename
        if i % 100 == 0:
            print(f"  [{i}/{len(packed)}] '{sprite_name}' -> {safe_filename}")
    except Exception as e:
        print(f"  [{i}] '{sprite_name}': ERROR - {e}")
        failed.append(sprite_name)

print(f"\nExtracted {len(extracted)} sprites, {len(failed)} failed")
if failed:
    print(f"Failed: {failed[:20]}{'...' if len(failed) > 20 else ''}")

# Build mapping: internal sprite name -> item display name
# Load our known item names
with open(GAME_ID_MAPS, encoding="utf-8") as f:
    game_id_maps = json.load(f)
items_en = game_id_maps.get("InventoryItems_en", {})

# Patterns observed in sprite names -> item categories
# "_press" = juice, "_dried" = dried, "_honey" = honey variant, "_oil" = in oil,
# "_vinegar" = pickled/vinegar, "_smoke"/"_smoked" = smoked, "_salted"/"_salt" = salted/in salt
# "_butter" = butter, "_flour" = flour
SUFFIX_TO_CATEGORY = {
    "_press": "Juice",
    "_dried": "Dried",
    "_honey": "Honey",
    "_oil": "Oil",
    "_vinegar": "Vinegar",
    "_smoke": "Smoked",
    "_smoked": "Smoked",
    "_salted": "Salted",
    "_salt": "Salt",
    "_butter": "Butter",
    "_flour": "Flour",
}

# Manual sprite name -> game item display name mapping for processed goods
MANUAL_MAP = {
    # Juices (press)
    "item_rosehip_press":       "Rosehip Juice",
    "item_carrot_press":        "Carrot Juice",
    "item_strawberry_press":    "Strawberry Juice",
    "item_apple_press":         "Apple Juice",
    "item_elderberry_press":    "Elderberry Juice",
    "item_cranberry_press":     "Cranberry Juice",
    "item_blackberry_press":    "Blackberry Juice",
    "item_cherry_press":        "Cherry Juice",
    "item_pear_press":          "Pear Juice",
    "item_rhubarb_press":       "Rhubarb Juice",
    "item_raspberry_press":     "Raspberry Juice",
    "item_hawthorne_press":     "Hawthorn Juice",
    "item_juniper_press":       "Juniper Juice",
    "item_plum_press":          "Plum Juice",
    "item_Cantaloupe_press":    "Cantaloupe Juice",
    # Dried fruits / veg
    "item_rosehip_dried":       "Dried Rosehips",
    "item_strawberry_dried":    "Dried Strawberry",
    "item_apple_dried":         "Dried Apple",
    "item_elderberry_dried":    "Dried Elderberries",
    "item_cranberry_dried":     "Dried Cranberries",
    "item_blackberry_dried":    "Dried Blackberries",
    "item_cherry_dried":        "Dried Cherry",
    "item_pear_dried":          "Dried Pear",
    "item_rhubarb_dried":       "Dried Rhubarb",
    "item_raspberry_dried":     "Dried Raspberries",
    "item_hawthorne_dried":     "Dried Hawthorn Berries",
    "item_juniper_dried":       "Dried Juniper",
    "item_lavender_dried":      "Dried Lavender",
    "item_chamomile_dried":     "Dried Chamomile",
    "item_mint_dried":          "Dried Mint",
    "item_yarrow_dried":        "Dried Yarrow",
    "item_chicory_dried":       "Dried Chicory",
    "item_dandelion_dried":     "Dried Dandelions",
    "item_daylily_dried":       "Dried Daylily",
    "item_sunflower_dried":     "Dried Sunflower",
    "item_sorrel_dried":        "Dried Sorrels",
    "item_pepperwort_dried":    "Dried Pepperwort",
    "item_Cantaloupe_dried":    "Dried Cantaloupe",
    "item_girtleMush_dried":    "Dried Girtleshroom",
    "item_chantarelle_dried":   "Dried Chanterelle",
    "item_wintermush_dried":    "Dried Wintershroom",
    "Item_morel_dried":         "Dried Morels",
    "Item_oystermush_dried":    "Dried Oyster Mushroom",
    "Item_ramp_dried":          "Dried Ramps",
    "Item_fiddlehead_dried":    "Dried Fiddlehead",
    "Item_bean_dried":          "Dried Beans",
    "Item_cabbage_dried":       "Dried Cabbage",
    "item_radish_dried":        "Dried Radish",
    "item_carrot_dried":        "Dried Carrots",
    "item_corn_dried":          "Dried Corn",
    "item_ginger_dried":        "Dried Ginger",
    "item_onion_dried":         "Dried Onions",
    "Item_pepper_dried":        "Dried Peppers",
    "Item_sunroot_dried":       "Dried Sunroot",
    "Item_asparagus_dried":     "Dried Asparagus",
    "Item_cattail_dried":       "Dried Cattail Shoots",
    "Item_pumpkin_dried":       "Dried Pumpkin",
    "Item_potato_dried":        "Dried Potatoes",
    "Item_Offal_Dried":         "Dried Offal",
    "item_Pepperwort_leaves_dried": "Dried Pepperwort Leaves",
    "Item_chikree_dried":       "Dried Chikree",
    # Honey
    "item_rosehip_honey":       "Rosehip Honey",
    "item_strawberry_honey":    "Strawberry Honey",
    "Item_apple_honey":         "Apple Honey",
    "item_elderberry_honey":    "Elderberry Honey",
    "item_cranberry_honey":     "Cranberry Honey",
    "item_blackberry_honey":    "Blackberry Honey",
    "Item_cherry_honey":        "Cherry Honey",
    "Item_pear_honey":          "Pear Honey",
    "item_rhubarb_honey":       "Rhubarb Honey",
    "item_raspberry_honey":     "Raspberry Honey",
    "item_hawthorne_honey":     "Hawthorn Honey",
    "item_juniper_honey":       "Juniper Honey",
    "item_plum_Honey":          "Plum Honey",
    "item_Cantaloupe_honey":    "Cantaloupe Honey",
    # Oils / in oil
    "item_rosehip_oil":         "Rosehip in Oil",
    "item_lavender_oil":        "Lavender in Oil",
    "item_chamomile_oil":       "Chamomile in Oil",
    "item_mint_oil":            "Mint in Oil",
    "item_yarrow_oil":          "Yarrow in Oil",
    "item_chicory_oil":         "Chicory in Oil",
    "item_dandelion_oil":       "Dandelions in Oil",
    "item_daylily_oil":         "Daylily in Oil",
    "item_pepperwort_oil":      "Pepperwort in Oil",
    "Item_ramp_oil":            "Ramps in Oil",
    "item_Sorrel_oil":          "Sorrel in Oil",
    "item_Redclover_oil":       "Clovers in Oil",
    "item_sunflower_oil":       "Sunflower Oil",
    "Item_oil":                 "Cooking Oil",
    "item_sunroot_oil":         "Sunroot in Oil",
    "item_girtleMush_oil":      "Girtleshroom in Oil",
    "item_chantarelle_oil":     "Chanterelle in Oil",
    "item_wintermush_oil":      "Wintershroom in Oil",
    "Item_morel_oil":           "Morels in Oil",
    "Item_oystermush_oil":      "Oyster mushroom in Oil",
    "item_fish_oil":            "Fish Oil",
    "item_chikree_oil":         "Chikree in Oil",
    "item_Pepperwort_leaves_oil": "Pepper Oil",
    "item_chikree_salted":      "Salted Chikree",
    # Vinegar / pickled
    "Item_vinegar_apple":       "Vinegar",
    "item_carrot_vinegar":      "Pickled Carrots",
    "item_cucumber_vinegar":    "Pickled Cucumbers",
    "Item_corn_vinegar":        "Pickled Corn",
    "Item_pepper_vinegar":      "Pickled Peppers",
    "Item_cabbage_vinegar":     "Pickled Cabbage",
    "Item_bean_vinegar":        "Pickled Beans",
    "Item_pumpkin_vinegar":     "Pickled Pumpkin",
    "Item_potato_vinegar":      "Pickled Potatoes",
    "item_radish_vinegar":      "Pickled Radish",
    "item_ginger_vinegar":      "Pickled Ginger",
    "item_onion_vinegar":       "Pickled Onions",
    "item_sorrel_vinegar":      "Sorrel in Oil",
    "Item_fiddlehead_vinegar":  "Pickled Fiddleheads",
    "Item_cattail_vinegar":     "Pickled Cattail",
    "Item_asparagus_vinegar":   "Pickled Asparagus",
    "Item_ramp_vinegar":        "Ramps in Oil",
    "item_sunroot_vinegar":     "Pickled Sunroot",
    "Item_chikree_vinegar":     "Pickled Chikree",
    "Item_egg_vinegar":         "Pickled Eggs",
    "Item_fish_large_vinegar":  "Large Pickled Fish",
    "Item_fish_med_vinegar":    "Medium Pickled Fish",
    "Item_fish_small_vinegar":  "Small Pickled Fish",
    # Smoked / salted / buttered
    "item_peanut_smoke":        "Smoked Peanuts",
    "Item_walnut_smoke":        "Smoked Walnuts",
    "item_maple_smoke":         "Smoked Maple Seeds",
    "Item_pinenut_smoke":       "Smoked Pine nuts",
    "item_acorn_smoke":         "Smoked Acorns",
    "Item_fish_large_smoked":   "Large Smoked Fish",
    "Item_fish_med_smoke":      "Medium Smoked Fish",
    "Item_fish_small_smoked":   "Small Smoked Fish",
    "Item_fish_large_dried":    "Large Dried Fish",
    "Item_fish_med_dried":      "Medium Dried Fish",
    "Item_fish_small_dried":    "Small Dried Fish",
    "Item_fish_large_oil":      "Large Fish in Oil",
    "Item_fish_med_oil":        "Medium Fish in Oil",
    "Item_fish_small_oil":      "Small Fish in Oil",
    "Item_fish_large_salt":     "Large Salted Fish",
    "Item_fish_med_salted":     "Medium Salted Fish",
    "Item_fish_small_salted":   "Small Salted Fish",
    # Butters / flours
    "item_peanut_press_butter": "Peanut butter",
    "Item_walnut_butter":       "Walnut Butter",
    "Item_pinenut_butter":      "Pineseed butter",
    "item_oat_flour":           "Oat Flour",
    "item_maple_flour":         "Maple Flour",
    "item_birch_flour":         "Birch Flour",
    "item_acorn_flour":         "Acorn Flour",
    # Dairy / fermented
    "Item_milk_cheese_salt":    "Cheese",
    "Item_milk_cheese_smoke":   "Smoked Cheese",
    "Item_Butter":              "Butter",
    "Item_wineBottle":          "Fruit Wine",
    "Item_Beer":                "Mead",
    "Item_Honey_normal":        "Honey",
    "Item_honeycomb":           "Honeycomb",
    "Item_egg_oil_mayo":        "Egg Mayo",
    "Item_egg_salt":            "Salted Eggs",
    # Smoked meats
    "Item_Bluggy_smoke":        "Smoked Bluggy",
    "Item_Bluggy_dried":        "Dried Bluggy",
    "Item_Bluggy_salted":       "Salted Bluggy",
    "Item_Bluggy_oil":          "Bluggy in Oil",
    "Item_Bluggy_vinegar":      "Pickled Bluggy",
    "Item_Alpheep_smoked":      "Smoked Alpheep",
    "Item_Alpheep_dried":       "Dried Alpheep",
    "Item_Alpheep_salted":      "Salted Alpheep",
    "Item_Alpheep_oil":         "Alpheep in Oil",
    "Item_Alpheep_vinegar":     "Pickled Alpheep",
    "Item_Girtle_dried":        "Dried Girtle",
    "Item_Girtle_smoked":       "Smoked Girtle",
    "Item_Girtle_salted":       "Salted Girtle",
    "Item_Girtle_oil":          "Girtle in Oil",
    "Item_Girtle_vinegar":      "Pickled Girtle",
    "item_chikree_smoked":      "Smoked Chikree",
    "item_Sunflower_roast":     "Smoked Acorns",
    # Raw ingredients (for completeness)
    "Item_rosehip":             "Rosehips",
    "Item_Milk":                "Milk",
    "Item_Egg":                 "Egg",
    "Item_Honey_normal":        "Honey",
    "item_fish_seaweed_dried":  "Dried Seaweed",
    "item_fish_seaweed_vinegar":"Pickled Seaweed",
    "Item_Bluggy_Meat":         "Bluggy Meat",
    "Item_Alpheep_Meat":        "Alpheep Meat",
    "Item_GirtleMeat":          "Girtle Meat",
    "Item_chikreeMeat":         "Chikree Meat",
}

# Save the mapping
with open(MAPPING_OUT, "w", encoding="utf-8") as f:
    json.dump({
        "sprite_to_item": MANUAL_MAP,
        "all_sprite_names": list(extracted.keys()),
        "failed": failed,
    }, f, indent=2, ensure_ascii=False)

print(f"\nMapping saved to {MAPPING_OUT}")
print(f"Sprites saved to {OUTPUT_DIR}")
print(f"\nTotal extracted: {len(extracted)}")
print("\nDone! Next step: copy desired sprites to client/public/items/ with item display names.")
