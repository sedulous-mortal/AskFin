"""
Lists all MonoBehaviour m_Name values in resources.assets.
We cross-reference against the 54 already-exported quest files to find
the 7 missing ones by elimination.

Run: python server/helpers/listAllMonoBehaviours.py
"""
import UnityPy
import os

GAME_DATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
QUESTS_FOLDER  = r"C:\Users\ansob\claude-tests\AskFin\quests"
LOG_PATH       = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\all_mb_names_log.txt"

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

# Asset names already exported (strip the filename suffix UABE adds)
exported = set()
for f in os.listdir(QUESTS_FOLDER):
    # Filename pattern: "BeatrixQuest1-resources.assets-25975.json"
    base = f.split('-resources.assets-')[0] if '-resources.assets-' in f else f.rsplit('.', 1)[0]
    exported.add(base.lower())

log(f"Already exported ({len(exported)}): {sorted(exported)}\n")

# List all MonoBehaviour names in resources.assets
resources_path = os.path.join(GAME_DATA_PATH, "resources.assets")
env = UnityPy.load(resources_path)

all_mb = []
for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        data = obj.read()
        name = getattr(data, 'm_Name', '') or ''
    except Exception:
        name = ''
    all_mb.append((obj.path_id, name))

log(f"Total MonoBehaviours in resources.assets: {len(all_mb)}")

# Show ones that contain "quest" (case-insensitive) and aren't already exported
log("\n--- MonoBehaviours with 'quest' in name ---")
for path_id, name in sorted(all_mb, key=lambda x: x[1].lower()):
    if 'quest' in name.lower():
        already = name.lower() in exported
        log(f"  path_id={path_id}  name={name!r}  {'(already exported)' if already else '<-- NOT YET EXPORTED'}")

with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"\nLog saved to {LOG_PATH}")
