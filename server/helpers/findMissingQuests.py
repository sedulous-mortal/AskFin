"""
Scans all Grimshire asset files to find which file contains the 7 missing
specimen donation quest MonoBehaviours (IDs 517, 518, 863-866, 1323).

Even with stripped type trees, UnityPy can usually still read m_Name.
We look for MonoBehaviours whose m_Name matches known quest asset names.

Run: python server/helpers/findMissingQuests.py
"""
import UnityPy
import os
import glob

GAME_DATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
LOG_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\find_missing_log.txt"

MISSING_IDS = {517, 518, 863, 864, 865, 866, 1323}

lines = []
def log(msg=""):
    print(msg)
    lines.append(str(msg))

# Scan all .assets files
asset_files = sorted(glob.glob(os.path.join(GAME_DATA_PATH, "*.assets")))
log(f"Scanning {len(asset_files)} .assets files for missing quests...\n")

for asset_path in asset_files:
    asset_name = os.path.basename(asset_path)
    try:
        env = UnityPy.load(asset_path)
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            try:
                # Try read() first — gives access to m_Name even on stripped trees
                data = obj.read()
                name = getattr(data, 'm_Name', '') or ''
                if not name:
                    # Fallback: try read_typetree and grab m_Name key
                    tree = obj.read_typetree()
                    name = tree.get('m_Name', '') if isinstance(tree, dict) else ''

                name_lower = name.lower()
                # These donation/research quests likely have "specimen", "donate",
                # "research", or "rootcellar" in their asset name
                if any(kw in name_lower for kw in ('specimen', 'donat', 'research', 'rootcellar', 'donation')):
                    log(f"  [{asset_name}] POSSIBLE MATCH: m_Name={name!r}")

                # Also flag any MonoBehaviour with a name matching our known quest names
                known_names = {
                    'researchspecimens', 'donate50specimens', 'donate75specimens',
                    'donate100specimens', 'donate125specimens', 'donate148specimens',
                    'donate30specimens', 'rootcellarquest',
                }
                if name_lower.replace(' ', '').replace('_', '') in known_names:
                    log(f"  [{asset_name}] EXACT MATCH: m_Name={name!r}")

            except Exception:
                continue
    except Exception as e:
        log(f"  Failed to load {asset_name}: {e}")

log("\nAlso scanning Addressables bundles...")
bundle_files = sorted(glob.glob(os.path.join(
    GAME_DATA_PATH, r"StreamingAssets\aa\StandaloneWindows64\*.bundle"
)))
for bundle_path in bundle_files:
    bundle_name = os.path.basename(bundle_path)
    try:
        env = UnityPy.load(bundle_path)
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            try:
                data = obj.read()
                name = getattr(data, 'm_Name', '') or ''
                if not name:
                    tree = obj.read_typetree()
                    name = tree.get('m_Name', '') if isinstance(tree, dict) else ''
                name_lower = name.lower()
                if any(kw in name_lower for kw in ('specimen', 'donat', 'research', 'rootcellar')):
                    log(f"  [{bundle_name}] POSSIBLE MATCH: m_Name={name!r}")
            except Exception:
                continue
    except Exception:
        continue

log("\nDone.")
with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
log(f"Log saved to {LOG_PATH}")
