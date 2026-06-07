"""
Extracts quest data from Grimshire's Unity asset bundles and localization tables.

Outputs: server/helpers/quests.json

Run with: python server/helpers/extractQuestData.py
Requires: pip install UnityPy
"""
import UnityPy
import json
import os
import glob
import re

GAME_DATA_PATH  = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
STREAMING_PATH  = os.path.join(GAME_DATA_PATH, r"StreamingAssets\aa\StandaloneWindows64")
SHARED_BUNDLE   = os.path.join(STREAMING_PATH, "localization-assets-shared_assets_all.bundle")
ENGLISH_BUNDLE  = os.path.join(STREAMING_PATH, "localization-string-tables-english(en)_assets_all.bundle")
EXISTING_MAPS  = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"
OUTPUT_PATH    = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\quests.json"
LOG_PATH       = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\quest_extract_log.txt"

# Seasons enum from Seasons.cs: Spring=0, Summer=1, Fall=2, Winter=3, None=4
SEASONS = ["Spring", "Summer", "Fall", "Winter", "None"]

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

# ---------------------------------------------------------------------------
# Step 1: Quest names from existing game_id_maps.json
# ---------------------------------------------------------------------------
with open(EXISTING_MAPS, encoding="utf-8") as f:
    game_maps = json.load(f)

quest_names = {int(k): v for k, v in game_maps.get("QuestsTable_en", {}).items()}
known_quest_ids = set(quest_names.keys())
log(f"Loaded {len(quest_names)} quest names from game_id_maps.json")

# ---------------------------------------------------------------------------
# Step 2: Quest descriptions from localization bundles
# QuestsTable_en uses keys "{id}_name" and "{id}_description".
# The existing extractGameData.py only captures _name; we capture _description here.
# ---------------------------------------------------------------------------
log("\nLoading localization bundles for quest descriptions...")
quest_descriptions = {}

try:
    shared_env = UnityPy.load(SHARED_BUNDLE)
    quests_shared = {}  # numeric_id → string_key, for QuestsTable only
    for obj in shared_env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
            name = tree.get("m_Name", "")
            if "QuestsTable" not in name or "Shared" not in name:
                continue
            for entry in (tree.get("m_Entries") or []):
                if isinstance(entry, dict):
                    num_id = entry.get("m_Id")
                    str_key = entry.get("m_Key", "")
                    if num_id is not None and str_key:
                        quests_shared[num_id] = str_key
            log(f"  QuestsTable shared keys: {len(quests_shared)}")
        except Exception:
            continue

    english_env = UnityPy.load(ENGLISH_BUNDLE)
    for obj in english_env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
            if tree.get("m_Name") != "QuestsTable_en":
                continue
            for entry in (tree.get("m_TableData") or []):
                if not isinstance(entry, dict):
                    continue
                num_id = entry.get("m_Id")
                localized = entry.get("m_Localized", "")
                if num_id is None or not localized:
                    continue
                str_key = quests_shared.get(num_id, "")
                m = re.match(r"^(\d+)_descr$", str_key)
                if m:
                    quest_descriptions[int(m.group(1))] = localized
            log(f"  Quest descriptions found in localization: {len(quest_descriptions)}")
        except Exception:
            continue
except Exception as e:
    log(f"  Warning: Could not load localization bundles: {e}")

# ---------------------------------------------------------------------------
# Step 3: Quest ScriptableObject data from main game data files
# Quest uses Resources.LoadAll("Quests/") so assets live in resources.assets,
# NOT in the Addressables StreamingAssets bundles (which strip type trees).
# ---------------------------------------------------------------------------
log("\nScanning main game data files for Quest ScriptableObjects...")

# Scan resources.assets first (most likely location), then sharedassets files
asset_files = [os.path.join(GAME_DATA_PATH, "resources.assets")]
asset_files += sorted(glob.glob(os.path.join(GAME_DATA_PATH, "sharedassets*.assets")))
log(f"Files to scan: {[os.path.basename(f) for f in asset_files]}")

quests_so = {}  # quest_id (int) → extracted data

