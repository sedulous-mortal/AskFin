"""
Probe Atlas_InventoryItems SpriteAtlas to list all sprite names,
then cross-reference with known item names to find what we have.
"""
import UnityPy
import json

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
RESOURCES = GAME_DATA + r"\resources.assets"

env = UnityPy.load(RESOURCES)

# Find Atlas_InventoryItems
atlas = None
for obj in env.objects:
    if obj.type.name == "SpriteAtlas":
        tree = obj.read_typetree()
        if tree.get("m_Name") == "Atlas_InventoryItems":
            atlas = tree
            atlas_obj = obj
            break

if not atlas:
    print("Atlas_InventoryItems not found!")
    exit(1)

print("=== Atlas_InventoryItems ===")
print(f"Keys: {list(atlas.keys())}")

# m_PackedSpriteNamesToIndex: list of sprite names in order
names = atlas.get("m_PackedSpriteNamesToIndex", [])
print(f"\nTotal packed sprites: {len(names)}")
print(f"\nFirst 50 sprite names: {names[:50]}")
print(f"\nAll sprite names:")
for i, name in enumerate(names):
    print(f"  [{i}] {name}")
