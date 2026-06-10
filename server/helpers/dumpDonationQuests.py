"""
Dump all DonationQuest objects to see what specimen counts they contain,
and resolve any linked quest references.
"""
import UnityPy
import struct
import json

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
ITEM_MAPS_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"

with open(ITEM_MAPS_PATH, "r", encoding="utf-8") as f:
    maps = json.load(f)
item_names = {int(k): v for k, v in maps.get("InventoryItems_en", {}).items()}

env = UnityPy.load(ASSETS_FILE)

DONATION_QUEST_PATH_IDS = {
    517: 26339,  # DonationQuest1
    518: 26340,  # DonationQuest2
    863: 26341,  # DonationQuest3
    864: 26342,  # DonationQuest4
    865: 26343,  # DonationQuest5
    866: 26344,  # DonationQuest6
}

# Also add 1323 and check if there are more DonationQuest objects
ALSO_CHECK = [1323]

print("=== DonationQuest Objects — Full Hex Dumps ===\n")

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        raw = obj.get_raw_data()
    except Exception:
        continue
    if not raw or len(raw) < 0x40:
        continue

    name_len = struct.unpack_from("<i", raw, 0x1c)[0]
    if name_len <= 0 or name_len > 200:
        continue
    m_name = raw[0x20:0x20+name_len].decode("utf-8", errors="replace")
    padded = (name_len + 3) & ~3
    game_id_off = 0x1c + 4 + padded
    game_id = struct.unpack_from("<i", raw, game_id_off)[0] if game_id_off + 4 <= len(raw) else 0

    if not (m_name.startswith("DonationQuest") or game_id in ALSO_CHECK):
        continue

    print(f"=== {m_name}  game_id={game_id}  path_id={obj.path_id}  size={len(raw)} ===")
    for row_start in range(0, min(512, len(raw)), 16):
        row = raw[row_start:row_start+16]
        hex_row = " ".join(f"{b:02x}" for b in row)
        ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
        print(f"  {row_start:04x}: {hex_row:<47}  {ascii_row}")
    print()

print("Done.")
