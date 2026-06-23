import UnityPy
from collections import Counter

RESOURCES_ASSET = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"

env = UnityPy.load(RESOURCES_ASSET)

type_counts = Counter(obj.type.name for obj in env.objects)
print("Object types in resources.assets:")
for t, c in type_counts.most_common(30):
    print(f"  {t}: {c}")

# Sample a few MonoBehaviours and look at top-level keys
print("\nSample MonoBehaviour top-level keys (first 5):")
count = 0
for obj in env.objects:
    if obj.type.name == "MonoBehaviour" and count < 5:
        try:
            tree = obj.read_typetree()
            print(f"  path_id={obj.path_id}: keys={list(tree.keys())[:15]}")
            count += 1
        except Exception as e:
            print(f"  path_id={obj.path_id}: ERROR {e}")

# Sample a few ScriptableObjects too
print("\nSample ScriptableObject top-level keys (first 5):")
count = 0
for obj in env.objects:
    if "Script" in obj.type.name and count < 5:
        try:
            tree = obj.read_typetree()
            print(f"  type={obj.type.name} path_id={obj.path_id}: keys={list(tree.keys())[:15]}")
            count += 1
        except Exception as e:
            print(f"  type={obj.type.name} path_id={obj.path_id}: ERROR {e}")

# Look for anything with "Id" or "decay" in keys
print("\nFirst 5 objects containing 'Id' or 'decayRate' field:")
count = 0
for obj in env.objects:
    if count >= 5:
        break
    try:
        tree = obj.read_typetree()
        if "Id" in tree or "decayRate" in tree:
            print(f"  type={obj.type.name} path_id={obj.path_id}: keys={list(tree.keys())[:20]}")
            count += 1
    except Exception:
        continue
