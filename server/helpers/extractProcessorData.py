import UnityPy
import json
import math

RESOURCES_ASSET = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
OUTPUT_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\processor_data.json"
LOG_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\extract_processor_log.txt"

# Processing times in game-minutes per processor (hardcoded from C# source).
# 1 in-game day = 1440 game-minutes. Processors run continuously including during sleep.
PROC_MINUTES = {
    'smoker':           360,   # SmokerProcessor.ProcTime
    'dryRack':         1440,   # DryRackProcessor.ProcTime
    'press':             60,   # PressProcessor.ProcTime
    'fermenterSalt':    720,   # FermenterBarrelProcessor.ProcTime (salt fuel)
    'fermenterOil':     720,   # FermenterBarrelProcessor.ProcTime (oil fuel)
    'fermenterHoney':   720,   # FermenterBarrelProcessor.ProcTime (honey fuel)
    'fermenterVinegar': 720,   # FermenterBarrelProcessor.ProcTime (vinegar fuel)
    'kiln':            2880,   # KilnProcessor.ProcTime
    'smelter':          180,   # SmelterProcessor.ProcTime
}
# Express in days, rounding up. Processors run overnight so we use a full 1440-min day.
PROC_DAYS = {k: math.ceil(v / 1440) for k, v in PROC_MINUTES.items()}

PROCESSOR_FIELDS = [
    ('smokerResult',          'smoker'),
    ('dryRackResult',         'dryRack'),
    ('pressResult',           'press'),
    ('fermenterResultSalt',   'fermenterSalt'),
    ('fermenterResultOil',    'fermenterOil'),
    ('fermenterResultHoney',  'fermenterHoney'),
    ('fermenterResultVinegar','fermenterVinegar'),
    ('kilnResult',            'kiln'),
    ('smeltingResult',        'smelter'),
]

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

log(f"Loading {RESOURCES_ASSET} ...")
env = UnityPy.load(RESOURCES_ASSET)
log("Loaded.")

# Pass 1 — map every Unity object's path_id → game Id (int), and stash raw trees.
# BaseScriptableObject stores the game ID in a private serialized field called "Id".
log("\nPass 1: scanning all MonoBehaviour objects for Id field ...")
path_id_to_game_id: dict[int, int] = {}
path_id_to_tree: dict[int, dict] = {}

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
    except Exception:
        continue
    raw_id = tree.get("Id")
    if isinstance(raw_id, int) and raw_id > 0:
        path_id_to_game_id[obj.path_id] = raw_id
        path_id_to_tree[obj.path_id] = tree

log(f"  Found {len(path_id_to_game_id)} objects with a positive integer Id field.")

def resolve_pptr(pptr) -> int | None:
    """Return the game-ID for a PPtr dict {m_FileID, m_PathID}, or None."""
    if not pptr or not isinstance(pptr, dict):
        return None
    path_id = pptr.get("m_PathID", 0)
    if not path_id:
        return None
    return path_id_to_game_id.get(path_id)

# Pass 2 — extract processor recipes and decay rates from InventoryItem-shaped objects.
# InventoryItem objects are identified by having at least one processor result field or
# a non-zero decayRate field. (Many other ScriptableObjects share BaseScriptableObject
# but won't have these fields in their type tree.)
log("\nPass 2: extracting processor recipes and decay rates ...")

recipes = []          # {inputId, processor, processorLabel, outputId, processingDays}
shelf_life: dict[int, float] = {}  # itemId -> shelf-life in days (0 = shelf-stable)
items_seen = 0
items_with_recipes = 0

for path_id, tree in path_id_to_tree.items():
    game_id = path_id_to_game_id[path_id]

    # Decay rate → shelf life in days (spoilageAverageAmount starts at 1.0, decremented by
    # decayRate once per day). shelf life = floor(1.0 / decayRate). 0 = never spoils.
    decay = tree.get("decayRate", 0.0)
    if isinstance(decay, (int, float)) and decay > 0:
        shelf_life[game_id] = math.floor(1.0 / float(decay))
    else:
        shelf_life[game_id] = 0

    has_recipe = False
    for field_name, proc_key in PROCESSOR_FIELDS:
        result_ref = tree.get(field_name)
        if not result_ref:
            continue
        output_id = resolve_pptr(result_ref)
        if output_id is None:
            continue
        recipes.append({
            "inputId": game_id,
            "processor": proc_key,
            "outputId": output_id,
            "processingDays": PROC_DAYS[proc_key],
        })
        has_recipe = True

    items_seen += 1
    if has_recipe:
        items_with_recipes += 1

log(f"  Items scanned: {items_seen}")
log(f"  Items with at least one recipe: {items_with_recipes}")
log(f"  Total recipes extracted: {len(recipes)}")
log(f"  Items with decay rate (perishable): {sum(1 for v in shelf_life.values() if v > 0)}")

# Summarise shelf-life distribution for sanity check
shelf_counts: dict[int, int] = {}
for v in shelf_life.values():
    shelf_counts[v] = shelf_counts.get(v, 0) + 1
log(f"\nShelf-life distribution (days → count): {dict(sorted(shelf_counts.items()))}")

# Sample recipes per processor for sanity check
from collections import defaultdict
by_proc: dict[str, list] = defaultdict(list)
for r in recipes:
    by_proc[r["processor"]].append(r)
for proc, recs in sorted(by_proc.items()):
    log(f"\n  {proc} ({len(recs)} recipes, {PROC_DAYS[proc]} day(s) to process):")
    for r in recs[:5]:
        log(f"    {r['inputId']} -> {r['outputId']}")
    if len(recs) > 5:
        log(f"    ... and {len(recs) - 5} more")

output = {
    "processorDays": PROC_DAYS,
    "recipes": recipes,
    "shelfLifeDays": {str(k): v for k, v in shelf_life.items()},
}

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)
log(f"\nWritten to {OUTPUT_PATH}")

with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"Log saved to {LOG_PATH}")
