"""
Extract villager gift preferences.

Confirmed facts:
  DATA_OFFSET = 672,304
  Object table entry size = 24 bytes: int64 pathID | int64 byteStart | int32 byteSize | int32 typeID
  pathID 25184 is at meta offset 611,684 (PROBE_META_OFFSET)
  Gift PPtrs: int32 fileID (=0) + int64 pathID = 12 bytes
  Portrait sprites: 15 PPtrs before the likes list
"""

import struct, json, os

RESOURCES    = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\resources.assets"
GAME_ID_MAPS = os.path.join(os.path.dirname(__file__), "game_id_maps.json")
OUTPUT       = os.path.join(os.path.dirname(__file__), "..", "..", "client", "src", "data", "villager_gifts.json")

with open(GAME_ID_MAPS, encoding="utf-8") as f:
    id_to_name: dict[str, str] = json.load(f)["InventoryItems_en"]
VALID_IDS = {int(k) for k in id_to_name if int(k) >= 2}

DATA_OFFSET        = 672_304
ENTRY_SIZE         = 24
PPTR_SIZE          = 12
PORTRAIT_COUNT     = 15
PROBE_META_OFFSET  = 611_684   # meta position where pathID 25184 entry begins
PROBE_PATH_ID      = 25184     # Edgar's first like — used to calibrate Id field offset

print("Reading raw binary …")
with open(RESOURCES, "rb") as f:
    data = f.read()
print(f"  {len(data):,} bytes\n")

meta = data[:DATA_OFFSET]

# ── Build pathID → abs_off map from object table ──────────────────────────────

# Walk backwards from probe to find the start of the table
pos = PROBE_META_OFFSET
while pos >= ENTRY_SIZE:
    prev = pos - ENTRY_SIZE
    pid = struct.unpack_from("<q", meta, prev)[0]
    if pid <= 0 or pid > 10_000_000:
        break
    bs = struct.unpack_from("<Q", meta, prev + 8)[0]
    if DATA_OFFSET + bs >= len(data):
        break
    pos = prev
table_start = pos

path_to_abs: dict[int, int] = {}
pos = table_start
while pos + ENTRY_SIZE <= len(meta):
    pid = struct.unpack_from("<q", meta, pos)[0]
    if pid <= 0 or pid > 10_000_000:
        break
    bs = struct.unpack_from("<Q", meta, pos + 8)[0]
    ao = DATA_OFFSET + bs
    if ao < len(data):
        path_to_abs[pid] = ao
    pos += ENTRY_SIZE

print(f"Object table: {len(path_to_abs):,} entries  (table starts at meta +{table_start:,})\n")


def resolve(path_id: int) -> str | None:
    ao = path_to_abs.get(path_id)
    if ao is None:
        return None
    # Confirmed layout (from hex):
    #   [0-27]:  fixed header (m_Script PPtr + early fields)
    #   [28-31]: code-name length (int32)
    #   [32+]:   code-name bytes + 0-3 pad to 4-byte align
    #   [32 + ((name_len+3)&~3)]: BaseScriptableObject.Id (int32)
    name_len = struct.unpack_from("<I", data, ao + 28)[0]
    if name_len > 256:
        return None
    id_off = 32 + ((name_len + 3) & ~3)
    item_id = struct.unpack_from("<i", data, ao + id_off)[0]
    return id_to_name.get(str(item_id))


print("Probe validation (Edgar's gift pathIDs):")
for pid in [25184, 25504, 25476, 25412, 25410, 25192]:
    ao = path_to_abs.get(pid)
    if ao is None:
        print(f"  {pid}: NOT in table")
        continue
    nlen = struct.unpack_from("<I", data, ao + 28)[0]
    id_off = 32 + ((nlen + 3) & ~3)
    item_id = struct.unpack_from("<i", data, ao + id_off)[0] if nlen <= 256 else -1
    nm = id_to_name.get(str(item_id), "(none)")
    print(f"  {pid}: code_name_len={nlen} id_off={id_off} item_id={item_id} → '{nm}'")
print()

# ── Character anchors (confirmed absolute byte positions in data) ──────────────

KNOWN_ANCHORS: dict[str, tuple] = {
    "Adeline":  (86_709_960, 131, 2, 17),
    "Beatrix":  (86_718_384, 132, 3, 13),
    "Beryl":    (86_728_864, 133, 3,  1),
    "Edgar":    (86_747_600, 136, 2, 23),
    "Ericka":   (86_755_896, 135, 3, 23),
    "Greta":    (86_766_520, 137, 2,  8),
    "Gruff":    (86_777_440, 138, 0,  9),
    "Hazel":    (86_783_560, 139, 1, 24),
    "Jack":     (86_788_636, 140, 3,  6),
    "Kai":      (86_798_620, 141, 0, 27),
    "Lila":     (86_804_172, 142, 0, 15),
    "Poppy":    (86_849_760, 146, 1,  8),
    "Prudence": (86_860_576, 147, 0,  5),
    "Tano":     (86_905_004, 152, 0, 28),
    "Wilfred":  (86_931_192, 156, 1,  4),
}
# Dudley's minute ≠ 360.0, handled separately
DUDLEY = (86_739_272, 134, 1, 18)