def try_extract_quest(tree, source):
    """Try to extract Quest fields from a typetree dict. Returns dict or None."""
    if not isinstance(tree, dict) or not tree:
        return None
    # Quest signature: "Id" (BaseScriptableObject) + "availableDateRange"
    quest_id_raw = tree.get("Id")
    date_range   = tree.get("availableDateRange")
    if quest_id_raw is None or date_range is None:
        return None
    qid = int(quest_id_raw)
    if qid not in known_quest_ids:
        return None

    dr = date_range if isinstance(date_range, dict) else {}
    return {
        "qid":                        qid,
        "display_title":              tree.get("displayTitle") or None,
        "description_so":             tree.get("description") or None,
        "available_start_season":     int(dr.get("startSeason", 0)),
        "available_first_day":        int(dr.get("firstDay", 1)),
        "available_end_season":       int(dr.get("endSeason", 3)),
        "available_last_day":         int(dr.get("lastDay", 28)),
        "reward_money":               int(tree.get("rewardMoney", 0)),
        "reward_relationship_points": int(tree.get("rewardRelationshipPoints", 0)),
        "is_town_quest":              bool(tree.get("townQuest", False)),
        "is_donation_quest":          bool(tree.get("donationQuest", False)),
        "is_rootcellar_quest":        bool(tree.get("rootcellarQuest", False)),
        "is_vip_quest":               bool(tree.get("isVIPQuest", False)),
        "source":                     source,
    }

for asset_path in asset_files:
    if not os.path.exists(asset_path):
        continue
    asset_name = os.path.basename(asset_path)
    try:
        env = UnityPy.load(asset_path)
        found_in_file = 0
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            try:
                tree = obj.read_typetree()
                result = try_extract_quest(tree, asset_name)
                if result:
                    qid = result.pop("qid")
                    quests_so[qid] = result
                    found_in_file += 1
                    log(f"  [{asset_name}] Quest {qid}: {quest_names.get(qid, '?')}")
            except Exception:
                continue
        if found_in_file:
            log(f"  → {found_in_file} quests found in {asset_name}")
    except Exception as e:
        log(f"  Failed to load {asset_name}: {e}")
        continue

log(f"\nExtracted {len(quests_so)} quest ScriptableObjects total")
if len(quests_so) == 0:
    log("  NOTE: No ScriptableObject data found.")
    log("  Possible causes:")
    log("    - Type trees stripped in this build (check with a Unity asset viewer)")
    log("    - Quest assets stored in a different file")
    log("  Output will still contain names and any descriptions from localization.")

# ---------------------------------------------------------------------------
# Step 4: Merge and output
# ---------------------------------------------------------------------------
log("\nBuilding output...")
quests_output = []

for qid, name in sorted(quest_names.items()):
    so = quests_so.get(qid, {})
    start_s = so.get("available_start_season", 0)
    end_s   = so.get("available_end_season", 3)

    entry = {
        "id":   qid,
        "name": name,
        # Description: prefer localization table, fall back to SO field
        "description": quest_descriptions.get(qid) or so.get("description_so") or None,
        # The SO displayTitle is the hardcoded English dev title (often same as name)
        "display_title": so.get("display_title") or None,
        # Availability window (None fields mean SO data wasn't readable)
        "available_start_season":      start_s if so else None,
        "available_start_season_name": SEASONS[start_s] if so and 0 <= start_s < len(SEASONS) else None,
        "available_first_day":         so.get("available_first_day") if so else None,
        "available_end_season":        end_s if so else None,
        "available_end_season_name":   SEASONS[end_s] if so and 0 <= end_s < len(SEASONS) else None,
        "available_last_day":          so.get("available_last_day") if so else None,
        # Rewards
        "reward_money":                so.get("reward_money", 0) if so else None,
        "reward_relationship_points":  so.get("reward_relationship_points", 0) if so else None,
        # Quest type flags
        "is_town_quest":       so.get("is_town_quest", False) if so else None,
        "is_donation_quest":   so.get("is_donation_quest", False) if so else None,
        "is_rootcellar_quest": so.get("is_rootcellar_quest", False) if so else None,
        "is_vip_quest":        so.get("is_vip_quest", False) if so else None,
    }
    quests_output.append(entry)

output = {
    "meta": {
        "total_quests":                len(quests_output),
        "quests_with_so_data":         len(quests_so),
        "quests_with_descriptions":    len(quest_descriptions),
    },
    "quests": quests_output,
}

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

log(f"\nWritten to {OUTPUT_PATH}")
log(f"  Total quests:              {len(quests_output)}")
log(f"  With ScriptableObject data (dates/rewards/flags): {len(quests_so)}")
log(f"  With descriptions from localization:              {len(quest_descriptions)}")

with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"Log saved to {LOG_PATH}")
