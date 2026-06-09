"""
Broader scan — look for Craft_, Station_, Item_Craft, and nearby context
around known crafting recipe IDs from the save file.
"""
import re, struct

ASSETS_FILE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"

with open(ASSETS_FILE, "rb") as f:
    raw = f.read()

def scan(keyword, pre=0, post=60):
    pat = re.compile(
        rb'(?:[A-Za-z0-9_]{0,' + str(pre).encode() + rb'})' +
        keyword.encode() +
        rb'(?:[A-Za-z0-9_ \-]{0,' + str(post).encode() + rb'})',
        re.IGNORECASE,
    )
    return sorted(set(m.group().decode("latin-1") for m in re.finditer(pat, raw)))

for kw in ["Craft_", "CraftRecipe", "CraftItem", "Station_Craft",
           "carpent", "furniture", "Furniture", "Workbench",
           "Schematic", "schematic", "Pattern", "pattern"]:
    hits = scan(kw)
    if hits:
        print(f"'{kw}' -> {len(hits)} hits: {hits[:10]}")
    else:
        print(f"'{kw}' -> (none)")

# Check context around known crafting recipe IDs (427=Bed of Straw, 1453=Mounted Display)
print("\n=== Context around known crafting recipe IDs in binary ===")
# These IDs will appear as 4-byte little-endian ints in the serialized data
for item_id, name in [(427, "Bed of Straw"), (1453, "Mounted Display"), (1454, "Shelf Display")]:
    id_bytes = struct.pack("<i", item_id)
    idx = raw.find(id_bytes)
    while idx != -1:
        # grab 60 bytes around it and show any printable chars
        window = raw[max(0,idx-40):idx+44]
        printable = re.sub(rb'[^\x20-\x7e]', b'.', window).decode("latin-1")
        if any(c.isalpha() for c in printable):
            print(f"  ID {item_id} ({name}) at offset {idx}: {printable!r}")
            break
        idx = raw.find(id_bytes, idx+1)