EXTRA_BDAYS: dict[str, tuple[int, int]] = {
    "Logan":   (1, 27), "Oliver":  (1,  7), "Rose":    (2,  2),
    "Rusty":   (1, 20), "Wallace": (2, 12), "Percy":   (2, 14),
    "Willow":  (2, 25), "Rowan":   (3, 11), "Rufus":   (3, 27),
    "Theo":    (0, 18),
}

found_extras: dict[str, tuple] = {}
CHAR_IDS = list(range(131, 160)) + [629, 630, 631, 632]
for name_str, (bds, bdd) in EXTRA_BDAYS.items():
    nb = name_str.encode()
    pat = struct.pack("<I", len(nb)) + nb
    for cid in CHAR_IDS:
        idb = struct.pack("<i", cid)
        p = 0
        while True:
            idx = data.find(idb, p)
            if idx == -1:
                break
            if pat in data[idx + 4 : idx + 40]:
                found_extras[name_str] = (idx, cid, bds, bdd)
                break
            p = idx + 1
        if name_str in found_extras:
            break

ALL_ANCHORS = {**KNOWN_ANCHORS, **found_extras}
print(f"Anchors found: {sorted(ALL_ANCHORS)}\n")

MINUTE_360 = struct.pack("<f", 360.0)


def find_bday(anchor: int, season: int, day: int) -> int | None:
    needle = struct.pack("<iii", day, season, 1) + MINUTE_360
    idx = data.find(needle, anchor, anchor + 50_000)
    return idx if idx != -1 else None


def find_bday_any(anchor: int, season: int, day: int) -> int | None:
    prefix = struct.pack("<iii", day, season, 1)
    for off in range(0, 50_000, 4):
        p = anchor + off
        if p + 16 > len(data):
            break
        if data[p : p + 12] == prefix:
            return p
    return None


def read_gifts(bday_abs: int):
    pos = bday_abs + 16 + PORTRAIT_COUNT * PPTR_SIZE
    lc = struct.unpack_from("<i", data, pos)[0]
    pos += 4
    likes, raw_likes = [], []
    for _ in range(max(0, min(lc, 30))):
        if pos + PPTR_SIZE > len(data):
            break
        pid = struct.unpack_from("<q", data, pos + 4)[0]
        raw_likes.append(pid)
        nm = resolve(pid)
        if nm:
            likes.append(nm)
        pos += PPTR_SIZE
    dc = struct.unpack_from("<i", data, pos)[0]
    pos += 4
    dislikes, raw_dislikes = [], []
    for _ in range(max(0, min(dc, 30))):
        if pos + PPTR_SIZE > len(data):
            break
        pid = struct.unpack_from("<q", data, pos + 4)[0]
        raw_dislikes.append(pid)
        nm = resolve(pid)
        if nm:
            dislikes.append(nm)
        pos += PPTR_SIZE
    return likes, dislikes, raw_likes, raw_dislikes


# ── Main parse loop ───────────────────────────────────────────────────────────

results: dict[str, dict] = {}
print("Parsing gifts …")

for cname, (anchor, cid, bds, bdd) in sorted(ALL_ANCHORS.items()):
    ba = find_bday(anchor, bds, bdd) or find_bday_any(anchor, bds, bdd)
    if ba is None:
        print(f"  {cname}: birthday not found")
        continue
    l, d, rl, rd = read_gifts(ba)
    results[cname] = {"favorites": l, "dislikes": d}
    print(f"  {cname}: likes={l or rl}  dislikes={d or rd}")

ba = find_bday_any(DUDLEY[0], DUDLEY[2], DUDLEY[3])
if ba:
    l, d, rl, rd = read_gifts(ba)
    results["Dudley"] = {"favorites": l, "dislikes": d}
    print(f"  Dudley: likes={l or rl}  dislikes={d or rd}")
else:
    print("  Dudley: birthday not found")

# ── Write output ──────────────────────────────────────────────────────────────

ex: dict = {}
if os.path.exists(OUTPUT):
    try:
        with open(OUTPUT, encoding="utf-8") as f:
            ex = json.load(f)
    except Exception:
        pass
ex.update(results)
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(ex, f, indent=2, ensure_ascii=False)
print(f"\nWritten {len(results)} villagers → {OUTPUT}")
