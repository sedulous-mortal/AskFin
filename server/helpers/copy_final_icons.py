"""
Final pass: remaining sprites found in the atlas that were missed.
Also adds aliases for items that share a sprite (e.g. Rosehip / Rosehips).
"""
import os
import shutil

SPRITES_DIR = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\extracted_sprites"
OUTPUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"

FINAL_MAP = {
    # === RAW PUMPKIN ===
    "pumpkin":                      "Pumpkin",

    # === DRIED / PROCESSED ITEMS MISSED IN EARLIER PASS ===
    "Item_plum_dried":              "Dried Plum",
    "item_cucumber_dried":          "Dried Cucumbers",
    "item_Redclover_dried":         "Dried Red Clover",
    "Item_sunroot_drie":            "Dried Sunroot Flower",

    # === RAW ITEM NAME ALIASES (sprite exists, item name differs slightly) ===
    # "Rosehips" sprite exists; raw ingredient is called "Rosehip" (ID 301)
    "Item_rosehip":                 "Rosehip",
    # "Potato" sprite (Potatoes) was already copied; also need singular "Potato"
    # — handled by same file (Potato.png already exists from Potatoes sprite)

    # === FEATHER VARIANTS — all share the generic feather sprite ===
    "Item_feather":                 "Dark Brown Feather",
    # Light Brown Feather, White Feather, Blue Feather share same icon
    # We copy the same source file under each needed name
}

# Additional copies where same source sprite covers multiple item names
ALIAS_MAP = {
    # source filename (already in OUTPUT_DIR) -> list of alias names to create
    "Feather.png":              ["Dark Brown Feather", "Light Brown Feather", "White Feather", "Blue Feather"],
    "Fish.png":                 [
        "Blue Catfish", "Common Dace", "Tiger Trout", "Gudgeon", "Perch", "Ide",
        "Grass Carp", "Burbot", "Zander", "Common Bream", "Rudd", "Smelt",
        "Silver Bream", "Vimba", "Tench", "Mirror Carp", "Common Carp",
        "Wels Catfish", "Eel", "Bleak", "Rainbow Trout", "Sea Trout",
        "Stickleback", "Spined Loach", "Shorthorn Sculpin", "Halibut",
        "Whitefish", "Asp", "Brown Trout", "Chub", "Danube Salmon", "Minnow",
        "Amur Catfish", "Powan", "Brook Trout", "Mottled Eel", "Bluegill",
        "Rock Bass", "Crappie", "Gar", "Stone Loach", "Walleye", "Lamprey",
        "Arctic Char", "Arctic Grayling", "Siberian Sturgeon", "Northern Pike",
        "Lake Trout", "Coho Salmon", "Atlantic Salmon", "Balkhash Perch",
        "Black Bullhead", "Chinook Salmon", "Gobie", "Golden Trout",
        "Madtom Catfish", "Nase", "Pink Salmon", "Vendace", "Crucian Carp",
        "Sickly Fish", "Crayfish", "Scallop", "Pool Frog", "Common Toad",
        "Lobster", "Brown Crab", "Shrimp", "Oyster", "Clam", "Tadpole",
        "Seaweed", "Fish Chum Abundant", "Fish Chum Common",
        "Fish Chum Uncommon", "Fish Chum Rare",
    ],
    # Cooked foods that don't have dedicated sprites — use closest match
    "Grilled_Meat.png":         ["Smoked Sausage", "Sausage", "Jerky", "Black Pudding",
                                 "Blood Soup", "Glazed Meat Skewers", "Girtle Ribs",
                                 "Roast Bluggy", "Sheperd's Stew"],
    "Grilled_Fish.png":         ["Fried Fish", "Fish Root Chowder"],
    "Grilled_Vegetables.png":   ["Grilled Vegetables", "Fried Vegetables", "Vegetable Stir fry",
                                 "Cheesy Roasted Vegetables", "Vegetable Fritter",
                                 "Vegetable Tart", "Vegetable Salad"],
    "Roast_Roots.png":          ["Roasted Roots", "Seasoned Root Mash",
                                 "Honey Glazed Root Gratin"],
    "Salad.png":                ["Fried Mushrooms", "Stuffed Mushrooms", "Mushroom Loaf",
                                 "Mushroom Stew", "Mushroom Frittata", "Mushroom Scramble"],
    "Cheese.png":               ["Cheesy Flatbread", "Cheesy Pasta", "Nutty Cheese Wedges",
                                 "Mayonnaise"],
    "Fruit_Salad.png":          ["Spiced Berry Pie", "Spiced Fruit Stew", "Creamy Fruit Pudding",
                                 "Fruit Porridge", "Honeyed Fruit Skewers", "Nutty Fruit Bar",
                                 "Spiced Nuts", "Honey Nut Tart"],
    "Creamy_Mushroom_Soup.png": ["Creamy Mushroom Soup", "Creamy Root Stew"],
    "Egg.png":                  ["Fried Egg", "Egg Custard", "Sweet Milk Pudding"],
    "Mead.png":                 ["Sweet Herb Tea"],
    "Cheese_Loaf.png":          ["Cheese Loaf"],
}

copied = []
skipped = []
missing = []

# Primary map: sprite -> item name
for sprite_name, item_display_name in FINAL_MAP.items():
    sprite_filename = sprite_name.replace("/", "_").replace("\\", "_") + ".png"
    src = os.path.join(SPRITES_DIR, sprite_filename)
    dest_filename = item_display_name.replace(" ", "_") + ".png"
    dest = os.path.join(OUTPUT_DIR, dest_filename)

    if not os.path.exists(src):
        missing.append(f"{sprite_name}")
        continue
    if os.path.exists(dest):
        skipped.append(dest_filename)
        continue
    shutil.copy2(src, dest)
    copied.append(f"{sprite_name} -> {dest_filename}")
    print(f"  COPIED: {sprite_name} -> {dest_filename}")

# Alias map: existing icon -> multiple item names
for source_filename, item_names in ALIAS_MAP.items():
    src = os.path.join(OUTPUT_DIR, source_filename)
    if not os.path.exists(src):
        print(f"  ALIAS SOURCE MISSING: {source_filename}")
        continue
    for item_name in item_names:
        dest_filename = item_name.replace(" ", "_") + ".png"
        dest = os.path.join(OUTPUT_DIR, dest_filename)
        if os.path.exists(dest):
            skipped.append(dest_filename)
            continue
        shutil.copy2(src, dest)
        copied.append(f"{source_filename} -> {dest_filename}")
        print(f"  ALIAS: {source_filename} -> {dest_filename}")

print(f"\n--- Summary ---")
print(f"Newly copied: {len(copied)}")
print(f"Skipped (already exist): {len(skipped)}")
print(f"Missing source: {len(missing)}")
if missing:
    print(f"  {missing}")
