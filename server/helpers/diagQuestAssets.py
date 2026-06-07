"""
Diagnostic script: dumps what UnityPy can actually see in resources.assets
and what the QuestsTable localization keys look like.

Run: python server/helpers/diagQuestAssets.py
"""
import UnityPy
import json
import os

GAME_DATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
STREAMING_PATH = os.path.join(GAME_DATA_PATH, r"StreamingAssets\aa\StandaloneWindows64")
SHARED_BUNDLE  = os.path.join(STREAMING_PATH, "localization-assets-shared_assets_all.bundle")
LOG_PATH       = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\diag_log.txt"

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

# ---------------------------------------------------------------------------
# 1. Dump ALL QuestsTable shared keys so we can see the actual key format
# ---------------------------------------------------------------------------
log("=== QuestsTable Shared Keys ===")
try:
    env = UnityPy.load(SHARED_BUNDLE)
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
            if "QuestsTable" not in tree.get("m_Name", ""):
                continue
            entries = tree.get("m_Entries", [])
            log(f"Table: {tree['m_Name']}  ({len(entries)} entries)")
            for e in entries[:60]:  # show first 60
                log(f"  m_Id={e.get('m_Id')}  m_Key={e.get('m_Key')}")
            if len(entries) > 60:
                log(f"  ... and {len(entries)-60} more")
        except Exception as ex:
            log(f"  Error reading: {ex}")
except Exception as ex:
    log(f"Failed to load shared bundle: {ex}")

# ---------------------------------------------------------------------------
# 2. Sample MonoBehaviour objects from resources.assets
#    Show type tree keys so we can tell if they're stripped or have custom fields
# ---------------------------------------------------------------------------
log("\n=== resources.assets MonoBehaviour sample ===")
resources_path = os.path.join(GAME_DATA_PATH, "resources.assets")
mb_count = 0
quest_candidates = 0
try:
    env = UnityPy.load(resources_path)
    log(f"Total objects in resources.assets: {len(list(env.objects))}")
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        mb_count += 1
        try:
            tree = obj.read_typetree()
            keys = list(tree.keys()) if isinstance(tree, dict) else []
            name = tree.get("m_Name", "")
            # Print the first 30 unique key sets we see
            if mb_count <= 30:
                log(f"  MB #{mb_count}: m_Name={name!r}  keys={keys[:15]}")
            # Check for quest-like fields
            if "Id" in keys and "availableDateRange" in keys:
                quest_candidates += 1
                log(f"  *** QUEST CANDIDATE: {name!r}  Id={tree.get('Id')}  keys={keys}")
        except Exception:
            if mb_count <= 30:
                log(f"  MB #{mb_count}: read_typetree() failed")
    log(f"\nTotal MonoBehaviours: {mb_count}")
    log(f"Quest candidates (Id + availableDateRange): {quest_candidates}")
except Exception as ex:
    log(f"Failed to load resources.assets: {ex}")

# ---------------------------------------------------------------------------
# 3. Check Unity version (helps understand if type trees would be stripped)
# ---------------------------------------------------------------------------
log("\n=== Unity version from resources.assets ===")
try:
    env = UnityPy.load(resources_path)
    log(f"Unity version: {env.file.version if hasattr(env, 'file') else 'unknown'}")
    # Try getting version from the reader
    for name, reader in env.files.items():
        v = getattr(reader, 'unity_version', None) or getattr(reader, 'version', None)
        if v:
            log(f"  {name}: version={v}")
            break
except Exception as ex:
    log(f"  Error: {ex}")

with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"\nLog saved to {LOG_PATH}")
