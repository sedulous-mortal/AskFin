"""
Cross-reference character IDs with CharactersTable localization to verify ID→name mapping.
Also extract all character first names so we know all villager IDs.
"""
import UnityPy
import re
import json

SHARED_BUNDLE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\StreamingAssets\aa\StandaloneWindows64\localization-assets-shared_assets_all.bundle"
ENGLISH_BUNDLE = r"C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data\StreamingAssets\aa\StandaloneWindows64\localization-string-tables-english(en)_assets_all.bundle"

# Load shared bundle to get ID→key mapping for CharactersTable
shared_env = UnityPy.load(SHARED_BUNDLE)
chars_id_to_key = {}  # numeric_id -> string_key (e.g. "131_firstname")

for obj in shared_env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
        name = tree.get("m_Name", "")
        if "CharacterTable" not in name:
            continue
        entries = tree.get("m_Entries", [])
        for entry in entries:
            if isinstance(entry, dict):
                num_id = entry.get("m_Id")
                str_key = entry.get("m_Key", "")
                if num_id is not None and str_key:
                    chars_id_to_key[num_id] = str_key
        if chars_id_to_key:
            print(f"Found CharactersTable: '{name}' with {len(chars_id_to_key)} entries")
    except Exception:
        continue

if not chars_id_to_key:
    print("No CharactersTable found in shared bundle")

# Load English bundle to get the actual localized names
english_env = UnityPy.load(ENGLISH_BUNDLE)
id_to_name = {}  # numeric_id -> firstname

for obj in english_env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        tree = obj.read_typetree()
        table_name = tree.get("m_Name", "")
        if "CharacterTable" not in table_name:
            continue
        table_data = tree.get("m_TableData", [])
        print(f"Found English table: '{table_name}' with {len(table_data)} entries")
        for entry in table_data:
            if not isinstance(entry, dict):
                continue
            num_id = entry.get("m_Id")
            localized = entry.get("m_Localized", "")
            if num_id is None or not localized:
                continue
            str_key = chars_id_to_key.get(num_id, "")
            m = re.match(r"^(\d+)_firstname$", str_key)
            if m:
                char_id = int(m.group(1))
                id_to_name[char_id] = localized
    except Exception:
        continue

print(f"\nCharacter ID to Name mapping ({len(id_to_name)} total):")
for char_id in sorted(id_to_name.keys()):
    print(f"  {char_id}: {id_to_name[char_id]}")

with open(r"C:\Users\ansob\claude-tests\AskFin\server\helpers\char_id_names.json", "w") as f:
    json.dump(id_to_name, f, indent=2)
print("\nSaved to char_id_names.json")
