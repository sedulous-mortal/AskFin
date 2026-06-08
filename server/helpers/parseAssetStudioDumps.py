"""
Parses Quest MonoBehaviour dump files exported from UABE and merges them
with localized names/descriptions from the localization bundles.

Also resolves item requirements and reward items by reading m_Name values
from resources.assets (works even with stripped type trees).

Usage:
  1. In UABE, load resources.assets, filter for Quest MonoBehaviours,
     select all, Export Dump (JSON format) into one folder.
  2. Set DUMP_FOLDER below (or pass as first CLI arg) and run:
       python server/helpers/parseAssetStudioDumps.py [dump_folder]

Output: server/helpers/quests.json
"""
import json
import os
import re
import struct
import sys
import UnityPy

DUMP_FOLDER    = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\ansob\claude-tests\AskFin\quests"
EXISTING_MAPS  = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"
SHARED_BUNDLE  = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\StreamingAssets\aa\StandaloneWindows64\localization-assets-shared_assets_all.bundle"
ENGLISH_BUNDLE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\StreamingAssets\aa\StandaloneWindows64\localization-string-tables-english(en)_assets_all.bundle"
RESOURCES_ASSETS = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
OUTPUT_PATH    = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\quests.json"
LOG_PATH       = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\quest_parse_log.txt"

SEASONS = ["Spring", "Summer", "Fall", "Winter", "None"]

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

# ---------------------------------------------------------------------------
# Load existing localized data
# ---------------------------------------------------------------------------
with open(EXISTING_MAPS, encoding="utf-8") as f:
    game_maps = json.load(f)

quest_names = {int(k): v for k, v in game_maps.get("QuestsTable_en", {}).items()}
log(f"Loaded {len(quest_names)} quest names")

# Build reverse lookup: lowercased localized item name → canonical name
# Used to match m_Name asset names against known item names.
item_names_en = game_maps.get("InventoryItems_en", {})
item_name_lower_to_canonical = {v.lower(): v for v in item_names_en.values()}

# ---------------------------------------------------------------------------
# Build path_id → localized name map from resources.assets.
#
# InventoryItem ScriptableObjects have stripped type trees in release builds,
# so read_typetree() and obj.read() both fail. We parse raw bytes instead:
#
#   Unity 2022.x MonoBehaviour serialization layout (little-endian):
#     m_GameObject PPtr: int32 fileID (4) + int64 pathID (8) = 12 bytes
#     m_Enabled:        uint8 (1) + 3-byte padding             =  4 bytes
#     m_Script PPtr:    int32 fileID (4) + int64 pathID (8)    = 12 bytes
#     m_Name:           int32 length (4) + chars + alignment    = variable
#     <first custom field> = BaseScriptableObject.Id (int32)    =  4 bytes
#
# We extract Id and cross-reference with InventoryItems_en for the
# localized display name (e.g. "Hawthorn Berry" not "HawThorneBerry").
# We only process path IDs actually referenced in the quest dumps (~74 items).
# ---------------------------------------------------------------------------
log("\nCollecting item path IDs referenced in quest dumps...")
target_path_ids = set()
for fname in os.listdir(DUMP_FOLDER):
    if not fname.lower().endswith(".json"):
        continue
    try:
        with open(os.path.join(DUMP_FOLDER, fname), encoding="utf-8") as f:
            jdata = json.load(f)
        for field in ("requirements", "rewardItems"):
            for entry in (jdata.get(field, {}).get("Array") or []):
                pid = entry.get("item", {}).get("m_PathID", 0)
                if pid:
                    target_path_ids.add(int(pid))
    except Exception:
        continue
log(f"  Found {len(target_path_ids)} unique item path IDs to resolve")

