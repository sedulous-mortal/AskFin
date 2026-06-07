"""
Diagnose what Unity object types sit at the item path IDs referenced in quest dumps.
Run: python server/helpers/diagItemPaths.py
"""
import json, os, UnityPy

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
QUESTS_DIR = r"C:\Users\ansob\claude-tests\AskFin\quests"

# Collect all path IDs referenced in quest dumps
target_pids = set()
for fname in os.listdir(QUESTS_DIR):
    if not fname.endswith(".json"):
        continue
    with open(os.path.join(QUESTS_DIR, fname), encoding="utf-8") as f:
        data = json.load(f)
    for field in ("requirements", "rewardItems"):
        for entry in (data.get(field, {}).get("Array") or []):
            pid = entry.get("item", {}).get("m_PathID", 0)
            if pid:
                target_pids.add(int(pid))

print(f"Unique item path IDs referenced in quests: {len(target_pids)}")
print(f"Sample: {sorted(target_pids)[:10]}")

env = UnityPy.load(RESOURCES)
pid_to_obj = {obj.path_id: obj for obj in env.objects}

print("\n--- Object info for each referenced path ID ---")
for pid in sorted(target_pids):
    obj = pid_to_obj.get(pid)
    if obj is None:
        print(f"  {pid}: NOT FOUND in resources.assets")
        continue
    type_name = obj.type.name
    try:
        d = obj.read()
        m_name = getattr(d, "m_Name", "") or ""
    except Exception as e:
        m_name = f"<read error: {e}>"
    print(f"  path_id={pid}  type={type_name!r}  m_Name={m_name!r}")
