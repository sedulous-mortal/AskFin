"""
Extract NPC shop inventories from Grimshire Unity assets.

Strategy:
  Pass 0 - find MonoScript path_ids for StoreStockProfile and ALL InventoryItem subclasses
  Pass 1 - scan all MonoBehaviours: build path_id -> game_item_id for every InventoryItem variant
  Pass 2 - find StoreStockProfile objects, parse item lists using the path_id map

Binary layout (Unity 2022, big_id_enabled = 64-bit path IDs):
  MonoBehaviour header:
    PPtr<GameObject>  m_GameObject  = int32 + int64 = 12 bytes
    uint8 m_Enabled + 3 pad bytes                   = 4  bytes
    PPtr<MonoScript>  m_Script      = int32 + int64 = 12 bytes
    string m_Name  = int32 len + bytes + align4     = variable

  InventoryItem first custom field = int32 itemId

  StoreStockProfile custom fields:
    List<ShopStockItem> itemsList
      int32 count
      per item: PPtr<InventoryItem>(12) + int32 min + int32 max + int32 tier
    int32 storeType
    int32 basicItemCredits
    int32 goodItemCredits
    int32 rareItemCredits
    bool  OffsetStockByAWeek + 3 pad
"""

import UnityPy
import struct
import json
import os

GAME_DATA    = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data"
GAME_ID_MAPS = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\game_id_maps.json"
OUTPUT_PATH  = r"C:\Users\ansob\claude-tests\AskFin\server\helpers\npc_shops.json"

SHOP_TYPES = [
    "GeneralStore", "Trader", "Blacksmith", "Furniture", "Herbalist",
    "Ranch", "Trapper", "Baker", "Fisher", "Carpenter", "Artist", "Tavern",
    "FlowerFestival", "SheddingFestival", "HarvestFestival", "NewYearsFestival",
]
SHOP_TIERS = {0: "Basic", 1: "Good", 2: "Rare"}

# All classes that extend InventoryItem (directly or via subclasses)
ITEM_CLASSES = {
    "InventoryItem", "Seeds", "TreeSeeds", "Fish",
    "EquippableTool", "AxeEquipTool", "FishingEquipTool", "HoeEquipTool",
    "MilkerEquipTool", "PickaxeEquipTool", "ScytheEquipTool",
    "ShearsEquipTool", "WaterCanEquipTool",
    "Compost", "Recipe", "FoundationBlueprint", "WaterPipe",
}

# ---- Binary helpers ----
def r_i32(d, p):   return struct.unpack_from("<i", d, p)[0], p + 4
def r_i64(d, p):   return struct.unpack_from("<q", d, p)[0], p + 8
def r_b4(d, p):    return d[p], p + 4          # bool + 3 align bytes
def r_pptr(d, p):                               # int32 file_id + int64 path_id
    fid, p = r_i32(d, p)
    pid, p = r_i64(d, p)
    return (fid, pid), p
def r_str(d, p):
    n, p = r_i32(d, p)
    s = d[p:p + n].decode("utf-8", errors="replace")
    p += n
    if n % 4: p += 4 - (n % 4)
    return s, p
def mono_header(data):
    """Returns (script_pptr, name, custom_data_start_pos)."""
    pos = 0
    _, pos = r_pptr(data, pos)          # m_GameObject
    _, pos = r_b4(data, pos)            # m_Enabled + pad
    sp, pos = r_pptr(data, pos)         # m_Script
    nm, pos = r_str(data, pos)          # m_Name
    return sp, nm, pos


# ---- Load assets ----
print("Loading game data directory...")
env = UnityPy.load(GAME_DATA)
with open(GAME_ID_MAPS, encoding="utf-8") as f:
    item_names = {int(k): v for k, v in json.load(f).get("InventoryItems_en", {}).items()}


# ---- Pass 0: collect MonoScript path_ids we care about ----
print("\nPass 0: finding MonoScript path_ids...")
ssp_pids   = set()   # StoreStockProfile script path_ids
item_pids  = set()   # all InventoryItem variant script path_ids

for obj in env.objects:
    if obj.type.name != "MonoScript":
        continue
    try:
        raw = obj.read()
        cname = getattr(raw, "m_ClassName", "")
        if cname == "StoreStockProfile":
            ssp_pids.add(obj.path_id)
            print(f"  StoreStockProfile MonoScript path_id={obj.path_id}")
        elif cname in ITEM_CLASSES:
            item_pids.add(obj.path_id)
            print(f"  {cname} MonoScript path_id={obj.path_id}")
    except Exception:
        continue


# ---- Pass 1: map (assets_file, path_id) -> game item ID for every InventoryItem ----
print("\nPass 1: mapping all InventoryItem objects to game IDs...")
inv_map = {}   # path_id -> game_item_id  (path_ids are unique within resources.assets)

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        data = obj.get_raw_data()
        if not data or len(data) < 40:
            continue
        sp, name, pos = mono_header(data)
        if sp[1] not in item_pids:
            continue
        if pos + 4 > len(data):
            continue
        iid, _ = r_i32(data, pos)
        if 1 <= iid <= 9999:
            inv_map[obj.path_id] = iid
    except Exception:
        continue

print(f"  Mapped {len(inv_map)} InventoryItem objects")


# ---- Pass 2: extract StoreStockProfile data ----
print("\nPass 2: extracting shop inventories...")
shop_data = {}

for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        data = obj.get_raw_data()
        if not data or len(data) < 60:
            continue
        sp, name, pos = mono_header(data)
        if sp[1] not in ssp_pids:
            continue

        # itemsList
        count, pos = r_i32(data, pos)
        items = []
        for _ in range(count):
            if pos + 24 > len(data):
                break
            item_pp, pos = r_pptr(data, pos)   # PPtr<InventoryItem>
            mn, pos = r_i32(data, pos)
            mx, pos = r_i32(data, pos)
            ti, pos = r_i32(data, pos)
            game_id = inv_map.get(item_pp[1])
            items.append({
                "game_id":    game_id,
                "name":       item_names.get(game_id) if game_id else None,
                "min_amount": mn,
                "max_amount": mx,
                "tier":       SHOP_TIERS.get(ti, f"?({ti})"),
                "_path_id":   item_pp[1],   # debug — remove if desired
            })

        if pos + 20 > len(data):
            continue
        st, pos   = r_i32(data, pos)
        bc, pos   = r_i32(data, pos)
        gc, pos   = r_i32(data, pos)
        rc, pos   = r_i32(data, pos)
        ow        = data[pos] if pos < len(data) else 0

        sname = SHOP_TYPES[st] if 0 <= st < len(SHOP_TYPES) else f"Unknown({st})"
        print(f"  {sname} ({name}): {len(items)} items, basic={bc} good={gc} rare={rc} offsetByWeek={bool(ow)}")
        for it in items:
            status = f"game_id={it['game_id']} {it['name']!r}" if it['game_id'] else f"UNRESOLVED path_id={it['_path_id']}"
            print(f"    {status} min={it['min_amount']} max={it['max_amount']} tier={it['tier']}")

        shop_data[sname] = {
            "shop_type_id":      st,
            "basicItemCredits":  bc,
            "goodItemCredits":   gc,
            "rareItemCredits":   rc,
            "offsetStockByAWeek": bool(ow),
            "items": items,
        }

    except Exception:
        continue

print(f"\nTotal shops: {len(shop_data)}")

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(shop_data, f, indent=2, ensure_ascii=False)
print(f"Written to {OUTPUT_PATH}")
