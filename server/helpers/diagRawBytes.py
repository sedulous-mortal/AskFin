"""
Try to extract m_Name from raw bytes of InventoryItem MonoBehaviours.
Unity 2022.x serialized MonoBehaviour layout (little-endian):
  m_GameObject: PPtr = {int32 fileID (4) + int64 pathID (8)} = 12 bytes
  m_Enabled: uint8 (1) + 3 padding = 4 bytes
  m_Script: PPtr = 12 bytes
  m_Name: string = {int32 length (4) + chars + padding to 4}
Total before m_Name: 28 bytes

Run: python server/helpers/diagRawBytes.py
"""
import struct, UnityPy

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"

# Known items from quest descriptions
KNOWN = {
    25174: "Carrot (expected)",
    25188: "Hawthorn Berry (expected)",
    25435: "Sapphire (expected)",
    25212: "Sunflower (expected)",
    25412: "reward item for AdelineQuest1",
    25375: "reward item for BeatrixQuest1",
}

env = UnityPy.load(RESOURCES)
pid_to_obj = {obj.path_id: obj for obj in env.objects}

for pid, note in KNOWN.items():
    obj = pid_to_obj.get(pid)
    if obj is None:
        print(f"pid={pid}: NOT FOUND  ({note})")
        continue
    try:
        r = obj.reader
        # UnityPy 1.x uses Position; older uses reset()
        try:
            r.Position = 0
        except Exception:
            pass
        raw = bytes(r.read_bytes(r.byte_size))
    except Exception as e:
        # Fallback: try get_raw_data if available
        try:
            raw = bytes(obj.get_raw_data())
        except Exception as e2:
            print(f"pid={pid}: could not read raw bytes: {e} / {e2}")
            continue

    print(f"pid={pid}  raw_size={len(raw)}  ({note})")
    # Parse m_Name at confirmed offset 28
    if len(raw) >= 32:
        nlen = struct.unpack_from('<I', raw, 28)[0]
        if 0 < nlen < 100 and len(raw) >= 32 + nlen:
            name = raw[32:32+nlen].decode('utf-8', errors='replace')
            padding = (4 - nlen % 4) % 4
            id_offset = 32 + nlen + padding
            if len(raw) >= id_offset + 4:
                game_id = struct.unpack_from('<i', raw, id_offset)[0]
                print(f"  name={name!r}  game_id={game_id}  (Id field at offset {id_offset})")
            else:
                print(f"  name={name!r}  (not enough bytes for game_id, need {id_offset+4}, have {len(raw)})")
