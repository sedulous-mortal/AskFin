"""
Dump the full ResearchQuestMaster object (path_id=26006) and find the IDs
associated with "Donate 45 Specimens" and "Donate 60 Specimens" segments.
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

TARGET_PATH_ID = 26006

for obj in env.objects:
    if obj.path_id != TARGET_PATH_ID:
        continue

    print(f"Found object path_id={obj.path_id}, type={obj.type.name}")
    raw = obj.get_raw_data()
    print(f"Raw size: {len(raw)} bytes\n")

    # Full hex dump
    print("=== FULL HEX DUMP ===")
    for row_start in range(0, len(raw), 16):
        row = raw[row_start:row_start+16]
        hex_row = " ".join(f"{b:02x}" for b in row)
        ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
        print(f"  {row_start:04x}: {hex_row:<47}  {ascii_row}")

    print("\n=== STRING SEARCH ===")
    for target in [b"Donate 45", b"Donate 60", b"Donate 30", b"Donate 15", b"Iron Water Pump", b"Kiln"]:
        idx = 0
        while True:
            idx = raw.find(target, idx)
            if idx == -1:
                break
            print(f"\nFound '{target.decode()}' at offset 0x{idx:x} ({idx})")
            # Show 64 bytes before and after
            start = max(0, idx - 64)
            end = min(len(raw), idx + 80)
            for row_start in range(start, end, 16):
                row = raw[row_start:row_start+16]
                hex_row = " ".join(f"{b:02x}" for b in row)
                ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
                marker = " <--" if row_start <= idx < row_start + 16 else ""
                print(f"  {row_start:04x}: {hex_row:<47}  {ascii_row}{marker}")
            idx += 1

    # Try to parse as JSON-style readable
    print("\n=== ATTEMPTING UNITYPY READ ===")
    try:
        data = obj.read()
        print(repr(data))
        if hasattr(data, '__dict__'):
            import pprint
            pprint.pprint(data.__dict__)
    except Exception as e:
        print(f"Could not read as typed object: {e}")

    break

print("\nDone.")
