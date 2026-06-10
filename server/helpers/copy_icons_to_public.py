"""
Copy extracted sprites to client/public/items/ using display name -> filename convention.
Reads sprite_to_item.json mapping, copies and renames files.
Skips files that already exist.
"""
import json
import os
import shutil

SPRITES_DIR = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\extracted_sprites"
MAPPING_FILE = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\sprite_to_item.json"
OUTPUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"

with open(MAPPING_FILE, encoding="utf-8") as f:
    data = json.load(f)

sprite_to_item = data["sprite_to_item"]

copied = []
skipped = []
missing_sprite = []

for sprite_name, item_display_name in sprite_to_item.items():
    # Source: extracted sprite file
    sprite_filename = sprite_name.replace("/", "_").replace("\\", "_") + ".png"
    src = os.path.join(SPRITES_DIR, sprite_filename)

    # Destination: item display name with spaces -> underscores
    dest_filename = item_display_name.replace(" ", "_") + ".png"
    dest = os.path.join(OUTPUT_DIR, dest_filename)

    if not os.path.exists(src):
        print(f"  MISSING source: {sprite_name} -> {sprite_filename}")
        missing_sprite.append(sprite_name)
        continue

    if os.path.exists(dest):
        skipped.append(dest_filename)
        continue

    shutil.copy2(src, dest)
    copied.append(f"{sprite_name} -> {dest_filename}")
    print(f"  COPIED: {sprite_name} -> {dest_filename}")

print(f"\nCopied: {len(copied)}")
print(f"Skipped (already exist): {len(skipped)}")
print(f"Missing source sprites: {len(missing_sprite)}")
if missing_sprite:
    print(f"  Missing: {missing_sprite}")
if skipped:
    print(f"  Skipped: {skipped[:20]}{'...' if len(skipped) > 20 else ''}")
