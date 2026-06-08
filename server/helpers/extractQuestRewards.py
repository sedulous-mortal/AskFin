"""
Extract item rewards for specific donation quests from resources.assets.
Donation quest IDs: 1323 (30), 518 (50), 863 (75), 864 (100), 865 (125), 866 (148)
"""
import UnityPy
import json

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
ITEM_MAPS_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"

DONATION_QUEST_IDS = {1323, 518, 863, 864, 865, 866}

with open(ITEM_MAPS_PATH, "r", encoding="utf-8") as f:
    maps = json.load(f)
item_names = {int(k): v for k, v in maps.get("InventoryItems_en", {}).items()}

print(f"Loaded {len(item_names)} item names")
print(f"Loading {ASSETS_FILE} ...")

env = UnityPy.load(ASSETS_FILE)

print("Scanning for Quest MonoBehaviours...")

found = {}
all_quest_like = []

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
    except Exception:
        continue

    # Look for objects that have an ID field matching our quest IDs
    obj_id = tree.get("ID") or tree.get("Id") or tree.get("id")
    if obj_id is None:
        continue

    # Also log any object that has RewardItems
    reward_items = tree.get("RewardItems") or tree.get("rewardItems")
    reward_money = tree.get("RewardMoney") or tree.get("rewardMoney")
    name = tree.get("m_Name", "")

    if reward_items is not None or reward_money is not None:
        all_quest_like.append({
            "id": obj_id,
            "name": name,
            "reward_money": reward_money,
            "reward_items_raw": reward_items,
        })

    if obj_id in DONATION_QUEST_IDS:
        print(f"\n=== Found quest ID {obj_id} ('{name}') ===")
        print(json.dumps(tree, indent=2, default=str))
        found[obj_id] = tree

print(f"\n\nFound {len(found)} of {len(DONATION_QUEST_IDS)} target quests by exact ID match.")
print(f"Found {len(all_quest_like)} total objects with reward fields.")

if not found and all_quest_like:
    print("\nSample of quest-like objects (first 10):")
    for q in all_quest_like[:10]:
        print(f"  id={q['id']}, name={q['name']}, reward_money={q['reward_money']}, reward_items_raw type={type(q['reward_items_raw'])}")

# Show all quest-like objects sorted by id
print("\nAll quest-like objects:")
for q in sorted(all_quest_like, key=lambda x: int(x["id"]) if str(x["id"]).isdigit() else 0):
    rid = q.get("reward_items_raw")
    ri_summary = len(rid) if isinstance(rid, list) else rid
    print(f"  id={q['id']}, name={q['name']}, money={q['reward_money']}, items={ri_summary}")
