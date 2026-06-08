"""
Dump the full raw bytes of identified donation quest objects and decode reward data.
Also search for DonationQuest1 (id=1323).

Quest ScriptableObject serialization order (Unity, based on Quest.cs field order):
  Inherited from ScriptableObject (m_Name string)
  From BaseScriptableObject: Id (int)
  Quest fields in declaration order:
    displayTitle (string)
    displayIcon (PPtr<Sprite>: fileID int + pathID int64 = 12 bytes)
    description (string)
    requirements (List<ItemAmount>)
    prereqQuestsList (List<PPtr<Quest>>)
    availableDateRange (AvailableDateRange)
    startDonationsDate (Date)
    endDonationsDate (Date)
    prereqRelationshipLvl (int)
    rewardMoney (int)
    rewardRelationshipPoints (int)
    rewardItems (List<ItemAmount>)
    owner (PPtr<Character>)
    ownerSecondary (PPtr<Character>)
    activatedInCutscene (bool)
    questSegments (List<Segment>)
    townQuest (bool)
    donationQuest (bool)
    rootcellarQuest (bool)
    isVIPQuest (bool)
    rootcellarDonationItems (InventoryItem[])

ItemAmount:
    item (PPtr<InventoryItem>: fileID int + pathID int64 = 12 bytes)
    amount (int)
    playerDonationAmount (float)
"""
import UnityPy
import struct
import json

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
ITEM_MAPS_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"

# Known donation quest path_ids (26340-26344 confirmed; 1323 TBD)
TARGET_PATH_IDS = {26340, 26341, 26342, 26343, 26344}

with open(ITEM_MAPS_PATH, "r", encoding="utf-8") as f:
    maps = json.load(f)
item_names = {int(k): v for k, v in maps.get("InventoryItems_en", {}).items()}

env = UnityPy.load(ASSETS_FILE)

# Build a map of path_id -> (item id, item name) for InventoryItem objects
# so we can resolve PPtr references later
print("Building InventoryItem path_id map...")
inv_item_path_map = {}  # path_id -> (game_id, name)

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        raw = obj.get_raw_data()
    except Exception:
        continue
    if not raw or len(raw) < 16:
        continue

    # Also look for DonationQuest1 by name pattern
    if b"DonationQuest1" in raw:
        print(f"  Found DonationQuest1 in path_id={obj.path_id}")
        TARGET_PATH_IDS.add(obj.path_id)

print(f"\nDumping {len(TARGET_PATH_IDS)} quest objects...")

def read_string(data, offset):
    """Read a Unity length-prefixed string from data at offset. Returns (string, next_offset)."""
    if offset + 4 > len(data):
        return None, offset
    length = struct.unpack_from("<i", data, offset)[0]
    if length < 0 or offset + 4 + length > len(data):
        return None, offset
    s = data[offset+4:offset+4+length].decode("utf-8", errors="replace")
    # Strings are padded to 4-byte boundary
    padded = (length + 3) & ~3
    return s, offset + 4 + padded

def read_int(data, offset):
    if offset + 4 > len(data): return None, offset
    v = struct.unpack_from("<i", data, offset)[0]
    return v, offset + 4

def read_float(data, offset):
    if offset + 4 > len(data): return None, offset
    v = struct.unpack_from("<f", data, offset)[0]
    return v, offset + 4

def read_pptr(data, offset):
    """Read a PPtr (fileID: int, pathID: int64). Returns (fileID, pathID, next_offset)."""
    if offset + 12 > len(data): return 0, 0, offset
    fileID = struct.unpack_from("<i", data, offset)[0]
    pathID = struct.unpack_from("<q", data, offset+4)[0]
    return fileID, pathID, offset + 12

for obj in env.objects:
    if obj.path_id not in TARGET_PATH_IDS:
        continue
    if obj.type.name != "MonoBehaviour":
        continue

    try:
        raw = obj.get_raw_data()
    except Exception as e:
        print(f"\n[path_id={obj.path_id}] Failed to get raw data: {e}")
        continue

    print(f"\n{'='*60}")
    print(f"path_id={obj.path_id}, size={len(raw)}")

    # Full hex dump
    print("Full hex dump:")
    for row_start in range(0, len(raw), 16):
        row = raw[row_start:row_start+16]
        hex_row = " ".join(f"{b:02x}" for b in row)
        ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
        print(f"  {row_start:04x}: {hex_row:<47}  {ascii_row}")

    # Try to parse the structure
    print("\nParsing attempt:")
    off = 0

    # m_Name (inherited)
    m_name, off = read_string(raw, off)
    print(f"  m_Name: '{m_name}' (next offset: {off})")

    # Id (from BaseScriptableObject)
    quest_id, off = read_int(raw, off)
    print(f"  Id: {quest_id}")

    # displayTitle
    display_title, off = read_string(raw, off)
    print(f"  displayTitle: '{display_title}'")

    # displayIcon (PPtr)
    icon_fid, icon_pid, off = read_pptr(raw, off)
    print(f"  displayIcon PPtr: fileID={icon_fid}, pathID={icon_pid}")

    # description
    description, off = read_string(raw, off)
    print(f"  description: '{description[:80]}...' " if description and len(description) > 80 else f"  description: '{description}'")

    # requirements (List<ItemAmount>)
    req_count, off = read_int(raw, off)
    print(f"  requirements count: {req_count}")
    for i in range(req_count or 0):
        item_fid, item_pid, off = read_pptr(raw, off)
        amount, off = read_int(raw, off)
        don_amount, off = read_float(raw, off)
        print(f"    req[{i}]: item_pid={item_pid}, amount={amount}, donationAmount={don_amount:.2f}")

    # prereqQuestsList (List<PPtr<Quest>>)
    prereq_count, off = read_int(raw, off)
    print(f"  prereqQuestsList count: {prereq_count}")
    for i in range(prereq_count or 0):
        _, pid, off = read_pptr(raw, off)
        print(f"    prereq[{i}]: quest_pid={pid}")

    # availableDateRange - need AvailableDateRange struct
    # Let's just dump the remaining bytes and figure out from context
    print(f"\n  === Remaining bytes from offset {off} ===")
    remaining = raw[off:]
    for row_start in range(0, len(remaining), 16):
        row = remaining[row_start:row_start+16]
        hex_row = " ".join(f"{b:02x}" for b in row)
        ascii_row = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
        print(f"    {off+row_start:04x}: {hex_row:<47}  {ascii_row}")
