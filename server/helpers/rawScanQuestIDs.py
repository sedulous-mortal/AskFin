"""
Scan resources.assets MonoBehaviours for donation quest IDs using raw byte search.
Quest IDs: 1323=0x52B, 518=0x206, 863=0x35F, 864=0x360, 865=0x361, 866=0x362

Unity serializes int as 4-byte little-endian. These IDs appear as:
  518  -> 06 02 00 00
  863  -> 5F 03 00 00
  864  -> 60 03 00 00
  865  -> 61 03 00 00
  866  -> 62 03 00 00
  1323 -> 2B 05 00 00
"""
import UnityPy
import struct
import json

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
ITEM_MAPS_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"

DONATION_QUEST_IDS = {1323, 518, 863, 864, 865, 866}

with open(ITEM_MAPS_PATH, "r", encoding="utf-8") as f:
    maps = json.load(f)
item_names = {int(k): v for k, v in maps.get("InventoryItems_en", {}).items()}

print(f"Loaded {len(item_names)} item names")

env = UnityPy.load(ASSETS_FILE)
mb_objects = [obj for obj in env.objects if obj.type.name == "MonoBehaviour"]
print(f"Found {len(mb_objects)} MonoBehaviours in resources.assets")

# For each MonoBehaviour, get the raw serialized bytes and search for quest IDs
matches = []

for obj in mb_objects:
    try:
        raw = obj.get_raw_data()
    except Exception:
        try:
            # Alternative way to get raw data
            raw = bytes(obj.read().raw_data)
        except Exception:
            continue

    if not raw:
        continue

    for quest_id in DONATION_QUEST_IDS:
        pattern = struct.pack("<i", quest_id)
        idx = raw.find(pattern)
        if idx != -1:
            # Found a match — dump surrounding bytes
            start = max(0, idx - 32)
            end = min(len(raw), idx + 64)
            context = raw[start:end]
            hex_dump = " ".join(f"{b:02x}" for b in context)
            matches.append({
                "quest_id": quest_id,
                "obj_path_id": obj.path_id,
                "raw_size": len(raw),
                "match_offset": idx,
                "context_start": start,
                "hex_context": hex_dump,
            })
            print(f"\n=== Quest ID {quest_id} found in obj path_id={obj.path_id} (size={len(raw)}) ===")
            print(f"  Match offset: {idx} (0x{idx:04x})")
            print(f"  Hex context (offset {start}-{end-1}):")
            # Pretty-print with offsets
            for row_start in range(start, end, 16):
                row = raw[row_start:row_start+16]
                hex_row = " ".join(f"{b:02x}" for b in row)
                ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
                print(f"    {row_start:04x}: {hex_row:<47}  {ascii_row}")

print(f"\n\nTotal matches: {len(matches)}")
print("Match summary:")
for m in matches:
    print(f"  Quest {m['quest_id']}: path_id={m['obj_path_id']}, offset={m['match_offset']}, raw_size={m['raw_size']}")
