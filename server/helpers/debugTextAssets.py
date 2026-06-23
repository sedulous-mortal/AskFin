import UnityPy

for fname in [
    r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\sharedassets1.assets",
    r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets",
]:
    print(f"\n=== {fname.split(chr(92))[-1]} ===")
    env = UnityPy.load(fname)
    for obj in env.objects:
        if obj.type.name == "TextAsset":
            try:
                data = obj.read()
                print(f"  attrs={[a for a in dir(data) if not a.startswith('_')]}")
                # Try common attribute names
                for attr in ('text', 'script', 'm_Script', 'bytes', 'name', 'm_Name'):
                    if hasattr(data, attr):
                        val = getattr(data, attr)
                        if val:
                            print(f"    {attr}={repr(str(val)[:100])}")
                break  # just first one
            except Exception as e:
                print(f"  ERROR reading: {e}")
                break
