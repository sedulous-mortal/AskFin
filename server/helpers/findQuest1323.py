"""
Find Quest 1323 "Donate 30 Specimens" in resources.assets by scanning all MonoBehaviours
for the string "DonationQuest7" or the ID 1323 at offset 0x30.
"""
import UnityPy
import struct
import json

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
ITEM_MAPS_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"

with open(ITEM_MAPS_PATH, "r", encoding="utf-8") as f:
    maps = json.load(f)
item_names = {int(k): v for k, v in maps.get("InventoryItems_en", {}).items()}

TARGET_ID = 1323

env = UnityPy.load(ASSETS_FILE)

print("Scanning for Quest 1323...")
found = []

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        raw = obj.get_raw_data()
    except Exception:
        continue
    if not raw or len(raw) < 64:
        continue

    # Check if the value at offset 0x30 is 1323
    if len(raw) > 0x34:
        val_at_30 = struct.unpack_from("<i", raw, 0x30)[0]
        if val_at_30 == TARGET_ID:
            # Confirm by checking if "DonationQuest" or "Donate 30" appears in the raw bytes
            if b"Donate" in raw or b"Donation" in raw:
                found.append((obj.path_id, len(raw), raw))
                print(f"\n=== Found path_id={obj.path_id}, size={len(raw)} ===")
                # Hex dump first 256 bytes
                for row_start in range(0, min(256, len(raw)), 16):
                    row = raw[row_start:row_start+16]
                    hex_row = " ".join(f"{b:02x}" for b in row)
                    ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
                    print(f"  {row_start:04x}: {hex_row:<47}  {ascii_row}")

                # Key reward bytes
                if len(raw) >= 0x120:
                    prereq_rl = struct.unpack_from("<i", raw, 0x110)[0]
                    reward_money = struct.unpack_from("<i", raw, 0x114)[0]
                    reward_rel = struct.unpack_from("<i", raw, 0x118)[0]
                    reward_items_count = struct.unpack_from("<i", raw, 0x11c)[0]
                    print(f"\n  prereqRelLvl={prereq_rl}, rewardMoney={reward_money}, rewardRelPoints={reward_rel}, rewardItemsCount={reward_items_count}")

                    if reward_items_count > 0 and reward_items_count < 10:
                        for i in range(reward_items_count):
                            item_off = 0x120 + i * 20
                            if item_off + 20 <= len(raw):
                                fid = struct.unpack_from("<i", raw, item_off)[0]
                                pid = struct.unpack_from("<q", raw, item_off+4)[0]
                                amt = struct.unpack_from("<i", raw, item_off+12)[0]
                                print(f"    reward_item[{i}]: pathID={pid}, amount={amt}")
                                if pid in {int(k): v for k in item_names}:
                                    print(f"      -> NOT in map")
            else:
                # Maybe it's non-donation but has same ID
                print(f"  path_id={obj.path_id}: val at 0x30 = {val_at_30} but no Donate text")

    # Also check if the bytes "2B 05 00 00" (= 1323) appear at the correct offset for a later quest
    # Some quest assets might have a different header size
    pattern_1323 = b'\x2b\x05\x00\x00'
    idx = raw.find(pattern_1323)
    if idx != -1 and idx not in (0x30,) and b"Donation" in raw:
        print(f"  path_id={obj.path_id}: 1323 found at offset 0x{idx:x} with Donation text - possible match")
        # Hex dump first 64 bytes + context around idx
        for row_start in range(0, min(64, len(raw)), 16):
            row = raw[row_start:row_start+16]
            hex_row = " ".join(f"{b:02x}" for b in row)
            ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
            print(f"    {row_start:04x}: {hex_row:<47}  {ascii_row}")

print(f"\n\nTotal found: {len(found)}")
