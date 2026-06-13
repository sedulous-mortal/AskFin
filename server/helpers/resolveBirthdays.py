"""
Resolve villager birthdays by finding unique birthday patterns per character.
A birthday pattern is likely genuine if it's at the closest distance from the
character's name AND the birthday position is unique (not shared with other chars).
"""
import struct

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

KNOWN_NAMES = [b"Adeline", b"Beatrix", b"Beryl", b"Dudley", b"Edgar", b"Ericka",
               b"Fin", b"Greta", b"Gruff", b"Hazel", b"Jack", b"Kai", b"Lila",
               b"Poppy", b"Wilfred", b"Prudence", b"Tano", b"Sam", b"Leo"]

MINUTE_360 = struct.pack("<f", 360.0)

with open(RESOURCES, "rb") as f:
    data = f.read()

# Find all valid birthday Date positions
birthday_positions = {}  # pos -> (day, season)
pos = 0
while pos < len(data) - 16:
    day, season, year, minute_raw = struct.unpack_from("<iiif", data, pos)
    if 1 <= day <= 28 and 0 <= season <= 3 and year == 1 and abs(minute_raw - 360.0) < 0.1:
        birthday_positions[pos] = (day, season)
    pos += 4

print(f"Valid birthday patterns: {len(birthday_positions)}")

# For each birthday position, find ALL character names within 2000 bytes before it
bday_to_chars = {}  # bday_pos -> [(name, dist)]
for bday_pos, (day, season) in birthday_positions.items():
    window_start = max(0, bday_pos - 2000)
    window = data[window_start:bday_pos]
    chars_found = []
    for name in KNOWN_NAMES:
        pattern = struct.pack("<I", len(name)) + name
        idx = window.rfind(pattern)  # last occurrence = closest to birthday
        if idx != -1:
            dist = len(window) - idx
            chars_found.append((name.decode(), dist))
    if chars_found:
        bday_to_chars[bday_pos] = chars_found

# For each birthday position, find the CLOSEST character name
# A birthday is likely genuine if only 1 character is within a short distance
print("\n=== Birthday pattern analysis ===")
print("(showing birthday positions where closest name is unambiguous)\n")

char_to_best = {}  # char_name -> (day, season, bday_pos, dist)

for bday_pos, chars in bday_to_chars.items():
    day, season = birthday_positions[bday_pos]
    # Sort by distance
    chars.sort(key=lambda x: x[1])
    closest_name, closest_dist = chars[0]

    # Check if this is unambiguous: closest is significantly closer than second
    unambiguous = len(chars) == 1 or (len(chars) > 1 and chars[1][1] > closest_dist * 1.5)

    if closest_dist <= 500:
        # Track best (closest distance) for each character
        if closest_name not in char_to_best or closest_dist < char_to_best[closest_name][3]:
            char_to_best[closest_name] = (day, season, bday_pos, closest_dist, unambiguous)

print("Best birthday candidate for each character:")
final = {}
for name in sorted(char_to_best.keys()):
    day, season, bday_pos, dist, unamb = char_to_best[name]
    season_name = SEASON_NAMES[season]
    flag = "" if unamb else " (possibly ambiguous)"
    print(f"  {name:12s}: {season_name} {day:2d}  (dist={dist}, pos={bday_pos}){flag}")
    final[name] = {"name": name, "season": season, "day": day}

import json
output_path = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\villager_birthdays.json"
sorted_final = sorted(final.values(), key=lambda x: (x["season"], x["day"]))
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(sorted_final, f, indent=2, ensure_ascii=False)
print(f"\nWritten to {output_path}")

# Cross-check: look for duplicate birthday dates (two chars same day)
dates = {}
for name, d in final.items():
    key = (d["season"], d["day"])
    if key not in dates:
        dates[key] = []
    dates[key].append(name)
dupes = {k: v for k, v in dates.items() if len(v) > 1}
if dupes:
    print(f"\nWARNING: Duplicate birthdays detected:")
    for (s, d), names in dupes.items():
        print(f"  {SEASON_NAMES[s]} {d}: {names}")
