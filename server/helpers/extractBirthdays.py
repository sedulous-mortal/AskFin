"""
Extract villager birthdates from the Grimshire resources.assets file.
Character ScriptableObjects live in the built-in Resources bundle, not Addressables.
Fields used: myName (str), nonVillager (bool), birthDay.Day (int), birthDay.Season (int).
Seasons enum: Spring=0, Summer=1, Fall=2, Winter=3.
"""
import UnityPy
import json

RESOURCES_ASSETS = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]

env = UnityPy.load(RESOURCES_ASSETS)

villagers = []
all_chars = []

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
    except Exception:
        continue

    # Character ScriptableObjects have myName, nonVillager, and birthDay
    if "myName" not in tree or "birthDay" not in tree:
        continue

    name = tree.get("myName", "")
    last_name = tree.get("lastName", "")
    non_villager = tree.get("nonVillager", True)
    birth_day = tree.get("birthDay", {})

    day = birth_day.get("Day", 0)
    season_int = birth_day.get("Season", 0)

    all_chars.append({
        "name": name,
        "lastName": last_name,
        "nonVillager": non_villager,
        "season": season_int,
        "day": day,
    })

    if non_villager:
        continue

    season_name = SEASON_NAMES[season_int] if 0 <= season_int <= 3 else str(season_int)
    print(f"  {name} {last_name}: {season_name} {day} (season={season_int})")
    villagers.append({
        "name": name,
        "season": season_int,
        "day": day,
    })

print(f"\nTotal characters read: {len(all_chars)}")
print(f"Villagers (nonVillager=false): {len(villagers)}")

# Sort by season then day
villagers.sort(key=lambda v: (v["season"], v["day"]))

output_path = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\villager_birthdays.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(villagers, f, indent=2, ensure_ascii=False)
print(f"\nWritten to {output_path}")
print(json.dumps(villagers, indent=2, ensure_ascii=False))
