"""
Find the Character MonoBehaviour's script hash and enumerate Character objects.
Then try manual binary parsing using the known C# field layout.
"""
import UnityPy
import struct

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

env = UnityPy.load(RESOURCES)

# Step 1: Catalog all unique script_id hashes across MonoBehaviours
script_id_counts = {}
script_id_samples = {}

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    sid = obj.serialized_type.script_id if obj.serialized_type else None
    if sid:
        sid_hex = sid.hex()
        script_id_counts[sid_hex] = script_id_counts.get(sid_hex, 0) + 1
        if sid_hex not in script_id_samples:
            script_id_samples[sid_hex] = obj

print(f"Unique MonoBehaviour script types: {len(script_id_counts)}")
for sid, cnt in sorted(script_id_counts.items(), key=lambda x: -x[1]):
    print(f"  {sid}: {cnt} objects")

# Step 2: For each unique script type, try to peek at the raw data
# and look for character name patterns (try to find which hash = Character)
print("\nLooking for Character-like script types...")

known_names = {n.encode("utf-8") for n in [
    "Adeline", "Beatrix", "Beryl", "Dudley", "Edgar", "Ericka",
    "Fin", "Greta", "Gruff", "Hazel", "Jack", "Kai", "Lila",
    "Poppy", "Wilfred", "Prudence", "Tano"
]}

for sid_hex, first_obj in script_id_samples.items():
    # Get all objects with this script type
    objects_with_type = [o for o in env.objects
                         if o.type.name == "MonoBehaviour"
                         and o.serialized_type
                         and o.serialized_type.script_id
                         and o.serialized_type.script_id.hex() == sid_hex]

    # Read raw data for first few and check for character names
    hits = 0
    for o in objects_with_type[:20]:
        try:
            reader = o.reader
            reader.reset()
            raw = reader.read_bytes(reader.byte_size)
            for name in known_names:
                # Look for length-prefixed string
                pattern = struct.pack("<I", len(name)) + name
                if pattern in raw:
                    hits += 1
                    break
        except Exception:
            pass

    if hits > 0:
        print(f"  Script {sid_hex}: {len(objects_with_type)} objects, {hits} contain character names — CANDIDATE!")
