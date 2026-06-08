"""
Extract item sprite PNGs from Grimshire's Unity resources.assets.

Uses an explicit canonical-name → sprite-name map so we're not guessing
from name similarity. Saves PNGs to client/public/items/{Canonical_Name}.png
(spaces replaced with underscores, matching how ItemIcon builds its src path).

Usage:
    python extractItemSprites.py [--dry-run]
"""
import os
import sys
import UnityPy

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
OUT_DIR     = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"
DRY_RUN     = "--dry-run" in sys.argv

# canonical item name  →  internal sprite name
SPRITE_MAP = {
    # ── Materials / crafting resources ──────────────────────────────────────
    "Stone":                  "Item_Mined_rocks",
    "Plant Debris":           "Item_plantWaste",
    "Compost":                "Item_Compost",
    "Stick":                  "Item_Stick",
    "Hard Wood":              "Item_wood_hard",
    "Medium Wood":            "Item_wood_medium",
    "Soft Wood":              "Item_wood_Soft",
    "Clay":                   "Item_Mined_Clay",
    "Plank":                  "Item_wood_board",
    "Charcoal":               "Item_Charcoal",
    "Sawdust":                "Item_Sawdust",
    "Bone":                   "Item_bone",
    "Honey":                  "Item_Honey_normal",
    "Guano":                  "Item_Guano",
    "Shell":                  "Item_Shell",
    "Slime":                  "Item_Slime",
    "Fat":                    "Item_Fat",
    "Blood":                  "Item_blood",
    "Offal":                  "Item_Offal",
    "Pelt":                   "Item_pelt",
    "Leather":                "Item_Leather",
    "Feather":                "Item_feather",
    "Egg":                    "Item_Egg",
    "Milk":                   "Item_Milk",
    "Wool":                   "Item_Wool",
    "Worm":                   "Item_worm",
    # ── Metal bars ──────────────────────────────────────────────────────────
    "Iron Bar":               "Item_bar_iron",
    "Copper Bar":             "Item_bar_copper",
    "Nickel Bar":             "Item_bar_Nickel",
    "Titanium Bar":           "Item_bar_Titanium",
    "Silver Bar":             "Item_bar_Silver",
    "Gold Bar":               "Item_bar_gold",
    "Tin Bar":                "Item_bar_Tin",
    # ── Ores ────────────────────────────────────────────────────────────────
    "Iron Ore":               "Item_ore_iron",
    "Copper Ore":             "Item_ore_copper",
    "Nickel Ore":             "Item_ore_Nickel",
    "Titanium Ore":           "Item_ore_Titanium",
    "Silver Ore":             "Item_ore_Silver",
    "Gold Ore":               "Item_ore_gold",
    "Tin Ore":                "Item_ore_Tin",
    "Mithril Ore":            "Item_ore_Mithril",
    # ── Mined materials ─────────────────────────────────────────────────────
    "Mined Clay":             "Item_Mined_Clay",
    "Limestone":              "Item_Mined_Limestone",
    "Marble":                 "Item_Mined_Marble",
    "Sandstone":              "Item_Mined_Sandstone",
    "Salt":                   "Item_Mined_Salt",
    "Ice":                    "Item_Mined_Ice",
    # ── Animal products ─────────────────────────────────────────────────────
    "Kibble Nibbles":         "Item_Kibble_0",
    "Breeding Kibble":        "Item_Kibble_Breeding",
    "Happy Kibble":           "Item_Kibble_Happy",
    "Medicinal Kibble":       "Item_Kibble_Medicine",
    # ── Crafting stations (donation quest rewards) ───────────────────────────
    "Smoking hut":            "Item_station_SmokeHouse",
    "Mushroom Log":           "Item_station_MushroomLog",
    "Kiln":                   "Item_station_Kiln",
    "Fermentation Barrel":    "Item_station_FermentationBarrel",
    "Press":                  "Item_Station_press",
    "Seed Maker":             "Item_station_seedmaker",
    "Icebox":                 "Item_station_Icebox",
    "Crafting Table":         "Item_station_Crafting",
    "Cooking Station":        "Item_station_Cooking",
    "Smelter":                "Item_station_Forge",
    "Spinning Wheel":         "Item_station_spinningWheel",
    "Butcher Table":          "Item_station_ButcherTable",
    "Dry Rack":               "Item_station_dryingRack",
    "Chisel":                 "Item_station_Chisel",
    "Saw":                    "Item_station_Saw",
    # ── Water infrastructure ─────────────────────────────────────────────────
    "Copper Water Pump":      "Irrigation1_Pump_off",
    "Iron Water Pump":        "Irrigation2_Pump_off",
    "Titanium Water Pump":    "Irrigation3_Pump_off",
    "Irrigation pipe":        "Item_pipe_basic",
    # ── Fish (generic categories, actual fish use the forageables folder) ────
    # ── Gems ────────────────────────────────────────────────────────────────
    "Amethyst":               "Item_gem_amethyst",
    "Diamond":                "Item_gem_diamond",
    "Emerald":                "Item_gem_emerald",
    "Obsidian":               "Item_gem_obsidian",
    "Quartz":                 "Item_gem_quartz",
    "Ruby":                   "Item_gem_ruby",
    "Sapphire":               "Item_gem_sapphire",
}

# Build map: sprite_name → list of canonical names (handles duplicates)
sprite_to_canonicals: dict[str, list[str]] = {}
for canonical, sprite in SPRITE_MAP.items():
    sprite_to_canonicals.setdefault(sprite, []).append(canonical)

if not DRY_RUN:
    os.makedirs(OUT_DIR, exist_ok=True)

print(f"Loading {ASSETS_FILE} ...")
env = UnityPy.load(ASSETS_FILE)

saved, skipped, errors = 0, 0, 0

for obj in env.objects:
    if obj.type.name != "Sprite":
        continue
    try:
        data = obj.read()
    except Exception:
        continue

    sprite_name = getattr(data, "m_Name", None) or ""
    canonicals = sprite_to_canonicals.get(sprite_name)
    if not canonicals:
        continue

    for canonical in canonicals:
        out_filename = canonical.replace(" ", "_") + ".png"
        out_path = os.path.join(OUT_DIR, out_filename)

        if DRY_RUN:
            print(f"  WOULD SAVE  {canonical!r:35s}  <- sprite '{sprite_name}'  -> {out_filename}")
            skipped += 1
        else:
            try:
                data.image.save(out_path)
                print(f"  SAVED  {out_path}")
                saved += 1
            except Exception as e:
                print(f"  ERROR  {canonical!r}: {e}")
                errors += 1

print(f"\n{'DRY RUN' if DRY_RUN else 'DONE'}  —  "
      f"{'would extract' if DRY_RUN else 'saved'}: {saved or skipped}, "
      f"errors: {errors}")
