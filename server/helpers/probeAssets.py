"""Diagnostic: find which .assets files contain MonoBehaviours with myName field."""
import UnityPy
import os

GAME_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"

# All asset files to scan
asset_files = [f for f in os.listdir(GAME_DATA) if f.endswith(".assets")]
asset_files.sort()

print(f"Scanning {len(asset_files)} .assets files...")

for fname in asset_files:
    path = os.path.join(GAME_DATA, fname)
    try:
        env = UnityPy.load(path)
        found = 0
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            try:
                tree = obj.read_typetree()
                if "myName" in tree and "birthDay" in tree:
                    found += 1
            except Exception:
                continue
        if found:
            print(f"  {fname}: {found} Character objects found!")
        else:
            mb_count = sum(1 for o in env.objects if o.type.name == "MonoBehaviour")
            print(f"  {fname}: {mb_count} MonoBehaviours, 0 Characters")
    except Exception as e:
        print(f"  {fname}: ERROR - {e}")
