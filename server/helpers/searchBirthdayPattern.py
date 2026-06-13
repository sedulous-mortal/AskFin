"""
Search resources.assets for birthday Date structs using the exact binary pattern.
Date struct layout: Day(int32 LE) + Season(int32 LE) + Year(int32 LE) + Minute(float32 LE)
Default constructor sets Year=1 and Minute=360.0f (= 0x43B40000).
"""
import struct

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

# 360.0f in IEEE 754 LE = bytes 0x00 0x00 0xB4 0x43
MINUTE_360 = struct.pack("<f", 360.0)

KNOWN_NAMES = [b"Adeline", b"Beatrix", b"Beryl", b"Dudley", b"Edgar", b"Ericka",
               b"Fin", b"Greta", b"Gruff", b"Hazel", b"Jack", b"Kai", b"Lila",
               b"Poppy", b"Wilfred", b"Prudence", b"Tano", b"Sam", b"Leo"]

with open(RESOURCES, "rb") as f:
    data = f.read()

print(f"File size: {len(data):,} bytes")
print(f"360.0f bytes: {MINUTE_360.hex()}")

# Find all positions where valid birthday patterns occur
birthday_positions = []
pos = 0
while pos < len(data) - 16:
    # Try to read a Date: Day, Season, Year, Minute
    day, season, year, minute_raw = struct.unpack_from("<iiif", data, pos)
    if (1 <= day <= 28 and 0 <= season <= 3 and year == 1
            and abs(minute_raw - 360.0) < 0.1):
        birthday_positions.append((pos, day, season))
    pos += 4

print(f"\nValid birthday patterns found: {len(birthday_positions)}")

# For each birthday position, look backwards up to 2000 bytes for a known character name
results = {}
for bday_pos, day, season in birthday_positions:
    window_start = max(0, bday_pos - 2000)
    window = data[window_start:bday_pos]

    for name in KNOWN_NAMES:
        # Look for length-prefixed string: int32(len) + bytes
        pattern = struct.pack("<I", len(name)) + name
        if pattern in window:
            season_name = SEASON_NAMES[season]
            key = name.decode()
            dist = bday_pos - window_start - window.rfind(pattern)
            entry = {"day": day, "season": season, "season_name": season_name, "dist": dist}
            if key not in results:
                results[key] = []
            if entry not in results[key]:
                results[key].append(entry)

print(f"\nCharacters with birthday patterns found: {sorted(results.keys())}")
print("\nAll matches (sorted by distance, closest first):")
for name in sorted(results.keys()):
    hits = sorted(results[name], key=lambda h: h["dist"])
    print(f"\n  {name}:")
    for h in hits[:5]:
        print(f"    {h['season_name']} {h['day']} (dist={h['dist']})")
