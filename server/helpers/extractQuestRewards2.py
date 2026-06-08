"""
Scan all .assets files for quest ScriptableObjects with reward data.
"""
import UnityPy
import json
import os

DATA_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
ITEM_MAPS_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"

DONATION_QUEST_IDS = {1323, 518, 863, 864, 865, 866, 1331, 517}

with open(ITEM_MAPS_PATH, "r", encoding="utf-8") as f:
    maps = json.load(f)
item_names = {int(k): v for k, v in maps.get("InventoryItems_en", {}).items()}

assets_files = [f for f in os.listdir(DATA_DIR) if f.endswith(".assets")]
print(f"Found {len(assets_files)} .assets files")

found_quests = {}

for filename in sorted(assets_files):
    filepath = os.path.join(DATA_DIR, filename)
    filesize = os.path.getsize(filepath)
    print(f"\nScanning {filename} ({filesize//1024}KB)...")

    try:
        env = UnityPy.load(filepath)
    except Exception as e:
        print(f"  Failed to load: {e}")
        continue

    quest_found_in_file = 0
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:
            continue

        obj_id = tree.get("ID") or tree.get("Id") or tree.get("id")
        if obj_id is None:
            continue

        # Check for reward-related fields
        has_reward = any(k in tree for k in ["RewardItems", "rewardItems", "RewardMoney", "rewardMoney"])
        if not has_reward:
            continue

        quest_found_in_file += 1

        if obj_id in DONATION_QUEST_IDS:
            name = tree.get("m_Name", "")
            reward_items = tree.get("RewardItems") or tree.get("rewardItems") or []
            reward_money = tree.get("RewardMoney") or tree.get("rewardMoney") or 0
            reward_rel = tree.get("RewardRelationshipPoints") or tree.get("rewardRelationshipPoints") or 0

            print(f"  *** FOUND target quest ID {obj_id} ('{name}') in {filename}")
            print(f"      money={reward_money}, rel_points={reward_rel}")
            print(f"      reward_items ({len(reward_items)}):")
            for ri in reward_items:
                print(f"        {ri}")
            found_quests[obj_id] = {
                "file": filename, "name": name, "reward_money": reward_money,
                "reward_relationship_points": reward_rel, "reward_items_raw": reward_items
            }

    if quest_found_in_file:
        print(f"  Found {quest_found_in_file} objects with reward fields")

print(f"\n\nSummary: found {len(found_quests)} of {len(DONATION_QUEST_IDS)} target quest IDs")
for qid, data in sorted(found_quests.items()):
    print(f"  Quest {qid} ({data['name']}): file={data['file']}")
