"""
Comprehensive copy of ALL extractable sprites to client/public/items/.
Covers raw crops, seeds, fruits, tools, furniture, cooked foods, fish, critter products, etc.
Skips files that already exist.
"""
import os
import shutil

SPRITES_DIR = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\extracted_sprites"
OUTPUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"

# sprite_name -> item display name (matches frontend convention: spaces replaced with _)
FULL_MAP = {
    # === RAW CROPS & FORAGEABLES ===
    "Carrot":               "Carrot",
    "Corn":                 "Corn",
    "Strawberry":           "Strawberry",
    "Beans":                "Beans",
    "Peanut":               "Peanut",
    "Potatoes":             "Potato",
    "Rhubarb":              "Rhubarb",
    "Mint":                 "Mint",
    "Lavender":             "Lavender",
    "Chamomile":            "Chamomile",
    "Yarrow":               "Yarrow",
    "Chicory":              "Chicory",
    "Sunflower":            "Sunflower",
    "Cranberry":            "Cranberry",
    "Cantaloupe":           "Cantaloupe",
    "FiddleHead":           "Fiddlehead Fern",
    "Ramp":                 "Ramp",
    "Morel":                "Morel",
    "Oystermushroom":       "Oyster Mushroom",
    "Chantarelle":          "Chanterelle",
    "WinterShroom":         "Winter Mushroom",
    "Asparagus":            "Asparagus",
    "Sunroot":              "Sunroot",
    "Radish":               "Radish",
    "Red Sorrel":           "Red Sorrel",
    "bellPepper":           "Bellpepper",
    "Pepperwort":           "Pepperwort Leaves",
    "Pepperwort Flower":    "Pepperwort Flower",
    "Dandelion_Greens":     "Dandelions",
    "Onion":                "Onion",
    "RedClover":            "Red Clover",
    "Ginger":               "Ginger",
    "Cabbage":              "Cabbage",
    "Sunroot Flower":       "Sunroot Flowers",
    "Cattail Shoot":        "Cattail",
    "Daylily Flower":       "Daylily Flower",
    "Cucumbe":              "Cucumber",
    "Oats":                 "Oats",
    "item_girtleMush":      "GirtleShroom",
    "Dandelion_flower":     "Dandelions",  # fallback if Dandelion_Greens not present

    # === SEEDS ===
    "Seeds_Asparg":         "Asparagus Seeds",
    "Seeds_carrot":         "Carrot Seeds",
    "Seeds_Corn":           "Corn Seeds",
    "Seeds_dandy":          "Dandelion Seeds",
    "Seeds_Ginger":         "Ginger Seeds",
    "Seeds_strawberry":     "Strawberry Seeds",
    "Seeds_radish":         "Radish Seeds",
    "Seeds_Rhubarb":        "Rhubarb Seeds",
    "Seeds_peanut":         "Peanut Seeds",
    "Seeds_potato":         "Potato Seeds",
    "Seeds_pumpkin":        "Pumpkin Seeds",
    "Seeds_bellPepper":     "Bellpepper Seeds",
    "Seeds_Beans":          "Bean Seeds",
    "Seeds_onion":          "Onion Seeds",
    "Seeds_Lavender":       "Lavender Seeds",
    "Seeds_Chamomile":      "Chamomile Seeds",
    "Seeds_mint":           "Mint Seeds",
    "Seeds_Yarrow":         "Yarrow Seeds",
    "Seeds_Chicory":        "Chicory Seeds",
    "Seeds_Sunflower":      "Sunflower Seeds",
    "Seeds_RedClover":      "Red Clover Seeds",
    "Seeds_Cantaloupe":     "Cantaloupe Seeds",
    "Seeds_Oats":           "Oat Seeds",
    "Seeds_Cucumber":       "Cucumber Seeds",
    "Seeds_daylily":        "Daylily Seeds",
    "Seeds_Pepperwort":     "Pepperwort Seeds",
    "Seeds_Sunroot":        "Sunroot Seeds",
    "Seeds_wheat":          "Hay Seeds",

    # === TREE SEEDS / NUTS / BERRIES ===
    "Item_JuniperSeed":     "Juniper Seeds",
    "Item_CherrySeed":      "Cherry Seed",
    "Item_AppleSeed":       "Apple Seed",
    "Item_PearSeed":        "Pear Seed",
    "Item_PlumSeed":        "Plum Seeds",
    "Item_MapleSeed":       "Maple Seed",
    "Item_BirchSeed":       "Birch Seeds",
    "Item_HawthorneSeeds":  "Hawthorn Seeds",
    "Item_PineCone":        "Pine Seed",
    "Item_Acorn":           "Acorn",
    "Item_JuniperBerry":    "Juniper Berry",
    "Item_HawthorneBerry":  "Hawthorn Berry",
    "Item_elderberry":      "Elderberry",
    "Item_Raspberry":       "Raspberry",
    "Item_Blackberry":      "Blackberry",
    "Item_Cherry":          "Cherry",
    "Item_Plum":            "Plum",
    "Item_Pear":            "Pear",
    "Item_Apple":           "Apple",
    "Item_Walnut":          "Walnut",
    "Item_wintergreen":     "Wintergreen Berry",

    # === ORES / BARS (additions — existing ones already in public/items) ===
    "Item_bar_mithril":     "Mithril Bar",
    "item_ore_coal":        "Coal",

    # === ANIMAL PRODUCTS & CRITTER MATERIALS ===
    "Item_Wool_thread":     "Alpheep thread",
    "Item_chikreeFluff":    "Bluggy fluff",
    "Item_BunnyFur":        "Fur",
    "Item_pelt":            "Hide",

    # === RAW MEATS ===
    "Item_Bluggy_Meat":     "Tough Meat",  # Bluggy = tough in processing
    "Item_Alpheep_Meat":    "Tender Meat",
    "Item_GirtleMeat":      "Rich Meat",
    "Item_chikreeMeat":     "Lean Meat",

    # === PROCESSED MEATS (generic — no critter-specific sprite per meat type) ===
    # Tough meat variants
    "Item_Bluggy_smoke":    "Smoked Tough meat",
    "Item_Bluggy_dried":    "Dried Tough meat",
    "Item_Bluggy_salted":   "Salted Tough meat",
    "Item_Bluggy_oil":      "Tough meat in oil",
    "Item_Bluggy_vinegar":  "Pickled Tough Meat",
    # Tender meat variants
    "Item_Alpheep_smoked":  "Smoked Tender meat",
    "Item_Alpheep_dried":   "Dried Tender meat",
    "Item_Alpheep_salted":  "Salted Tender meat",
    "Item_Alpheep_oil":     "Tender meat in oil",
    "Item_Alpheep_vinegar": "Pickled Tender meat",
    # Rich meat variants
    "Item_Girtle_smoked":   "Smoked Rich meat",
    "Item_Girtle_dried":    "Dried Rich meat",
    "Item_Girtle_salted":   "Salted Rich meat",
    "Item_Girtle_oil":      "Rich meat in Oil",
    "Item_Girtle_vinegar":  "Pickled Rich meat",
    # Lean meat variants
    "item_chikree_smoked":  "Smoked Lean Meat",
    "Item_chikree_dried":   "Dried Lean Meat",
    "item_chikree_salted":  "Salted lean meat",
    "item_chikree_oil":     "Lean meat in Oil",
    "Item_chikree_vinegar": "Pickled lean meat",

    # === SAUSAGE ===
    "Item_Bluggy_Meat":     "Tough Meat",  # duplicate, handled above

    # === TOOLS & EQUIPMENT ===
    "milker":               "Milker",
    "Item_Medicine":        "Medicine",
    "Item_bomb":            "Bomb",

    # === COOKED FOODS ===
    "Cook_GrilledFish":     "Grilled Fish",
    "Cook_GrilledMeat":     "Grilled Meat",
    "Cook_RoastVegetable":  "Grilled Vegetables",
    "Cook_RoastRoot":       "Roast Roots",
    "Cook_salad":           "Salad",
    "Cook_salad_fruit":     "Fruit Salad",

    # === MISC ITEMS ===
    "Item_plantWaste":      "Plant Waste",
    "Item_rottenFood":      "Mush",
    "Item_slimeegg":        "Slime",
    "Item_CritterBiscuit":  "Critters Delight",
    "Item_Bonedust":        "Bonedust",
    "Item_oat_flour":       "Oat Flour",
    "item_maple_flour":     "Mapleseed Flour",
    "item_birch_flour":     "Birchseed Flour",
    "item_acorn_flour":     "Acorn Flour",

    # === FURNITURE — BEDS ===
    "Item_bed_simple_double":   "Simple Double Bed",
    "Item_bed_simple_single":   "Simple Bed",
    "Item_bed_straw":           "Bed of Straw",
    "Item_bed_eastern":         "Eastern Bed",
    "item_bed_pastel":          "Pastel Bed",
    "Item_bed_straw":           "Bed of Straw",
    "Item_bed_wooden":          "Simple Bed",
    "Item_bed_nature":          "Nature bed",
    "Item_bed_noble":           "Noble Bed",
    "Item_bed_castiron":        "Cast Iron bed",
    "item_bed_herbalist":       "Herbalist's Bed",
    "item_bed_hunter":          "Hunter's bed",
    "item_bed_GildedStone":     "Gilded Stone Bed",
    "item_bed_fruit":           "Pineapple Bed",

    # === FURNITURE — BOOKCASES / SHELVES ===
    "Item_bookcase_1x":         "Bookshelf",
    "item_bookshelf_eastern":   "Eastern Bookcase",
    "item_bookcase_pastel":     "Pastel Bookcase",
    "item_bookcase_GildedStone":"Gilded Stone Bookcase",
    "Item_bookcase_wooden":     "Wooden Bookcase",
    "Item_bookcase_nature":     "Nature Bookcase",
    "Item_bookcase_noble":      "Noble Bookcase",
    "Item_bookcase_castiron":   "Cast Iron Bookcase",
    "item_bookshelf_herbalist": "Herbalist Bookcase",
    "item_bookshelf_hunter":    "Hunter's Bookcase",
    "item_bookcase_fruit":      "Pear Bookcase",

    # === FURNITURE — DRESSERS ===
    "Item_dresser_1x":          "Simple Dresser",
    "Item_dresser_2x":          "Large Simple Dresser",

    # === FURNITURE — TABLES ===
    "Item_table":               "Simple Table",
    "Item_table_1x_round":      "Simple Table",
    "Item_table_wooden":        "Simple Table",
    "Item_table_nature":        "Nature Table",
    "Item_table_noble":         "Noble Table",
    "Item_table_castiron":      "Cast Iron Table",
    "item_table_1x_herbalist":  "Herbalist Table",
    "item_table_1x_hunter":     "Hunter's Table",
    "item_table_1x_eastern":    "Eastern Small Table",
    "item_table_1x_GildedStone":"Gilded Stone Small Table",
    "item_table_1x_pastel":     "Pastel End Table",
    "item_table_1x_fruit":      "Orange Table",
    "item_table_2x_eastern":    "Eastern Table",
    "item_table_2x_pastel":     "Pastel Table",
    "item_table_2x_GildedStone":"Gilded Stone Table",
    "item_table_2x_hunter":     "Hunter's Table",
    "item_table_2x_herbalist":  "Herbalist Table",
    "item_table_2x_fruit":      "Watermelon Table",
    "Item_table_nature":        "Nature Table",

    # === FURNITURE — END TABLES ===
    "Item_endTable_noble":      "Noble End Table",
    "Item_endtable_castiron":   "Cast Iron End Table",
    "Item_endTable_nature":     "Nature End Table",

    # === FURNITURE — STOOLS / SEATS ===
    "Item_stool_wooden":        "Wooden Stool",
    "Item_stool_nature_log":    "Log Stool",
    "Item_stool_nature_mushroom":"Mushroom Stool",
    "Item_stool_noble":         "Noble Stool",
    "Item_stool_castiron":      "Cast Iron Stool",
    "Item_stool_hunter":        "Hunter's Stool",
    "Item_stool_herbalist":     "Herbalist Stool",
    "item_stool_eastern":       "Eastern Seat",
    "item_stool_GildedStone":   "Gilded Stone Stool",
    "item_stool_pastel":        "Pastel Stool",
    "item_stool_fruit":         "Fruity Stool",

    # === FURNITURE — RUGS ===
    "Item_rug_nature_2x2":      "Nature Rug",
    "Item_rug_nature_2x1":      "Nature Large Rug",
    "Item_rug_noble_2x2":       "Noble Rug",
    "Item_rug_frill_2x3":       "Basic Large Rug",
    "Item_rug_frill_2x1":       "Basic Rug",
    "Item_rug_castiron_2x3":    "Cast Iron Rug",
    "item_rug_2x2_herbalist":   "Herbalist Rug",
    "item_rug_1x1_hunter":      "Hunter's Rug",
    "item_rug_2x_eastern_vert": "Eastern Vertical Mat",
    "item_rug_2x_eastern_horz": "Eastern Horizontal Mat",
    "Item_rug_1x_eastern":      "Eastern Small Mat",
    "Item_CommunityBlanket":    "Community Rug",

    # === FURNITURE — WINDOWS ===
    "item_window_Wooden":       "Wooden Window",
    "item_window_Noble":        "Noble Window",
    "item_window_Nature":       "Nature Window",
    "item_window_eastern":      "Large Eastern Window",
    "item_window_GildedStone":  "Gilded Stone Window",
    "item_window_fruit":        "Fruity Window",
    "item_window_castiron":     "Cast Iron Window",
    "item_window_Pastel":       "Pastel Window",
    "item_window_Herbalist":    "Large Tree Window",

    # === FURNITURE — PLANTERS ===
    "item_planter_bush_A":      "Bush Planter",
    "item_planter_A":           "Flower Planter A",
    "item_planter_B":           "Flower Planter B",
    "item_planter_C":           "Flower Planter C",

    # === FURNITURE — DECORATIONS ===
    "Item_pottedPlant":         "Spring Flower Pot",
    "Item_Scarecrow":           "Scarecrow",
    "Item_brazier":             "Brazier",
    "Item_Candelabra":          "Candelabra",
    "item_Candelabra":          "Candelabra",
    "item_bonfire":             "Bonfire",
    "item_haybale":             "Hay bale",
    "item_pinwheel":            "Pinwheel",
    "item_fireplace":           "Stone Fireplace",
    "item_hangingHerbs":        "Drying Herbs",
    "item_hangingSunflower":    "Harvest Wreath",
    "item_fireflyLights":       "Firefly Lights",
    "Item_torch":               "Torch",
    "Item_Torch_inv":           "Torch",
    "item_bonsai_cherry":       "Cherry Bonsai",
    "item_summer_wreath":       "Floral Wreath",
    "Item_MinePost":            "Directional Sign Post",
    "Item_FishMount":           "Mounted Fish",
    "item_wicker_alpheep":      "Wicker Alpheep Effigy",
    "item_wicker_Bluggy":       "Wicker Bluggy Effigy",
    "item_painting_cherry":     "Cherry Flower Painting",
    "item_painting_MountainSunrise": "Mountain Sunrise Painting",

    # === CHESTS ===
    "Item_chest":               "Chest",
    "item_chest_double":        "Large Chest",

    # === TORCHES / LIGHTING ===
    "Item_Torch_inv":           "Torch",

    # === SPECIFIC PROCESSED / HONEY ===
    # Honeyed variants (game uses "Honeyed X" display name but "X_honey" sprite)
    "item_strawberry_honey":    "Honeyed Strawberries",
    "item_rhubarb_honey":       "Honeyed Rhubarb",
    "item_raspberry_honey":     "Honeyed Raspberries",
    "Item_cherry_honey":        "Honeyed Cherries",
    "Item_apple_honey":         "Honeyed Apples",
    "item_rosehip_honey":       "Honeyed Rosehips",
    "item_elderberry_honey":    "Honeyed Elderberries",
    "Item_pear_honey":          "Honeyed Pears",
    "item_cranberry_honey":     "Honeyed Cranberries",
    "item_juniper_honey":       "Honeyed Juniper",
    "item_hawthorne_honey":     "Honeyed Hawthorns",
    "item_blackberry_honey":    "Honeyed Blackberries",
    "item_Cantaloupe_honey":    "Honeyed Cantaloupe",
    "item_plum_Honey":          "Honeyed Plums",

    # === DRIED PLUM / ZUCCHINI (special cases) ===
    "item_plum_press":          "Plum Juice",

    # === SALTED SUNFLOWER ===
    "item_Sunflower_roast":     "Salted Sunflower Seeds",

    # === SMOKED SAUSAGE ===
    # No dedicated sprite found — skip

    # === FISH CATEGORY (used as fallback for unrecognised fish) ===
    "Category_fish":            "Fish",

    # === MISC FISHING ITEMS ===
    "Item_worm":                "Worm",
    "Item_bone":                "Bone",
    "Item_blood":               "Blood",
    "Item_Slime":               "Slime",
    "Item_Offal":               "Offal",
    "Item_Fat":                 "Fat",
    "Item_Guano":               "Guano",
    "Item_Sawdust":             "Sawdust",
    "Item_Compost":             "Compost",
    "Item_Shell":               "Shell",
    "Item_feather":             "Feather",

    # === ORES / BARS (existing ones kept for completeness) ===
    "Item_ore_copper":          "Copper Ore",
    "Item_ore_iron":            "Iron Ore",
    "Item_ore_Silver":          "Silver Ore",
    "Item_ore_gold":            "Gold Ore",
    "Item_ore_Tin":             "Tin Ore",
    "Item_ore_Nickel":          "Nickel Ore",
    "Item_ore_Mithril":         "Mithril Ore",
    "Item_ore_Titanium":        "Titanium Ore",
    "Item_bar_gold":            "Gold Bar",
    "Item_bar_iron":            "Iron Bar",
    "Item_bar_Silver":          "Silver Bar",
    "Item_bar_copper":          "Copper Bar",
    "Item_bar_Tin":             "Tin Bar",
    "Item_bar_Nickel":          "Nickel Bar",
    "Item_bar_mithril":         "Mithril Bar",
    "Item_bar_Titanium":        "Titanium Bar",

    # === GEMS ===
    "Item_gem_emerald":         "Emerald",
    "Item_gem_sapphire":        "Sapphire",
    "Item_gem_amethyst":        "Amethyst",
    "Item_gem_ruby":            "Ruby",
    "Item_gem_diamond":         "Diamond",
    "Item_gem_obsidian":        "Obsidian",
    "Item_gem_quartz":          "Quartz",
    "Item_gem_ice":             "Ice Gem",
    "Item_gem_guano":           "Fossil",

    # === MINED STONE ===
    "Item_Mined_Limestone":     "Limestone",
    "Item_Mined_Marble":        "Marble",
    "Item_Mined_Sandstone":     "Sandstone",
    "Item_Mined_Clay":          "Mined Clay",
    "Item_Mined_rocks":         "Stone",
    "Item_Mined_Salt":          "Salt",
    "Item_Mined_Ice":           "Ice Chunk",

    # === WOOD ===
    "Item_wood_Soft":           "Soft Wood",
    "Item_wood_hard":           "Hard Wood",
    "Item_wood_medium":         "Medium Wood",
    "Item_wood_board":          "Plank",

    # === THREAD / LEATHER / HIDE ===
    "Item_Leather":             "Leather",

    # === KIBBLE ===
    "Item_Kibble_0":            "Kibble Nibbles",
    "Item_Kibble_1":            "Happy Kibble",
    "Item_Kibble_2":            "Breeding Kibble",
    "Item_Kibble_Breeding":     "Breeding Kibble",
    "Item_Kibble_Happy":        "Happy Kibble",
    "Item_Kibble_Medicine":     "Medicinal Kibble",
    "Item_CritterBiscuit":      "Critters Delight",

    # === BOTTLES / COLLECTIBLES ===
    "Item_Beer":                "Mead",
    "Item_wineBottle":          "Fruit Wine",

    # === BLUEPRINTS / FOUNDATIONS ===
    "Item_blueprint_barn":      "Barn Foundation",
    "Item_blueprint_coop":      "Coop Foundation",
    "Item_blueprint_hutch":     "Hutch Foundation",
    "Item_blueprint_pen":       "Pen Foundation",
}

copied = []
skipped_exists = []
missing_src = []

for sprite_name, item_display_name in FULL_MAP.items():
    sprite_filename = sprite_name.replace("/", "_").replace("\\", "_") + ".png"
    src = os.path.join(SPRITES_DIR, sprite_filename)
    dest_filename = item_display_name.replace(" ", "_") + ".png"
    dest = os.path.join(OUTPUT_DIR, dest_filename)

    if not os.path.exists(src):
        missing_src.append(f"{sprite_name} ({sprite_filename})")
        continue

    if os.path.exists(dest):
        skipped_exists.append(dest_filename)
        continue

    shutil.copy2(src, dest)
    copied.append(f"{sprite_name} -> {dest_filename}")
    print(f"  COPIED: {sprite_name} -> {dest_filename}")

print(f"\n--- Summary ---")
print(f"Newly copied:           {len(copied)}")
print(f"Already existed:        {len(skipped_exists)}")
print(f"Missing source sprite:  {len(missing_src)}")
if missing_src:
    print(f"\nMissing sprites (no file in extracted_sprites/):")
    for m in missing_src:
        print(f"  {m}")
