"""Dump sample MonoBehaviours from resources.assets to see what fields are readable."""
import UnityPy
import json

RESOURCES_ASSETS = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"

env = UnityPy.load(RESOURCES_ASSETS)

samples = []
field_names = set()

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
        keys = list(tree.keys())
        field_names.update(keys)
        if len(samples) < 5:
            samples.append({"keys": keys, "m_Name": tree.get("m_Name", ""), "preview": {k: str(v)[:80] for k, v in list(tree.items())[:8]}})
    except Exception as e:
        if len(samples) < 5:
            samples.append({"error": str(e)})

print(f"All field names across MonoBehaviours: {sorted(field_names)}")
print(f"\nSample objects:")
for s in samples:
    print(json.dumps(s, indent=2, default=str))