log("Building item path-ID -> name map from resources.assets (raw bytes)...")
path_id_map = {}
try:
    res_env = UnityPy.load(RESOURCES_ASSETS)
    # Build full index first — this materializes objects with a non-streaming
    # reader that exposes byte_size, matching what diagRawBytes.py does.
    log("  Indexing all objects (this may take a moment)...")
    all_res_objects = {obj.path_id: obj for obj in res_env.objects}
    log(f"  Indexed {len(all_res_objects)} objects")
    for pid in target_path_ids:
        obj = all_res_objects.get(pid)
        if obj is None or obj.type.name != "MonoBehaviour":
            continue
        try:
            r = obj.reader
            r.Position = obj.byte_start
            raw = bytes(r.read_bytes(obj.byte_size))
            if len(raw) < 32:
                continue
            nlen = struct.unpack_from("<I", raw, 28)[0]
            if nlen == 0 or nlen > 200 or len(raw) < 32 + nlen:
                continue
            asset_name = raw[32:32 + nlen].decode("utf-8", errors="replace")
            padding = (4 - nlen % 4) % 4
            id_offset = 32 + nlen + padding
            if len(raw) >= id_offset + 4:
                game_id = struct.unpack_from("<i", raw, id_offset)[0]
                localized = item_names_en.get(str(game_id))
                path_id_map[obj.path_id] = localized if localized else asset_name
                log(f"  path_id={obj.path_id}  asset={asset_name!r}  game_id={game_id}  -> {path_id_map[obj.path_id]!r}")
            else:
                path_id_map[obj.path_id] = asset_name
                log(f"  path_id={obj.path_id}  asset={asset_name!r}  (no game_id field)")
        except Exception as e:
            log(f"  path_id={obj.path_id}: read error - {e}")
    log(f"  Resolved {len(path_id_map)} of {len(target_path_ids)} item path IDs")
except Exception as e:
    log(f"  Warning: could not build path-ID map from resources.assets: {e}")


def resolve_item_name(path_id):
    """
    Return the best display name for a given Unity asset path_id.
    Prefers a localized English name if the m_Name matches one exactly
    (case-insensitive); otherwise falls back to the raw m_Name.
    """
    raw = path_id_map.get(path_id)
    if not raw:
        return f"Unknown item (path_id={path_id})"
    canonical = item_name_lower_to_canonical.get(raw.lower())
    return canonical if canonical else raw


def resolve_items(raw_items):
    """Convert [{path_id, amount}] → [{name, amount}]."""
    return [{"name": resolve_item_name(r["path_id"]), "amount": r["amount"]} for r in raw_items]


# ---------------------------------------------------------------------------
# Pull descriptions from the localization bundle (key format: {id}_descr)
# ---------------------------------------------------------------------------
log("\nLoading descriptions from localization bundle...")
quest_descriptions = {}
try:
    shared_env = UnityPy.load(SHARED_BUNDLE)
    quests_shared = {}
    for obj in shared_env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
            if "QuestsTable" not in tree.get("m_Name", "") or "Shared" not in tree.get("m_Name", ""):
                continue
            for entry in (tree.get("m_Entries") or []):
                if isinstance(entry, dict):
                    num_id = entry.get("m_Id")
                    str_key = entry.get("m_Key", "")
                    if num_id is not None and str_key:
                        quests_shared[num_id] = str_key
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
        except Exception:
            continue
    log(f"  Found {len(quest_descriptions)} descriptions")
except Exception as e:
    log(f"  Warning: could not load localization bundles: {e}")

# ---------------------------------------------------------------------------
# Manual data for the 7 specimen donation quests that have no ScriptableObject.
# These are procedurally driven; dates span the full year (always active).
# ---------------------------------------------------------------------------
DONATION_QUEST_OVERRIDES = {
    517:  {"display_title": "Research Specimens",  "is_donation_quest": True, "reward_money": 0, "reward_relationship_points": 0},
    518:  {"display_title": "Donate 50 Specimens", "is_donation_quest": True, "reward_money": 0, "reward_relationship_points": 0},
    863:  {"display_title": "Donate 75 Specimens", "is_donation_quest": True, "reward_money": 0, "reward_relationship_points": 0},
    864:  {"display_title": "Donate 100 Specimens","is_donation_quest": True, "reward_money": 0, "reward_relationship_points": 0},
    865:  {"display_title": "Donate 125 Specimens","is_donation_quest": True, "reward_money": 0, "reward_relationship_points": 0},
    866:  {"display_title": "Donate 148 Specimens","is_donation_quest": True, "reward_money": 0, "reward_relationship_points": 0},
    1323: {"display_title": "Donate 30 Specimens", "is_donation_quest": True, "reward_money": 0, "reward_relationship_points": 0},
}

# ---------------------------------------------------------------------------
# Parse dump files
# ---------------------------------------------------------------------------
def extract_item_list(data, field_name):
    """Extract [{path_id, amount}] from a Unity Array field in the dump."""
    result = []
    for entry in (data.get(field_name, {}).get("Array") or []):
        pid = entry.get("item", {}).get("m_PathID", 0)
        amt = entry.get("amount", 1)
        if pid and pid != 0:
            result.append({"path_id": int(pid), "amount": int(amt)})
    return result


def parse_dump_file(path):
    """
    Parse an UABE dump (.txt or .json) for a Quest object.
    Returns a dict of extracted fields, or None if it doesn't look like a Quest.
    """
    _, ext = os.path.splitext(path)
    if ext.lower() == ".json":
        return parse_json_export(path)
    else:
        return parse_text_dump(path)


