"""
Inventory what types of objects are in resources.assets and what text/json assets exist.
Also scan level files for MonoBehaviours with ID+reward fields.
"""
import UnityPy
import json
import os
from collections import Counter

DATA_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"

# First check what types are in resources.assets
print("=== resources.assets type inventory ===")
env = UnityPy.load(os.path.join(DATA_DIR, "resources.assets"))
type_counter = Counter()
text_assets = []
mb_names = []

for obj in env.objects:
    type_counter[obj.type.name] += 1
    if obj.type.name == "TextAsset":
        try:
            ta = obj.read()
            text_assets.append(ta.m_Name)
        except Exception:
            pass
    if obj.type.name == "MonoBehaviour":
        try:
            tree = obj.read_typetree()
            name = tree.get("m_Name", "")
            if name:
                mb_names.append(name)
        except Exception:
            pass

print(f"Types: {dict(type_counter.most_common(20))}")
print(f"\nTextAssets ({len(text_assets)}): {text_assets[:30]}")
print(f"\nMonoBehaviour names sample: {mb_names[:30]}")

# Search text assets for quest-related content
print("\n=== Searching TextAssets for quest/reward keywords ===")
for obj in env.objects:
    if obj.type.name != "TextAsset":
        continue
    try:
        ta = obj.read()
        text = ""
        try:
            text = ta.m_Script.decode("utf-8", errors="replace")
        except Exception:
            try:
                text = str(ta.m_Script)
            except Exception:
                continue

        if any(kw in text for kw in ["RewardItems", "rewardItems", "donation", "Donation", "Donate", "1323", "donationAmountRequired"]):
            print(f"\n  TextAsset '{ta.m_Name}' contains quest keywords!")
            print(f"  First 500 chars: {text[:500]}")
    except Exception as e:
        pass

# Quick scan of the largest level file for quest-like MonoBehaviours
print("\n=== Scanning level9 (largest) for quest MonoBehaviours ===")
env2 = UnityPy.load(os.path.join(DATA_DIR, "level9"))
quest_like = []
for obj in env2.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
    except Exception:
        continue

    obj_id = tree.get("ID") or tree.get("Id") or tree.get("id")
    has_reward = any(k in tree for k in ["RewardItems", "rewardItems", "RewardMoney", "rewardMoney", "donationAmountRequired"])

    if has_reward:
        quest_like.append((obj_id, tree.get("m_Name", ""), list(tree.keys())[:10]))

print(f"Found {len(quest_like)} quest-like objects in level9")
for item in quest_like[:10]:
    print(f"  id={item[0]}, name={item[1]}, keys={item[2]}")
