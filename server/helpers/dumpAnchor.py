"""Dump the raw bytes around the Adeline anchor to understand the object structure."""
import struct

RESOURCES = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"

with open(RESOURCES, "rb") as f:
    data = f.read()

# Adeline anchor at 86,709,960, Fin at 86,765,188
# Let's dump Adeline's region to understand the layout
anchor_pos = 86709960  # Adeline
length = 800

print(f"Hex dump around Adeline anchor (pos={anchor_pos}):")
window = data[anchor_pos:anchor_pos + length]

# Print hex + ASCII
for i in range(0, length, 16):
    chunk = window[i:i+16]
    hex_part = " ".join(f"{b:02x}" for b in chunk)
    ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
    print(f"  {anchor_pos+i:08x}: {hex_part:<48} {ascii_part}")

# Also look at what range Fin's object might occupy
fin_anchor = 86765188
next_anchor = 86766520  # Greta's anchor
fin_object_size = next_anchor - fin_anchor
print(f"\nFin anchor: {fin_anchor}, next (Greta): {next_anchor}")
print(f"Estimated Fin object size: {fin_object_size} bytes")

# Look for birthday pattern in Fin's estimated range
SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]
print(f"\nSearching for birthday in Fin's object range ({fin_anchor} to {next_anchor}):")
for offset in range(0, fin_object_size, 4):
    pos = fin_anchor + offset
    if pos + 16 > len(data):
        break
    day, season, year, minute = struct.unpack_from("<iiif", data, pos)
    if 1 <= day <= 28 and 0 <= season <= 3 and year == 1 and abs(minute - 360.0) < 0.1:
        print(f"  Offset {offset}: {SEASON_NAMES[season]} {day} (Year={year}, Minute={minute:.1f})")