def parse_json_export(path):
    """Parse a JSON-format UABE export."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return None
        quest_id = data.get("Id")
        if quest_id is None:
            return None
        dr = data.get("availableDateRange", {})
        return {
            "id":                         int(quest_id),
            "display_title":              data.get("displayTitle") or None,
            "description_so":             data.get("description") or None,
            "available_start_season":     int(dr.get("startSeason", 0)),
            "available_first_day":        int(dr.get("firstDay", 1)),
            "available_end_season":       int(dr.get("endSeason", 3)),
            "available_last_day":         int(dr.get("lastDay", 28)),
            "reward_money":               int(data.get("rewardMoney", 0)),
            "reward_relationship_points": int(data.get("rewardRelationshipPoints", 0)),
            "is_town_quest":              bool(data.get("townQuest", False)),
            "is_donation_quest":          bool(data.get("donationQuest", False)),
            "is_rootcellar_quest":        bool(data.get("rootcellarQuest", False)),
            "is_vip_quest":               bool(data.get("isVIPQuest", False)),
            "requirements_raw":           extract_item_list(data, "requirements"),
            "reward_items_raw":           extract_item_list(data, "rewardItems"),
        }
    except Exception as ex:
        log(f"  JSON parse error in {os.path.basename(path)}: {ex}")
        return None


def parse_text_dump(path):
    """
    Parse an AssetStudio text dump.
    NOTE: text dumps don't expose nested Array items cleanly, so requirements
    and rewardItems will be empty. Use JSON export format for full data.
    """
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            raw_lines = f.readlines()
    except Exception as ex:
        log(f"  Read error in {os.path.basename(path)}: {ex}")
        return None

    fields = {}
    in_date_range = False
    date_range = {}

    for line in raw_lines:
        stripped = line.rstrip()
        if not stripped:
            continue
        content = stripped.lstrip("\t ")
        content = re.sub(r"^\d+ ", "", content)

        m = re.match(r"^(\S+)\s+(\S+)\s*=\s*(.*)$", content)
        if m:
            ftype, fname, fval = m.group(1), m.group(2), m.group(3).strip()
            if fval.startswith('"') and fval.endswith('"'):
                fval = fval[1:-1]

            if in_date_range:
                if fname in ("startSeason", "firstDay", "endSeason", "lastDay"):
                    try:
                        date_range[fname] = int(fval)
                    except ValueError:
                        pass
            else:
                if fname == "Id":
                    try:
                        fields["id"] = int(fval)
                    except ValueError:
                        pass
                elif fname == "displayTitle":
                    fields["display_title"] = fval or None
                elif fname == "description":
                    fields["description_so"] = fval or None
                elif fname == "rewardMoney":
                    try:
                        fields["reward_money"] = int(fval)
                    except ValueError:
                        fields["reward_money"] = 0
                elif fname == "rewardRelationshipPoints":
                    try:
                        fields["reward_relationship_points"] = int(fval)
                    except ValueError:
                        fields["reward_relationship_points"] = 0
                elif fname == "townQuest":
                    fields["is_town_quest"] = fval.lower() not in ("false", "0", "")
                elif fname == "donationQuest":
                    fields["is_donation_quest"] = fval.lower() not in ("false", "0", "")
                elif fname == "rootcellarQuest":
                    fields["is_rootcellar_quest"] = fval.lower() not in ("false", "0", "")
                elif fname == "isVIPQuest":
                    fields["is_vip_quest"] = fval.lower() not in ("false", "0", "")
        else:
            bm = re.match(r"^(\S+)\s+(\S+)\s*$", content)
            if bm and bm.group(2) == "availableDateRange":
                in_date_range = True
            elif in_date_range and bm and bm.group(2) not in ("startSeason", "firstDay", "endSeason", "lastDay"):
                in_date_range = False

    if "id" not in fields:
        return None

    fields["available_start_season"] = date_range.get("startSeason", 0)
    fields["available_first_day"]    = date_range.get("firstDay", 1)
    fields["available_end_season"]   = date_range.get("endSeason", 3)
    fields["available_last_day"]     = date_range.get("lastDay", 28)
    fields["requirements_raw"]       = []
    fields["reward_items_raw"]       = []
    return fields


# ---------------------------------------------------------------------------
# Scan dump folder
# ---------------------------------------------------------------------------
if not os.path.isdir(DUMP_FOLDER):
    log(f"ERROR: Dump folder not found: {DUMP_FOLDER}")
    log("Set DUMP_FOLDER at the top of this script or pass as first CLI argument.")
    sys.exit(1)

all_files = [
    os.path.join(DUMP_FOLDER, f)
    for f in os.listdir(DUMP_FOLDER)
    if f.lower().endswith((".txt", ".json", ".dump"))
]
log(f"\nFound {len(all_files)} dump files in {DUMP_FOLDER}")

quests_so = {}
for path in all_files:
    result = parse_dump_file(path)
    if result and "id" in result:
        qid = result["id"]
        quests_so[qid] = result
        reqs  = len(result.get("requirements_raw", []))
        rewds = len(result.get("reward_items_raw", []))
        log(f"  Parsed quest {qid}: {quest_names.get(qid, '?')}  (reqs={reqs}, reward_items={rewds})")
    else:
        log(f"  Skipped (no Quest ID): {os.path.basename(path)}")

log(f"\nSuccessfully parsed {len(quests_so)} quest objects")

# ---------------------------------------------------------------------------
# Merge and output
# ---------------------------------------------------------------------------
quests_output = []
for qid, name in sorted(quest_names.items()):
    so = quests_so.get(qid, {})
    override = DONATION_QUEST_OVERRIDES.get(qid, {})

    if override and not so:
        start_s, end_s = 0, 3
        entry = {
            "id":          qid,
            "name":        name,
            "description": quest_descriptions.get(qid) or None,
            "display_title": override.get("display_title") or None,
            "available_start_season":      start_s,
            "available_start_season_name": SEASONS[start_s],
            "available_first_day":         1,
            "available_end_season":        end_s,
            "available_end_season_name":   SEASONS[end_s],
            "available_last_day":          28,
            "reward_money":                override.get("reward_money", 0),
            "reward_relationship_points":  override.get("reward_relationship_points", 0),
            "requirements":                [],
            "reward_items":                [],
            "is_town_quest":       False,
            "is_donation_quest":   True,
            "is_rootcellar_quest": False,
            "is_vip_quest":        False,
        }
    else:
        start_s = so.get("available_start_season", 0)
        end_s   = so.get("available_end_season", 3)
        reqs_raw       = so.get("requirements_raw", [])
        reward_raw     = so.get("reward_items_raw", [])
        resolved_reqs  = resolve_items(reqs_raw)
        resolved_rwds  = resolve_items(reward_raw)

        if reqs_raw:
            log(f"  Quest {qid} requirements: {resolved_reqs}")
        if reward_raw:
            log(f"  Quest {qid} reward items: {resolved_rwds}")

        entry = {
            "id":          qid,
            "name":        name,
            "description": quest_descriptions.get(qid) or so.get("description_so") or None,
            "display_title": so.get("display_title") or None,
            "available_start_season":      start_s if so else None,
            "available_start_season_name": SEASONS[start_s] if so and 0 <= start_s < len(SEASONS) else None,
            "available_first_day":         so.get("available_first_day") if so else None,
            "available_end_season":        end_s if so else None,
            "available_end_season_name":   SEASONS[end_s] if so and 0 <= end_s < len(SEASONS) else None,
            "available_last_day":          so.get("available_last_day") if so else None,
            "reward_money":                so.get("reward_money", 0) if so else None,
            "reward_relationship_points":  so.get("reward_relationship_points", 0) if so else None,
            "requirements":                resolved_reqs,
            "reward_items":                resolved_rwds,
            "is_town_quest":       so.get("is_town_quest", False) if so else None,
            "is_donation_quest":   so.get("is_donation_quest", False) if so else None,
            "is_rootcellar_quest": so.get("is_rootcellar_quest", False) if so else None,
            "is_vip_quest":        so.get("is_vip_quest", False) if so else None,
        }
    quests_output.append(entry)

output = {
    "meta": {
        "total_quests":             len(quests_output),
        "quests_with_so_data":      len(quests_so),
        "quests_with_descriptions": len([q for q in quests_output if q["description"]]),
        "quests_with_requirements": len([q for q in quests_output if q["requirements"]]),
        "quests_with_reward_items": len([q for q in quests_output if q["reward_items"]]),
    },
    "quests": quests_output,
}

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

log(f"\nWritten to {OUTPUT_PATH}")
log(f"  Total:                {len(quests_output)}")
log(f"  With SO data:         {len(quests_so)}")
log(f"  With description:     {output['meta']['quests_with_descriptions']}")
log(f"  With requirements:    {output['meta']['quests_with_requirements']}")
log(f"  With reward items:    {output['meta']['quests_with_reward_items']}")

with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"Log saved to {LOG_PATH}")
