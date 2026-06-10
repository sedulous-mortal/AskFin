"""
Probe Grimshire asset files to find item icon sprites.
Scans resources.assets and sharedassets*.assets for Sprite/Texture2D objects
whose names match known item names (e.g. "Rosehip Juice").
"""
import UnityPy
import os
import json

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
OUTPUT_LOG = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\icon_probe_log.txt"

# A sample of processed goods names to search for
TARGETS = {
    "Rosehip Juice", "Carrot Juice", "Strawberry Juice", "Apple Juice",
    "Elderberry Juice", "Cranberry Juice", "Blackberry Juice", "Pear Juice",
    "Dried Rosehips", "Dried Strawberry", "Dried Apple", "Dried Plum",
    "Cooking Oil", "Vinegar", "Cheese", "Butter", "Fruit Wine", "Mead",
    "Honey", "Pickled Cucumbers", "Smoked Peanuts", "Peanut butter",
}

lines = []
found = {}  # name -> {"file": ..., "type": ..., "path_id": ...}

asset_files = [
    os.path.join(GAME_DATA, "resources.assets"),
]
for i in range(33):
    p = os.path.join(GAME_DATA, f"sharedassets{i}.assets")
    if os.path.exists(p):
        asset_files.append(p)

print(f"Scanning {len(asset_files)} asset files...")

for asset_path in asset_files:
    if not os.path.exists(asset_path):
        continue
    fname = os.path.basename(asset_path)
    try:
        env = UnityPy.load(asset_path)
        sprites_found = []
        textures_found = []
        for obj in env.objects:
            if obj.type.name in ("Sprite", "Texture2D"):
                try:
                    data = obj.read()
                    name = getattr(data, "name", "") or ""
                    if obj.type.name == "Sprite":
                        sprites_found.append(name)
                    else:
                        textures_found.append(name)
                    if name in TARGETS:
                        found[name] = {
                            "file": fname,
                            "type": obj.type.name,
                            "path_id": obj.path_id,
                        }
                        print(f"  FOUND: '{name}' ({obj.type.name}) in {fname}")
                except Exception:
                    pass
        if sprites_found or textures_found:
            msg = f"{fname}: {len(sprites_found)} sprites, {len(textures_found)} textures"
            print(msg)
            lines.append(msg)
            # Show first 20 sprite names
            if sprites_found:
                sample = sprites_found[:20]
                lines.append(f"  Sprite sample: {sample}")
                print(f"  Sprite sample: {sample}")
    except Exception as e:
        print(f"  Error loading {fname}: {e}")

print(f"\nFound {len(found)} of {len(TARGETS)} target items:")
for name, info in sorted(found.items()):
    print(f"  {name}: {info}")

with open(OUTPUT_LOG, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
    f.write(f"\n\nFound targets:\n{json.dumps(found, indent=2)}")

print(f"\nLog saved to {OUTPUT_LOG}")
