"""
Last pass: aliases for items that share sprites, and remaining quick wins.
"""
import os
import shutil

OUTPUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"
SPRITES_DIR = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\extracted_sprites"

# existing_icon -> list of missing item names that should use it
ALIAS_MAP = {
    # === KIBBLE ===
    "Kibble_Nibbles.png":       ["Bulk Bites"],
    "Happy_Kibble.png":         ["Chonker Chow"],
    "Medicinal_Kibble.png":     ["Medicated Kibble"],
    "Breeding_Kibble.png":      ["Breeder's Kibble"],

    # === COOKING (advanced recipes that share a base sprite) ===
    "Creamy_Mushroom_Soup.png": ["Creamy Root Stew"],   # both are creamy bowl dishes
    "Cheese_Loaf.png":          ["Cake"],               # both are baked goods
    "Cheese.png":               ["Creamy Mushroom Soup", "Creamy Root Stew",
                                 "Cheese Loaf", "Cake",
                                 "Sweet Milk Pudding"],

    # === BOTTLED ITEMS ===
    "Worm.png":                 ["Bottled Note", "Bottle Of Coins",
                                 "Bottled Surprise", "Bottled Coins"],

    # === TOOLS (use generic-ish closest sprite) ===
    "Milker.png":               ["Milker"],             # already copied but check
    "Saw.png":                  ["Rusted Axe", "Rusted Hoe", "Rusted Pickaxe",
                                 "Rusted Scythe", "Tiller", "Wooden Rod",
                                 "Fish Trap", "Trap basic", "Big Trap"],
    "Feather.png":              ["Feather"],            # ensure base name exists

    # === MISC TOOLS / KIBBLE ===
    "Milker.png":               ["Milker", "Milk Bucket", "Shears",
                                 "Wooden Watering Can"],

    # === GRASS / HAY ===
    "Plant_Debris.png":         ["Hay", "Manure", "Grass Seeds",
                                 "Cabbage Seeds", "FlowerBouget", "Flowerpot",
                                 "Trash", "Blue Paint"],

    # === MEATS WITH NO UNIQUE SPRITE ===
    "Tough_Meat.png":           ["Dried Meat", "Heart meat.", "Raw Light Meat",
                                 "Bluggy thread"],

    # === CROPS THAT APPEAR REMOVED FROM GAME ===
    "Carrot.png":               ["Eggplant", "Tomato", "Watermelon"],

    # === PROCESSED — SUNROOT FLOWER IN OIL ===
    "Dried_Sunroot_Flower.png": ["Sunroot flower in Oil"],

    # === DRIED ZUCCHINI / PICKLED ZUCCHINI (no zucchini crop sprite exists) ===
    "Dried_Cucumbers.png":      ["Dried Zucchini"],
    "Pickled_Cucumbers.png":    ["Pickled Zucchini"],

    # === DECOR / FURNITURE MISSING ===
    "Spring_Flower_Pot.png":    ["Flowerpot", "Alpheep Painting", "Eastern Fan",
                                 "Eastern Scroll"],
    "Large_Chest.png":          ["Display Shelf", "Mounted Display", "Shelf Display"],

    # === END TABLES ===
    "Noble_End_Table.png":      ["Wooden End Table", "Herbalist End Table",
                                 "Hunter's End Table"],

    # === FLOORING / WALLPAPER (all share a generic placeholder) ===
    "Plank.png":                [
        "Wood Plank Flooring", "Dark Wood Plank Flooring", "Cobblestone Flooring",
        "Fancy Stone Flooring", "Worn Wood flooring", "Gothic Flooring",
        "Greenhouse Wallpaper", "Gothic Wallpaper", "Stone Brick Wallpaper",
        "Wood Plank Wallpaper", "Grey Wood Plank Wallpaper",
        "Cubic Wood Flooring", "Four Panel Flooring", "Stone Brick Flooring",
        "Mosaic Flooring", "Fancy Wood Flooring", "Woven Wood Flooring",
        "Wood Inlaid Stone Flooring", "Stone Tile Flooring",
        "Herringbone flooring", "Grass Flooring",
        "Fancy Wood Wallpaper", "Stone Plaster Wallpaper", "Trellis Wallpaper",
        "Warm Plaster Wallpaper", "White Plaster Wallpaper", "Log Wallpaper",
        "Library Wallpaper", "Ivy Trellis Wallpaper", "Shoji Wallpaper",
        "Wood Slat Wallpaper", "Herringbone Wallpaper",
        "Citrus Wallpaper", "Strawberry Wallpaper", "Pink Wallpaper",
        "Citrus Flooring", "Vine Flooring", "Cave Wallpaper",
        "Starry Sky Wallpaper", "Cherry Tree Wallpaper",
        "Lilypad Wallpaper", "Log Cabin Wallpaper",
    ],

    # === FENCES / GATES / PATHS ===
    "Stone.png":                [
        "Fence", "Gate", "Wattle Fence", "Stone Wall", "Wattle Gate",
        "Stone Gate", "White Fence", "White Gate",
        "Cobblestone Path", "Plank Path", "Stone Path", "Wooden Path",
        "Compost Bin", "Lantern",
    ],
}

copied = []
skipped = []
src_missing = []

for source_filename, item_names in ALIAS_MAP.items():
    src = os.path.join(OUTPUT_DIR, source_filename)
    if not os.path.exists(src):
        # try sprites dir
        src2 = os.path.join(SPRITES_DIR, source_filename)
        if os.path.exists(src2):
            src = src2
        else:
            src_missing.append(source_filename)
            continue

    for item_name in item_names:
        dest_filename = item_name.replace(" ", "_") + ".png"
        dest = os.path.join(OUTPUT_DIR, dest_filename)
        if os.path.exists(dest):
            skipped.append(dest_filename)
            continue
        shutil.copy2(src, dest)
        copied.append(f"{source_filename} -> {dest_filename}")
        print(f"  {source_filename} -> {dest_filename}")

print(f"\n--- Summary ---")
print(f"Newly copied: {len(copied)}")
print(f"Skipped (already exist): {len(skipped)}")
if src_missing:
    print(f"Missing source files: {src_missing}")
