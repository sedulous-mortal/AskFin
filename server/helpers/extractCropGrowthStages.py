"""
Extract CropData growth stage thresholds from Grimshire's asset bundles.

For each crop, reads:
  - ID (cropRefId)
  - isMultiHarvest
  - growthStages[].daysRequired
  - growthStages[].isHarvestable
  - growthStages[].goneToSeedStage

Output: server/helpers/crop_growth_stages.json
  { "<cropRefId>": { "daysToMaturity": int, "goneToSeedDays": int | null, "isMultiHarvest": bool } }
"""
import UnityPy
import json
import os

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
BUNDLES_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\StreamingAssets\aa\StandaloneWindows64"
OUTPUT_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\crop_growth_stages.json"

# Collect all files to scan:
#   - resources.assets + sharedassets*.assets in GAME_DATA
#   - all *.bundle files in the Addressables directory
asset_files = []
for name in os.listdir(GAME_DATA):
    if name == "resources.assets" or (name.startswith("sharedassets") and name.endswith(".assets")):
        asset_files.append(os.path.join(GAME_DATA, name))

bundle_files = []
if os.path.isdir(BUNDLES_DIR):
    for name in os.listdir(BUNDLES_DIR):
        if name.endswith(".bundle"):
            bundle_files.append(os.path.join(BUNDLES_DIR, name))

all_files = asset_files + bundle_files
print(f"Scanning {len(asset_files)} asset files + {len(bundle_files)} bundles for CropData...")

results = {}

for fname in all_files:
    fpath = fname  # already absolute
    if not os.path.exists(fpath):
        continue
    short = os.path.basename(fpath)
    try:
        env = UnityPy.load(fpath)
    except Exception as e:
        print(f"  Skipping {short}: {e}")
        continue

    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:
            continue

        # CropData has a 'growthStages' list — use that as the discriminator
        growth_stages = tree.get("growthStages")
        if not growth_stages or not isinstance(growth_stages, list):
            continue

        # Verify it looks like CropData (stages have daysRequired + isHarvestable)
        if not any("daysRequired" in s for s in growth_stages if isinstance(s, dict)):
            continue

        crop_id = tree.get("ID") or tree.get("id")
        if not crop_id:
            # Try to get it from m_Name as a fallback
            name_str = tree.get("m_Name", "")
            print(f"  WARNING: CropData with no ID field, m_Name={name_str!r}, skipping (in {short})")
            continue

        crop_id = int(crop_id)
        is_multi = tree.get("isMultiHarvest", False)

        # Walk growth stages in order to find:
        # 1) daysToMaturity: DaysRequired of first Harvestable stage
        # 2) goneToSeedDays: DaysRequired of the first GoneToSeedStage
        days_to_maturity = None
        gone_to_seed_days = None

        for stage in growth_stages:
            if not isinstance(stage, dict):
                continue
            days_req = stage.get("daysRequired", 0)
            is_harvestable = stage.get("isHarvestable", False)
            is_gone_to_seed = stage.get("goneToSeedStage", False)

            if is_harvestable and days_to_maturity is None:
                days_to_maturity = days_req

            if is_gone_to_seed and gone_to_seed_days is None:
                gone_to_seed_days = days_req

        if days_to_maturity is None:
            # No harvestable stage found — skip (e.g. hay)
            continue

        crop_name = tree.get("m_Name", f"crop_{crop_id}")
        results[str(crop_id)] = {
            "name": crop_name,
            "isMultiHarvest": is_multi,
            "daysToMaturity": days_to_maturity,
            "goneToSeedDays": gone_to_seed_days,
        }
        seed_info = f"goneToSeedDays={gone_to_seed_days}" if gone_to_seed_days else "no gone-to-seed"
        print(f"  [{short}] CropData ID={crop_id} '{crop_name}': daysToMaturity={days_to_maturity}, {seed_info}, isMultiHarvest={is_multi}")

print(f"\nExtracted {len(results)} crops total.")

# Also check if we missed any crop IDs from our existing crop_maturity.json
MATURITY_PATH = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\crop_maturity.json"
if os.path.exists(MATURITY_PATH):
    with open(MATURITY_PATH, encoding="utf-8") as f:
        existing = json.load(f)
    known_ids = set(existing.keys())
    found_ids = set(results.keys())
    missing = known_ids - found_ids
    if missing:
        print(f"\nWARNING: crop IDs in crop_maturity.json not found in assets: {missing}")
    extra = found_ids - known_ids
    if extra:
        print(f"NOTE: crop IDs found in assets but not in crop_maturity.json: {extra}")

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(f"\nWritten to {OUTPUT_PATH}")
