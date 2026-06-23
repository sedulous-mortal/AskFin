import UnityPy
from collections import Counter

# Check sharedassets1 (7.6 MB) - might have ScriptableObjects with type info
for fname in [
    r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\sharedassets1.assets",
    r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\sharedassets0.assets",
]:
    print(f"\n=== {fname.split(chr(92))[-1]} ===")
    env = UnityPy.load(fname)
    type_counts = Counter(obj.type.name for obj in env.objects)
    for t, c in type_counts.most_common(20):
        print(f"  {t}: {c}")

    # Try reading MonoBehaviours
    found = 0
    for obj in env.objects:
        if obj.type.name == "MonoBehaviour":
            try:
                tree = obj.read_typetree()
                keys = list(tree.keys())
                if "Id" in keys or "decayRate" in keys or "smokerResult" in keys:
                    print(f"  MATCH path_id={obj.path_id}: keys={keys[:20]}")
                    found += 1
                    if found >= 3:
                        break
            except Exception as e:
                pass
    if found == 0:
        print("  No MonoBehaviours with Id/decayRate/smokerResult found")
