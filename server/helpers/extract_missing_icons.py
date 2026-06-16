"""
Find and extract the 6 missing item icons from Atlas_InventoryItems in resources.assets.
Saves directly to client/public/items/ with the correct display-name filenames.

Missing items:
  Coal.png        (ID ~, distinct from Charcoal)
  Fur.png         (ID 651, distinct from Hide)
  Lean_Meat.png   (ID 643)
  Rich_Meat.png   (ID 644)
  Mithril_Bar.png (ID 371)
  Fossil.png      (ID 235)
"""
import UnityPy
import os

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
RESOURCES  = os.path.join(GAME_DATA, "resources.assets")
OUTPUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"

# display_filename -> list of lowercase substrings to match in sprite name
TARGETS = {
    "Coal":       ["coal"],
    "Fur":        ["fur"],
    "Lean_Meat":  ["lean", "leanmeat", "lean_meat"],
    "Rich_Meat":  ["rich", "richmeat", "rich_meat"],
    "Mithril_Bar":["mithril_bar", "mithrilbar", "mithril bar"],
    "Fossil":     ["fossil"],
}

print("Loading resources.assets (this may take a moment)...")
env = UnityPy.load(RESOURCES)

objects_by_id = {obj.path_id: obj for obj in env.objects}

# Locate Atlas_InventoryItems
atlas_tree = None
for obj in env.objects:
    if obj.type.name == "SpriteAtlas":
        tree = obj.read_typetree()
        if tree.get("m_Name") == "Atlas_InventoryItems":
            atlas_tree = tree
            break

if not atlas_tree:
    print("ERROR: Atlas_InventoryItems not found in resources.assets!")
    raise SystemExit(1)

packed = atlas_tree.get("m_PackedSprites", [])
names  = atlas_tree.get("m_PackedSpriteNamesToIndex", [])
print(f"Atlas has {len(packed)} sprites")

# Show ALL sprite names for debugging — useful to spot exact name variants
print("\n-- All sprite names (for reference) --")
for n in sorted(names):
    for key, keywords in TARGETS.items():
        if any(kw in n.lower() for kw in keywords):
            print(f"  MATCH candidate for {key}: '{n}'")

# Collect candidates
candidates = {}  # display_key -> [(sprite_name, idx), ...]
for i, sprite_name in enumerate(names):
    lower = sprite_name.lower()
    for display_key, keywords in TARGETS.items():
        if any(kw in lower for kw in keywords):
            candidates.setdefault(display_key, []).append((sprite_name, i))

print("\n-- Candidates found --")
for key, hits in candidates.items():
    print(f"  {key}: {[h[0] for h in hits]}")

# For each target, pick the best candidate and extract it
print("\n-- Extracting --")
for display_key, hits in candidates.items():
    out_path = os.path.join(OUTPUT_DIR, display_key + ".png")
    if os.path.exists(out_path):
        print(f"  SKIP (already exists): {display_key}.png")
        continue

    # If multiple candidates, print them all and pick first
    if len(hits) > 1:
        print(f"  {display_key}: multiple matches {[h[0] for h in hits]} — using first")

    sprite_name, idx = hits[0]
    pptr = packed[idx]
    path_id = pptr.get("m_PathID") if isinstance(pptr, dict) else getattr(pptr, "path_id", None)

    if path_id not in objects_by_id:
        print(f"  ERROR: {display_key}: sprite '{sprite_name}' path_id={path_id} not in objects")
        continue

    try:
        sprite_obj = objects_by_id[path_id]
        sprite = sprite_obj.read()
        img = sprite.image
        img.save(out_path)
        print(f"  EXTRACTED: '{sprite_name}' -> {display_key}.png  ({img.size})")
    except Exception as e:
        print(f"  ERROR: {display_key}: {e}")

print("\nDone.")

# Report any targets with no candidate found
missing = [k for k in TARGETS if k not in candidates]
if missing:
    print(f"\nNo candidates found for: {missing}")
    print("Run with broader search — printing ALL sprite names for manual review:")
    for n in sorted(names):
        print(f"  {n}")
