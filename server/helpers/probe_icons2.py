"""
Deeper probe: read typetrees of Sprite objects in resources.assets
to see how sprite names/metadata are structured.
Also look for MonoBehaviour objects that might map sprite IDs to item IDs.
"""
import UnityPy
import json

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
RESOURCES = GAME_DATA + r"\resources.assets"

env = UnityPy.load(RESOURCES)

print("=== Object type counts in resources.assets ===")
from collections import Counter
type_counts = Counter(obj.type.name for obj in env.objects)
for t, count in type_counts.most_common(20):
    print(f"  {t}: {count}")

print("\n=== Sampling Sprite objects (first 10 with typetree) ===")
count = 0
for obj in env.objects:
    if obj.type.name == "Sprite" and count < 10:
        try:
            tree = obj.read_typetree()
            name = tree.get("m_Name", "")
            # Show the top-level keys and m_Name
            keys = list(tree.keys())[:15]
            print(f"  path_id={obj.path_id}, name='{name}', keys={keys}")
            count += 1
        except Exception as e:
            print(f"  Error: {e}")

print("\n=== Sampling Texture2D objects (first 10 with name) ===")
count = 0
for obj in env.objects:
    if obj.type.name == "Texture2D" and count < 10:
        try:
            tree = obj.read_typetree()
            name = tree.get("m_Name", "")
            print(f"  path_id={obj.path_id}, name='{name}'")
            count += 1
        except Exception as e:
            print(f"  Error: {e}")

print("\n=== Sampling MonoBehaviour objects (first 20 names) ===")
count = 0
for obj in env.objects:
    if obj.type.name == "MonoBehaviour" and count < 20:
        try:
            tree = obj.read_typetree()
            name = tree.get("m_Name", "")
            if name:
                print(f"  path_id={obj.path_id}, name='{name}'")
                count += 1
        except Exception as e:
            pass

print("\n=== Looking for SpriteAtlas objects ===")
for obj in env.objects:
    if obj.type.name == "SpriteAtlas":
        try:
            tree = obj.read_typetree()
            name = tree.get("m_Name", "")
            print(f"  SpriteAtlas: '{name}', path_id={obj.path_id}")
            keys = list(tree.keys())[:10]
            print(f"    keys: {keys}")
        except Exception as e:
            print(f"  Error: {e}")
