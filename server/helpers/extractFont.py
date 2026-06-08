"""
Extracts the XiaolaiSC font (and any other fonts) from Grimshire's resources.assets
using UnityPy, and writes them as .ttf/.otf files to client/public/fonts/.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import UnityPy
import os

RESOURCES_ASSETS = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
OUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\fonts"

os.makedirs(OUT_DIR, exist_ok=True)

print(f"Loading {RESOURCES_ASSETS} ...")
env = UnityPy.load(RESOURCES_ASSETS)

extracted = []
for obj in env.objects:
    if obj.type.name == "Font":
        try:
            font = obj.read()
            name = getattr(font, "m_Name", None) or f"font_{obj.path_id}"
            font_data = getattr(font, "m_FontData", None)
            if not font_data:
                print(f"  [skip] {name} — no m_FontData")
                continue
            raw = bytes(font_data)
            # Detect format from magic bytes
            if raw[:4] == b"OTTO":
                ext = ".otf"
            elif raw[:4] in (b"\x00\x01\x00\x00", b"\x00\x00\x01\x00", b"true", b"typ1"):
                ext = ".ttf"
            else:
                ext = ".bin"
                print(f"  [warn] {name} — unknown magic {raw[:4].hex()}, saving as .bin")
            out_path = os.path.join(OUT_DIR, name + ext)
            with open(out_path, "wb") as f:
                f.write(raw)
            print(f"  [ok] {name} → {name}{ext} ({len(raw):,} bytes)")
            extracted.append(name)
        except Exception as e:
            print(f"  [error] path_id={obj.path_id}: {e}")

print(f"\nDone. Extracted {len(extracted)} font(s): {extracted}")
