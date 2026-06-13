"""Find the binary anchors for the missing 10 characters, then extract their birthdays."""
import struct
import json

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

MISSING = {
    143: b"Logan", 144: b"Oliver", 145: b"Percy",
    148: b"Rose", 149: b"Rowan", 150: b"Rufus",
    151: b"Rusty", 153: b"Theo", 155: b"Wallace", 157: b"Willow",
}

with open(RESOURCES, "rb") as f:
    data = f.read()

def find_dates_in_range(start, end):
    results = []
    for pos in range(start, min(end, len(data) - 16), 4):
        day, season, year, minute = struct.unpack_from("<iiif", data, pos)
        if 1 <= day <= 28 and 0 <= season <= 3 and 1 <= year <= 2:
            if abs(minute - 360.0) < 0.1 or abs(minute) < 0.1:
                results.append((pos - start, day, season, minute))
    return results

found_all = {}

for char_id, name in MISSING.items():
    id_bytes = struct.pack("<i", char_id)
    name_pattern = struct.pack("<I", len(name)) + name

    pos = 0
    found = False
    while pos < len(data):
        idx = data.find(id_bytes, pos)
        if idx == -1:
            break
        # Check if name follows within 40 bytes
        window = data[idx+4:idx+50]
        if name_pattern in window:
            print(f"  {name.decode()} (ID={char_id}): anchor at pos={idx}")
            # Search for birthday in next 20000 bytes
            dates = find_dates_in_range(idx, idx + 20000)
            if dates:
                offset, day, season, minute = dates[0]
                print(f"    -> {SEASON_NAMES[season]} {day} (offset={offset}, minute={minute:.0f})")
                found_all[name.decode()] = {"name": name.decode(), "season": season, "day": day}
            else:
                print(f"    -> No birthday found in first 20000 bytes")
            found = True
            break
        pos = idx + 1

    if not found:
        print(f"  {name.decode()} (ID={char_id}): NOT FOUND in binary")

print(f"\nFound birthdays for {len(found_all)} missing characters")

# Combine with known birthdays
known_birthdays = [
    {"name": "Adeline",  "season": 2, "day": 17},
    {"name": "Beatrix",  "season": 3, "day": 13},
    {"name": "Beryl",    "season": 3, "day": 1},
    {"name": "Dudley",   "season": 1, "day": 18},
    {"name": "Edgar",    "season": 2, "day": 23},
    {"name": "Ericka",   "season": 3, "day": 23},
    {"name": "Greta",    "season": 2, "day": 8},
    {"name": "Gruff",    "season": 0, "day": 9},
    {"name": "Hazel",    "season": 1, "day": 24},
    {"name": "Jack",     "season": 3, "day": 6},
    {"name": "Kai",      "season": 0, "day": 27},
    {"name": "Lila",     "season": 0, "day": 15},
    {"name": "Poppy",    "season": 1, "day": 8},
    {"name": "Prudence", "season": 0, "day": 5},
    {"name": "Tano",     "season": 0, "day": 28},
    {"name": "Wilfred",  "season": 1, "day": 4},
]

all_villagers = known_birthdays + list(found_all.values())
all_villagers.sort(key=lambda x: (x["season"], x["day"]))

output_path = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\villager_birthdays.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(all_villagers, f, indent=2, ensure_ascii=False)
print(f"\nFinal list: {len(all_villagers)} villagers written to {output_path}")
for v in all_villagers:
    print(f"  {v['name']}: {SEASON_NAMES[v['season']]} {v['day']}")
