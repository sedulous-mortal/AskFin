"""
Find Quest "Donate 30 Specimens" by searching for its display title text in MonoBehaviours.
Also resolve any reward item pathIDs found.
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

TARGET_TEXT = b"Donate 30 Specimens"
print(f"Scanning for '{TARGET_TEXT.decode()}'...")

def find_quest_game_id(raw):
    """Try to find the game ID by looking for pattern right after the m_Name string."""
    # Header is 0x1c bytes, then string: length (4 bytes) + data + padding
    if len(raw) < 0x40:
        return None, None
    name_len = struct.unpack_from("<i", raw, 0x1c)[0]
    if name_len <= 0 or name_len > 100:
        return None, None
    padded = (name_len + 3) & ~3
    game_id_off = 0x1c + 4 + padded
    if game_id_off + 4 > len(raw):
        return None, None
    game_id = struct.unpack_from("<i", raw, game_id_off)[0]
    m_name = raw[0x20:0x20+name_len].decode("utf-8", errors="replace")
    return game_id, m_name

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        raw = obj.get_raw_data()
    except Exception:
        continue
    if not raw or TARGET_TEXT not in raw:
        continue

    game_id, m_name = find_quest_game_id(raw)
    print(f"\n=== path_id={obj.path_id}, size={len(raw)} ===")
    print(f"  m_Name='{m_name}', game_id={game_id}")

    # Full hex dump first 320 bytes
    print("Hex dump (first 320 bytes):")
    for row_start in range(0, min(320, len(raw)), 16):
        row = raw[row_start:row_start+16]
        hex_row = " ".join(f"{b:02x}" for b in row)
        ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
        print(f"  {row_start:04x}: {hex_row:<47}  {ascii_row}")

    # Try to read reward data at offset 0x110 (works for 14-char name quests)
    # But for a different name length we need to adjust
    if m_name:
        name_padded = (len(m_name) + 3) & ~3
        # Compute offsets based on actual name length
        # After ID (4): display_title string
        id_off = 0x1c + 4 + name_padded
        # displayTitle offset
        dt_off = id_off + 4
        dt_len = struct.unpack_from("<i", raw, dt_off)[0] if dt_off+4 <= len(raw) else 0
        dt_padded = (dt_len + 3) & ~3 if dt_len > 0 else 0
        dt_text = raw[dt_off+4:dt_off+4+dt_len].decode("utf-8", errors="replace") if dt_len > 0 else ""
        print(f"\n  displayTitle: '{dt_text}' (len={dt_len}, padded={dt_padded})")

        # Compute reward offsets dynamically - this is complex, let's just look at nearby data
        # Instead, let me search for reward items by looking at what's between the two descriptions
        # The rewardRelationshipPoints should be 14 (0x0e or 0x14 depending on the quest)
        print(f"\n  Searching for reward data...")
        for off in range(0x80, min(0x200, len(raw)-16), 4):
            val = struct.unpack_from("<i", raw, off)[0]
            if val == 20:  # rewardRelationshipPoints = 20
                next_val = struct.unpack_from("<i", raw, off+4)[0]
                if 0 <= next_val <= 5:  # rewardItems count
                    print(f"  Possible rewardRelPoints=20 at 0x{off:x}, rewardItemsCount={next_val}")
                    if next_val > 0:
                        for i in range(next_val):
                            item_off = off + 8 + i * 20
                            if item_off + 12 <= len(raw):
                                fid = struct.unpack_from("<i", raw, item_off)[0]
                                pid = struct.unpack_from("<q", raw, item_off+4)[0]
                                amt = struct.unpack_from("<i", raw, item_off+12)[0]
                                name = item_names.get(pid, "?")
                                print(f"    item[{i}]: pathID={pid}, amount={amt}, name_by_pid='{name}'")

print("\nDone.")
