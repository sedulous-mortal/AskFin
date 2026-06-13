"""
Full birthday search using known character anchors (ID + name pattern).
Searches up to 50,000 bytes forward per character.
Reports ALL valid Date(year=1, minute=360) patterns in each character's range
so we can pick the most plausible birthday.
Also scans for unknown character names in the gap regions.
"""
import struct
import json

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

with open(RESOURCES, "rb") as f:
    data = f.read()

# Known anchors from anchoredSearch.py, sorted by file position
ANCHORS = sorted([
    (86709960, 131, "Adeline"),
    (86718384, 132, "Beatrix"),
    (86728864, 133, "Beryl"),
    (86739272, 134, "Dudley"),
    (86747600, 136, "Edgar"),
    (86755896, 135, "Ericka"),
    (86765188, 154, "Fin"),
    (86766520, 137, "Greta"),
    (86777440, 138, "Gruff"),
    (86783560, 139, "Hazel"),
    (86788636, 140, "Jack"),
    (86798620, 141, "Kai"),
    (86804172, 142, "Lila"),
    (86849760, 146, "Poppy"),
    (86860576, 147, "Prudence"),
    (86905004, 152, "Tano"),
    (86931192, 156, "Wilfred"),
], key=lambda x: x[0])

# Determine each character's range (start to next anchor, max +50000)
def get_range(i):
    start = ANCHORS[i][0]
    if i + 1 < len(ANCHORS):
        end = ANCHORS[i+1][0]
    else:
        end = start + 50000
    # Don't exceed 50000 bytes
    return start, min(start + 50000, end)

# Find all Date(year=1, minute=360) patterns
all_bday_positions = {}
pos = 0
while pos < len(data) - 16:
    day, season, year, minute = struct.unpack_from("<iiif", data, pos)
    if 1 <= day <= 28 and 0 <= season <= 3 and year == 1 and abs(minute - 360.0) < 0.1:
        all_bday_positions[pos] = (day, season)
    pos += 4

print("=== Birthday Date patterns in each character's region ===\n")

results = {}
for i, (anchor_pos, char_id, name) in enumerate(ANCHORS):
    start, end = get_range(i)
    dates_in_range = [(p - start, d, s) for p, (d, s) in all_bday_positions.items()
                      if start <= p < end]
    dates_in_range.sort()

    print(f"{name} (ID={char_id}, range={end-start} bytes):")
    if not dates_in_range:
        print("  NO dates found")
    for offset, day, season in dates_in_range:
        print(f"  +{offset:5d}: {SEASON_NAMES[season]:6s} {day:2d}")
    print()

# Scan gaps for unknown character names
print("\n=== Unknown characters in gap regions ===")
# Gaps: between Lila end (86804172+45588=86849760 = Poppy) OK that's fine
# Check Lila's region more carefully - 45588 bytes is huge
# There might be characters 143-145 in there
# Also check region after Wilfred for remaining characters

# Look for any length-prefixed name strings in the gaps
gap_regions = [
    (86804172 + 10000, 86849760, "Lila-to-Poppy gap"),  # after Lila's first 10k bytes
    (86860576 + 10000, 86905004, "Prudence-to-Tano gap"),  # after Prudence's first 10k bytes
    (86931192 + 10000, len(data), "After Wilfred"),
]

# Search for int32(143-145, 148-151, 153, 155, 629-632) followed by a name string
MISSING_IDS = list(range(143, 146)) + list(range(148, 152)) + [153, 155, 629, 630, 631, 632]

for region_start, region_end, label in gap_regions:
    print(f"\n{label} ({region_start:,} - {region_end:,}):")
    for char_id in MISSING_IDS:
        id_bytes = struct.pack("<i", char_id)
        pos = region_start
        while pos < region_end:
            idx = data.find(id_bytes, pos, region_end)
            if idx == -1:
                break
            # Check if a name string follows within 30 bytes
            window = data[idx+4:idx+40]
            # Look for a length-prefixed string (length 3-15)
            for name_len in range(3, 16):
                if idx + 4 + 4 + name_len > len(data):
                    break
                nl_bytes = struct.pack("<I", name_len)
                if data[idx+4:idx+8] == nl_bytes:
                    name_candidate = data[idx+8:idx+8+name_len]
                    if name_candidate.isalpha():
                        print(f"  ID={char_id}: name='{name_candidate.decode()}' at pos={idx}")
            pos = idx + 1
