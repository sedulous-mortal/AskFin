"""
Resolve InventoryItem pathIDs 25648 (0x6430) and 25652 (0x6434) to game item IDs.
InventoryItem extends BaseScriptableObject, so the Id field is after m_Name.
"""
import UnityPy
import struct
import json

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
ITEM_MAPS_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"

TARGET_PATH_IDS = {25648, 25652}

with open(ITEM_MAPS_PATH, "r", encoding="utf-8") as f:
    maps = json.load(f)
item_names = {int(k): v for k, v in maps.get("InventoryItems_en", {}).items()}

env = UnityPy.load(ASSETS_FILE)

# The header structure for a MonoBehaviour in resources.assets appears to be:
# 0x00-0x0b: m_Script PPtr (12 bytes, zeros for stripped refs)
# 0x0c-0x0f: 01 00 00 00 (padding/version?)
# 0x10-0x1b: another PPtr (12 bytes, actual m_Script ref)
# 0x1c: m_Name string (length prefix + data + padding)
# After m_Name: BaseScriptableObject.Id (int32)
# So header before Id = 0x1c + 4 + len(padded_name)

def read_string_at(data, offset):
    if offset + 4 > len(data): return None, offset
    length = struct.unpack_from("<i", data, offset)[0]
    if length < 0 or length > 1000 or offset + 4 + length > len(data): return None, offset
    s = data[offset+4:offset+4+length].decode("utf-8", errors="replace")
    padded = (length + 3) & ~3
    return s, offset + 4 + padded

def read_int_at(data, offset):
    if offset + 4 > len(data): return None
    return struct.unpack_from("<i", data, offset)[0]

for obj in env.objects:
    if obj.path_id not in TARGET_PATH_IDS:
        continue
    if obj.type.name != "MonoBehaviour":
        print(f"path_id={obj.path_id}: type={obj.type.name}")
        continue

    try:
        raw = obj.get_raw_data()
    except Exception as e:
        print(f"path_id={obj.path_id}: Failed to get raw data: {e}")
        continue

    print(f"\n=== path_id={obj.path_id}, size={len(raw)}, type={obj.type.name} ===")

    # Hex dump first 128 bytes
    print("First 128 bytes:")
    for row_start in range(0, min(128, len(raw)), 16):
        row = raw[row_start:row_start+16]
        hex_row = " ".join(f"{b:02x}" for b in row)
        ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
        print(f"  {row_start:04x}: {hex_row:<47}  {ascii_row}")

    # Parse: skip 0x1c bytes of header, then read m_Name string, then Id
    header_size = 0x1c
    m_name, after_name = read_string_at(raw, header_size)
    print(f"\n  m_Name: '{m_name}' (offset {header_size}, next offset {after_name})")

    if after_name is not None:
        game_id = read_int_at(raw, after_name)
        print(f"  Game ID (BaseScriptableObject.Id): {game_id}")
        if game_id is not None and game_id in item_names:
            print(f"  Item name: '{item_names[game_id]}'")
        else:
            print(f"  Item name: NOT FOUND in item_names map (ID={game_id})")

    # Also try offset 0x30 (same as quests used)
    game_id_at_30 = read_int_at(raw, 0x30)
    print(f"\n  Value at offset 0x30: {game_id_at_30}")
    if game_id_at_30 is not None and game_id_at_30 in item_names:
        print(f"  Item name at 0x30: '{item_names[game_id_at_30]}'")
