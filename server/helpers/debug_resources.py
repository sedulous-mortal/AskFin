import UnityPy

SHARED_BUNDLE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\StreamingAssets\aa\StandaloneWindows64\localization-assets-shared_assets_all.bundle"
OUT = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\debug_shared_keys.txt"

env = UnityPy.load(SHARED_BUNDLE)
lines = []

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
        name = tree.get("m_Name", "")
        entries = tree.get("m_Entries", [])
        if not entries:
            continue
        keys = sorted(e.get("m_Key", "") for e in entries if isinstance(e, dict))
        lines.append(f"\n=== {name} ({len(keys)} keys) ===")
        for k in keys:
            lines.append(f"  {k}")
    except Exception:
        continue

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(f"Written to {OUT}")
