"""
Final resolution: handle Dudley (no birthday with minute=360) and verify Beryl.
Also search for missing characters (IDs 143-145, 148-151, 153, 155, 629-632).
"""
import struct
import json

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

with open(RESOURCES, "rb") as f:
    data = f.read()

def find_dates_in_range(start, end, any_minute=False):
    results = []
    for pos in range(start, min(end, len(data) - 16), 4):
        day, season, year, minute = struct.unpack_from("<iiif", data, pos)
        if 1 <= day <= 28 and 0 <= season <= 3 and 1 <= year <= 2:
            if any_minute or abs(minute - 360.0) < 0.1 or abs(minute) < 0.1:
                results.append((pos - start, day, season, year, minute))
    return results

# Dudley: anchor=86739272, range end=86747600 (8328 bytes)
print("=== Dudley birthday search (any minute value) ===")
dudley_dates = find_dates_in_range(86739272, 86747600, any_minute=True)
for offset, day, season, year, minute in dudley_dates[-20:]:
    print(f"  +{offset:5d}: {SEASON_NAMES[season]:6s} {day:2d}  (year={year}, minute={minute:.1f})")

# Beryl: anchor=86728864, range=10408 bytes to Dudley at 86739272
print("\n=== Beryl - all dates in range ===")
beryl_dates = find_dates_in_range(86728864, 86739272, any_minute=True)
print(f"  Last few entries before Dudley:")
for offset, day, season, year, minute in beryl_dates[-10:]:
    print(f"  +{offset:5d}: {SEASON_NAMES[season]:6s} {day:2d}  (year={year}, minute={minute:.1f})")

# Also search in the large gap between Lila and Poppy for characters 143-145
# Use the same anchor approach: look for ID (143-145) followed within 30 bytes by a name string
print("\n=== Searching gap regions for missing characters (IDs 143-157, 629-632) ===")
MISSING_IDS = list(range(143, 160)) + [629, 630, 631, 632]

found_anchors = []
search_region_start = 86804172  # Lila
search_region_end = len(data)

for char_id in MISSING_IDS:
    # Skip already-found IDs
    if char_id in {131,132,133,134,135,136,137,138,139,140,141,142,146,147,152,154,156}:
        continue
    id_bytes = struct.pack("<i", char_id)
    pos = search_region_start
    while pos < search_region_end:
        idx = data.find(id_bytes, pos, search_region_end)
        if idx == -1:
            break
        # Check if a plausible name string follows within 30 bytes
        for name_len in range(3, 16):
            if idx + 4 + 4 + name_len > len(data):
                break
            nl_bytes = struct.pack("<I", name_len)
            if data[idx+4:idx+8] == nl_bytes:
                name_candidate = data[idx+8:idx+8+name_len]
                try:
                    name_str = name_candidate.decode("ascii")
                    if name_str.isalpha() and name_str[0].isupper():
                        print(f"  ID={char_id}: name='{name_str}' at pos={idx}")
                        found_anchors.append((idx, char_id, name_str))
                except Exception:
                    pass
        pos = idx + 1

if found_anchors:
    print(f"\nFound {len(found_anchors)} additional characters!")
    found_anchors.sort()
    for pos, char_id, name in found_anchors:
        print(f"  {name} (ID={char_id}) at {pos}")
        # Search for birthday in next 20000 bytes
        dates = [(d, s) for off, d, s, y, m in find_dates_in_range(pos, pos+20000)
                 if abs(m - 360.0) < 0.1 and y == 1]
        if dates:
            print(f"    -> First birthday candidate: {SEASON_NAMES[dates[0][1]]} {dates[0][0]}")
else:
    print("  No additional characters found in gap regions")
