"""
Scan all MonoBehaviours in resources.assets and:
1. Find any with game_id between 519 and 862 (the gap between known Donate30=518 and Donate75=863)
2. Also look for any named DonationQuest*, ResearchQuest*, etc.
3. Dump the m_Name and game_id for candidates.
"""
import UnityPy
import struct

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"

env = UnityPy.load(ASSETS_FILE)
mb_objects = [obj for obj in env.objects if obj.type.name == "MonoBehaviour"]
print(f"Total MonoBehaviours: {len(mb_objects)}")

print("\n=== All MonoBehaviours with their m_Name and parsed game_id ===")
all_quests = []
for obj in mb_objects:
    try:
        raw = obj.get_raw_data()
    except Exception:
        continue
    if not raw or len(raw) < 0x40:
        continue

    # Parse m_Name (at offset 0x1c: 4-byte length, then string)
    name_len = struct.unpack_from("<i", raw, 0x1c)[0]
    if name_len <= 0 or name_len > 200:
        continue
    try:
        m_name = raw[0x20:0x20 + name_len].decode("utf-8", errors="replace")
    except Exception:
        continue

    padded = (name_len + 3) & ~3
    game_id_off = 0x1c + 4 + padded
    if game_id_off + 4 > len(raw):
        continue
    game_id = struct.unpack_from("<i", raw, game_id_off)[0]

    # Check if this looks quest-related or has an ID in our range of interest
    is_quest_name = any(kw in m_name for kw in ["Quest", "Donation", "Research", "Donate"])
    in_gap = 519 <= game_id <= 862

    if is_quest_name or in_gap:
        all_quests.append((game_id, obj.path_id, m_name, len(raw)))

all_quests.sort(key=lambda x: x[0])
for game_id, path_id, m_name, size in all_quests:
    print(f"  game_id={game_id:6d}  path_id={path_id:8d}  size={size:6d}  name='{m_name}'")

print(f"\nTotal candidates: {len(all_quests)}")

# Also specifically search for IDs 519, 520 which would be the natural next values after 518
print("\n=== Looking for game_ids 519 and 520 specifically ===")
for obj in mb_objects:
    try:
        raw = obj.get_raw_data()
    except Exception:
        continue
    if not raw or len(raw) < 0x40:
        continue
    for target_id in [519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530]:
        name_len = struct.unpack_from("<i", raw, 0x1c)[0]
        if name_len <= 0 or name_len > 200:
            continue
        padded = (name_len + 3) & ~3
        game_id_off = 0x1c + 4 + padded
        if game_id_off + 4 > len(raw):
            continue
        game_id = struct.unpack_from("<i", raw, game_id_off)[0]
        if game_id == target_id:
            m_name = raw[0x20:0x20 + name_len].decode("utf-8", errors="replace")
            print(f"  FOUND game_id={target_id}: path_id={obj.path_id}, m_name='{m_name}', size={len(raw)}")
            break
