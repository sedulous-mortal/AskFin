"""
Binary search resources.assets for Character ScriptableObject data.
The typetree is stripped so we can't use UnityPy's normal decode.
Instead, search for known character name strings near birthday data.
The Date struct is serialized as: Day(int32), Season(int32), Year(int32), Minute(float32).
"""
import struct
import re

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

# Known villager first names from dialog/quest data
KNOWN_NAMES = [
    "Adeline", "Beatrix", "Beryl", "Dudley", "Edgar", "Ericka", "Fin",
    "Greta", "Gruff", "Hazel", "Jack", "Kai", "Lila", "Poppy", "Wilfred",
    "Prudence", "Tano", "Sam", "Leo", "Robin", "Quinn"
]

with open(RESOURCES, "rb") as f:
    data = f.read()

print(f"File size: {len(data):,} bytes")

results = {}

for name in KNOWN_NAMES:
    # Find all occurrences of the name as a length-prefixed Unity string
    # Unity strings: int32 length (LE) followed by UTF-8 bytes
    name_bytes = name.encode("utf-8")
    name_len = len(name_bytes)
    search = struct.pack("<I", name_len) + name_bytes

    pos = 0
    while True:
        idx = data.find(search, pos)
        if idx == -1:
            break

        # After the name string (aligned to 4 bytes), try to find Date data
        # The Date is stored as: Day(int32), Season(int32), Year(int32), Minute(float32)
        after_name = idx + 4 + name_len
        # Align to 4 bytes
        if after_name % 4 != 0:
            after_name += 4 - (after_name % 4)

        # Try reading nearby bytes as a Date struct (within next 500 bytes)
        for offset in range(0, 500, 4):
            pos2 = after_name + offset
            if pos2 + 16 > len(data):
                break
            day, season, year, minute_raw = struct.unpack_from("<iiif", data, pos2)
            # Valid date: day 1-28, season 0-3, year 1-5
            if 1 <= day <= 28 and 0 <= season <= 3 and 1 <= year <= 5:
                season_name = SEASON_NAMES[season]
                # Only report plausible characters (names that are likely to be near their birthday)
                print(f"  {name}: Day={day}, Season={season} ({season_name}), Year={year}, offset_from_name={offset}")
                if name not in results:
                    results[name] = []
                results[name].append({"day": day, "season": season, "season_name": season_name, "year": year, "offset": offset, "file_pos": idx})

        pos = idx + 1

print("\nSummary (most likely candidates - low offset, year=1):")
for name, hits in sorted(results.items()):
    year1 = [h for h in hits if h["year"] == 1 and h["offset"] < 200]
    if year1:
        print(f"  {name}: {year1}")
