"""
Create a 24x24 question-mark placeholder icon and overwrite every placeholder
file in client/public/items/ with it.

Placeholder files are those that were copied from a non-matching source sprite
(fish species → Fish.png, tools → Saw.png, flooring → Plank.png, etc.).
"""
from PIL import Image, ImageDraw, ImageFont
import os, shutil

OUTPUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"
ICON_PATH   = os.path.join(OUTPUT_DIR, "_unknown.png")

# ── Build the question-mark icon ──────────────────────────────────────────────
SIZE = 24
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Dark grey rounded background
draw.rounded_rectangle([0, 0, SIZE-1, SIZE-1], radius=4,
                        fill=(60, 60, 70, 220))

# White "?" — use default bitmap font (always available, no file needed)
font = ImageFont.load_default()
text = "?"
bbox = draw.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
x = (SIZE - tw) // 2 - bbox[0]
y = (SIZE - th) // 2 - bbox[1] - 1
draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

img.save(ICON_PATH)
print(f"Created {ICON_PATH}")

# ── List every placeholder file to overwrite ─────────────────────────────────
# These are all items whose icon was synthesised from a thematically-close but
# visually-wrong source sprite rather than extracted from the actual game atlas.

PLACEHOLDERS = [
    # Feather colour variants (all used same generic feather sprite)
    "Light_Brown_Feather", "White_Feather", "Blue_Feather",

    # Fish / aquatic — all used Category_fish generic icon
    "Blue_Catfish", "Common_Dace", "Tiger_Trout", "Gudgeon", "Perch", "Ide",
    "Grass_Carp", "Burbot", "Zander", "Common_Bream", "Rudd", "Smelt",
    "Silver_Bream", "Vimba", "Tench", "Mirror_Carp", "Common_Carp",
    "Wels_Catfish", "Eel", "Bleak", "Rainbow_Trout", "Sea_Trout",
    "Stickleback", "Spined_Loach", "Shorthorn_Sculpin", "Halibut",
    "Whitefish", "Asp", "Brown_Trout", "Chub", "Danube_Salmon", "Minnow",
    "Amur_Catfish", "Powan", "Brook_Trout", "Mottled_Eel", "Bluegill",
    "Rock_Bass", "Crappie", "Gar", "Stone_Loach", "Walleye", "Lamprey",
    "Arctic_Char", "Arctic_Grayling", "Siberian_Sturgeon", "Northern_Pike",
    "Lake_Trout", "Coho_Salmon", "Atlantic_Salmon", "Balkhash_Perch",
    "Black_Bullhead", "Chinook_Salmon", "Gobie", "Golden_Trout",
    "Madtom_Catfish", "Nase", "Pink_Salmon", "Vendace", "Crucian_Carp",
    "Sickly_Fish", "Crayfish", "Scallop", "Pool_Frog", "Common_Toad",
    "Lobster", "Brown_Crab", "Shrimp", "Oyster", "Clam", "Tadpole",
    "Seaweed", "Fish_Chum_Abundant", "Fish_Chum_Common",
    "Fish_Chum_Uncommon", "Fish_Chum_Rare",

    # Cooking recipes with no dedicated atlas sprite
    "Smoked_Sausage", "Sausage", "Jerky", "Black_Pudding", "Blood_Soup",
    "Glazed_Meat_Skewers", "Girtle_Ribs", "Roast_Bluggy", "Sheperd's_Stew",
    "Fried_Fish", "Fish_Root_Chowder",
    "Fried_Vegetables", "Vegetable_Stir_fry", "Cheesy_Roasted_Vegetables",
    "Vegetable_Fritter", "Vegetable_Tart", "Vegetable_Salad",
    "Roasted_Roots", "Seasoned_Root_Mash", "Honey_Glazed_Root_Gratin",
    "Fried_Mushrooms", "Stuffed_Mushrooms", "Mushroom_Loaf", "Mushroom_Stew",
    "Mushroom_Frittata", "Mushroom_Scramble",
    "Cheesy_Flatbread", "Cheesy_Pasta", "Nutty_Cheese_Wedges", "Mayonnaise",
    "Spiced_Berry_Pie", "Spiced_Fruit_Stew", "Creamy_Fruit_Pudding",
    "Fruit_Porridge", "Honeyed_Fruit_Skewers", "Nutty_Fruit_Bar",
    "Spiced_Nuts", "Honey_Nut_Tart",
    "Fried_Egg", "Egg_Custard", "Sweet_Milk_Pudding", "Sweet_Herb_Tea",
    "Creamy_Mushroom_Soup", "Creamy_Root_Stew", "Cheese_Loaf", "Cake",

    # Kibble name aliases (new names for existing kibble items)
    "Bulk_Bites", "Chonker_Chow", "Medicated_Kibble", "Breeder's_Kibble",

    # Collectible bottles (no sprite)
    "Bottled_Note", "Bottle_Of_Coins", "Bottled_Surprise", "Bottled_Coins",

    # Tools not in Atlas_InventoryItems
    "Rusted_Axe", "Rusted_Hoe", "Rusted_Pickaxe", "Rusted_Scythe",
    "Tiller", "Wooden_Rod", "Fish_Trap", "Trap_basic", "Big_Trap",
    "Milker", "Wooden_Watering_Can", "Shears", "Milk_Bucket",

    # Misc items with no atlas sprite
    "Hay", "Manure", "Grass_Seeds", "Cabbage_Seeds", "FlowerBouget",
    "Flowerpot", "Trash", "Blue_Paint",
    "Dried_Meat", "Heart_meat.", "Raw_Light_Meat", "Bluggy_thread",
    "Eggplant", "Tomato", "Watermelon",
    "Sunroot_flower_in_Oil",
    "Dried_Zucchini", "Pickled_Zucchini",
    "Alpheep_Painting", "Eastern_Fan", "Eastern_Scroll",
    "Display_Shelf", "Mounted_Display", "Shelf_Display",
    "Wooden_End_Table", "Herbalist_End_Table", "Hunter's_End_Table",

    # Fences, gates, paths, infrastructure
    "Fence", "Gate", "Wattle_Fence", "Stone_Wall", "Wattle_Gate",
    "Stone_Gate", "White_Fence", "White_Gate",
    "Cobblestone_Path", "Plank_Path", "Stone_Path", "Wooden_Path",
    "Compost_Bin", "Lantern",

    # Flooring and wallpaper
    "Wood_Plank_Flooring", "Dark_Wood_Plank_Flooring", "Cobblestone_Flooring",
    "Fancy_Stone_Flooring", "Worn_Wood_flooring", "Gothic_Flooring",
    "Greenhouse_Wallpaper", "Gothic_Wallpaper", "Stone_Brick_Wallpaper",
    "Wood_Plank_Wallpaper", "Grey_Wood_Plank_Wallpaper",
    "Cubic_Wood_Flooring", "Four_Panel_Flooring", "Stone_Brick_Flooring",
    "Mosaic_Flooring", "Fancy_Wood_Flooring", "Woven_Wood_Flooring",
    "Wood_Inlaid_Stone_Flooring", "Stone_Tile_Flooring",
    "Herringbone_flooring", "Grass_Flooring",
    "Fancy_Wood_Wallpaper", "Stone_Plaster_Wallpaper", "Trellis_Wallpaper",
    "Warm_Plaster_Wallpaper", "White_Plaster_Wallpaper", "Log_Wallpaper",
    "Library_Wallpaper", "Ivy_Trellis_Wallpaper", "Shoji_Wallpaper",
    "Wood_Slat_Wallpaper", "Herringbone_Wallpaper",
    "Citrus_Wallpaper", "Strawberry_Wallpaper", "Pink_Wallpaper",
    "Citrus_Flooring", "Vine_Flooring", "Cave_Wallpaper",
    "Starry_Sky_Wallpaper", "Cherry_Tree_Wallpaper",
    "Lilypad_Wallpaper", "Log_Cabin_Wallpaper",
]

replaced = 0
skipped = 0
for name in PLACEHOLDERS:
    dest = os.path.join(OUTPUT_DIR, name + ".png")
    if os.path.exists(dest):
        shutil.copy2(ICON_PATH, dest)
        replaced += 1
    else:
        print(f"  NOT FOUND (skipping): {name}.png")
        skipped += 1

print(f"\nReplaced {replaced} placeholder icons with question-mark.")
print(f"Skipped (file not present): {skipped}")
