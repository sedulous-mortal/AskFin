"""
Extract villager portrait PNGs from Grimshire's Unity resources.assets.

Usage:
    python extractVillagerSprites.py [--scan]   # scan mode: list matching sprite names
    python extractVillagerSprites.py             # extract mode: save PNGs
"""
import os
import sys
import UnityPy

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
OUT_DIR     = r"C:\Users\ansob\claude-tests\AskFin\client\public\villagers"
SCAN_ONLY   = "--scan" in sys.argv

# Villager display name → expected internal sprite name pattern
# We'll try both the exact map below AND a fuzzy scan for anything matching "NPC_" or villager first names.
VILLAGER_MAP = {
    # Romanceable – Bachelorettes
    "Adeline":  "UI_Map_Head_Adeline",
    "Beryl":    "UI_Map_Head_Beryl",
    "Hazel":    "UI_Map_Head_Hazel",
    "Lila":     "UI_Map_Head_Lila",
    "Rose":     "UI_Map_Head_Rose",
    # Romanceable – Bachelors
    "Kai":      "UI_Map_Head_Kai",
    "Logan":    "UI_Map_Head_Logan",
    "Oliver":   "UI_Map_Head_Oliver",
    "Percy":    "UI_Map_Head_Percy",
    # Tano not found in assets — may be future DLC
    # Non-romanceable
    "Beatrix":  "UI_Map_Head_Beatrix",
    "Dudley":   "UI_Map_Head_Dudley",
    "Edgar":    "UI_Map_Head_Edgar_priest",
    "Ericka":   "UI_Map_Head_Ericka",
    "Fin":      "UI_Map_Head_Fin_trader",
    "Greta":    "UI_Map_Head_Greta",
    "Gruff":    "UI_Map_Head_Gruff",
    "Jack":     "UI_Map_Head_Jack",
    "Poppy":    "UI_Map_Head_Poppy",
    "Prudence": "UI_Map_Head_Prudence",
    "Rowan":    "UI_Map_Head_Rowan",
    "Rufus":    "UI_Map_Head_Rufus",
    "Rusty":    "UI_Map_Head_Rusty",
    "Theo":     "UI_Map_Head_Theo",
    "Wallace":  "UI_Map_Head_Wallace",
    "Wilfred":  "UI_Map_Head_Wilfred",
    "Willow":   "UI_Map_Head_Willow",
}

sprite_to_villager = {v: k for k, v in VILLAGER_MAP.items()}

print(f"Loading {ASSETS_FILE} ...")
env = UnityPy.load(ASSETS_FILE)

if SCAN_ONLY:
    print("\n--- All Sprite names containing 'NPC' or villager first names ---")
    villager_names_lower = {v.lower() for v in VILLAGER_MAP.keys()}
    for obj in env.objects:
        if obj.type.name != "Sprite":
            continue
        try:
            data = obj.read()
        except Exception:
            continue
        name = getattr(data, "m_Name", "") or ""
        if "NPC" in name or any(n in name.lower() for n in villager_names_lower):
            print(f"  {name}")
    print("\n--- Done scanning ---")
    sys.exit(0)

# Extract mode
os.makedirs(OUT_DIR, exist_ok=True)
saved, skipped, errors = 0, 0, 0

# Also collect all sprite names for fuzzy fallback reporting
found_sprites = {}
for obj in env.objects:
    if obj.type.name != "Sprite":
        continue
    try:
        data = obj.read()
    except Exception:
        continue
    name = getattr(data, "m_Name", "") or ""
    found_sprites[name] = (obj, data)

print(f"\nTotal sprites found: {len(found_sprites)}")
print("\n--- Extracting villager portraits ---")

for villager, sprite_name in VILLAGER_MAP.items():
    out_path = os.path.join(OUT_DIR, f"{villager}.png")
    if sprite_name in found_sprites:
        _, data = found_sprites[sprite_name]
        try:
            data.image.save(out_path)
            print(f"  SAVED  {villager}.png  <- {sprite_name}")
            saved += 1
        except Exception as e:
            print(f"  ERROR  {villager}: {e}")
            errors += 1
    else:
        # Try partial match
        matches = [s for s in found_sprites if villager.lower() in s.lower()]
        if matches:
            print(f"  SKIP   {villager} — sprite '{sprite_name}' not found; similar: {matches}")
        else:
            print(f"  MISS   {villager} — no sprite named '{sprite_name}' found")
        skipped += 1

print(f"\nDONE — saved: {saved}, skipped/missing: {skipped}, errors: {errors}")
