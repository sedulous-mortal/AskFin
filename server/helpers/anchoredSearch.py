"""
Anchor search: find CharacterID (131-157, 629-632) immediately followed
by the character name string (within ~20 bytes), then read the birthday
which appears later in the same block.
"""
import struct
import json

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

# CharactersTable localization IDs -> possible first names
# (IDs from debug_shared_keys.txt, names from quest/dialog data)
CHAR_IDS = list(range(131, 158)) + [629, 630, 631, 632]

KNOWN_NAMES = {
    b"Adeline", b"Beatrix", b"Beryl", b"Dudley", b"Edgar", b"Ericka",
    b"Fin", b"Greta", b"Gruff", b"Hazel", b"Jack", b"Kai", b"Lila",
    b"Poppy", b"Wilfred", b"Prudence", b"Tano", b"Sam", b"Leo", b"Robin",
    b"Quinn", b"Pepper", b"Milo", b"Rue", b"Sage", b"Neve"
}

with open(RESOURCES, "rb") as f:
    data = f.read()

print(f"File size: {len(data):,} bytes")

# Strategy: search for ID values (131-157, 629-632) as int32 LE
# then check if a known name appears within next 30 bytes
anchored_objects = []  # (char_id, name, pos_of_id)

for char_id in CHAR_IDS:
    id_bytes = struct.pack("<i", char_id)
    pos = 0
    while True:
        idx = data.find(id_bytes, pos)
        if idx == -1:
            break
        # Check if a known name appears within 30 bytes after the ID
        window = data[idx+4:idx+40]
        for name in KNOWN_NAMES:
            name_pattern = struct.pack("<I", len(name)) + name
            if name_pattern in window:
                anchored_objects.append((char_id, name.decode(), idx))
                print(f"  ID={char_id} + name={name.decode()} at pos={idx}")
        pos = idx + 1

print(f"\nAnchored objects found: {len(anchored_objects)}")

# For each anchored object, search forward for a valid birthday Date
print("\nSearching for birthday after each anchor...")
results = {}

for char_id, name, anchor_pos in anchored_objects:
    # Search forward up to 4000 bytes for a Date struct
    # Date: Day(1-28), Season(0-3), Year(1), Minute(360.0)
    found_birthdays = []
    for offset in range(0, 4000, 4):
        read_pos = anchor_pos + offset
        if read_pos + 16 > len(data):
            break
        day, season, year, minute = struct.unpack_from("<iiif", data, read_pos)
        if 1 <= day <= 28 and 0 <= season <= 3 and year == 1 and abs(minute - 360.0) < 0.1:
            found_birthdays.append((day, season, offset))

    if found_birthdays:
        # Take the first valid birthday found (smallest offset)
        day, season, offset = found_birthdays[0]
        season_name = SEASON_NAMES[season]
        print(f"  {name} (ID={char_id}): {season_name} {day} (offset={offset} from anchor)")
        if name not in results:
            results[name] = (day, season)
    else:
        print(f"  {name} (ID={char_id}): NO birthday found in range")

print("\nFinal results:")
villagers = []
for name, (day, season) in sorted(results.items(), key=lambda x: (x[1][1], x[1][0])):
    print(f"  {name}: {SEASON_NAMES[season]} {day}")
    villagers.append({"name": name, "season": season, "day": day})

output_path = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\villager_birthdays.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(villagers, f, indent=2)
print(f"\nWritten {len(villagers)} entries to {output_path}")
