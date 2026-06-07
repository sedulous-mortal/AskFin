## Supabase Access Note

**Login with alex.bee.obie@gmail.com via email/password — do NOT use the GitHub-connected login button**, or you will not have access to the project.

Dashboard: https://supabase.com/dashboard/project/tsfvaiepnmnlijamkeua

## Core Feature — Save File Pipeline (Status & To-Do)

The central feature of AskFin is: user uploads a `.grimshire` save file → app reads their in-game progress → UI shows personalised data (discovered critters, fish, recipes, etc.).

### What is working
- `server/helpers/parseSaveFile.js` — XOR decryptor + regex field extraction is live and confirmed working.
  Verified output from `ExampleSave.grimshire`:
  ```
  playerName: "Felix", farmName: "Farmy Mc. FarmFace", saveFileVersion: 4,
  exp: 23300, playerSpeciesId: 1373, difficulty: 3,
  totalPlayTimeSeconds: 72411, playerPronouns: 1
  ```
- `POST /api/save/parse` endpoint accepts a base64-encoded file, parses it, and upserts into the `characters` table.
- `LoadSaveFile.tsx` sends the file to the server and shows a success/error message.
- Supabase `characters` table schema updated (see `server/sql/characters_schema.sql`).

### ID mappings — status

The save file stores progress as arrays of integer IDs, e.g.:
- `fishDiscovered: [228, 483, 671, ...]`
- `crittersDiscovered: [...]`
- `unlockedCraftingRecipes: [1453, 1454, 427, ...]`
- `itemsDiscovered: [...]`

**RESOLVED for items/fish/recipes:** ID → name mappings have been extracted and live at `server/helpers/game_id_maps.json`. 701 item names mapped (fish are InventoryItems so they're included). The extraction script is `server/helpers/extractGameData.py` — a Python/UnityPy script that reads the game's Unity Addressables localization bundles from `Grimshire_Data/StreamingAssets/aa/StandaloneWindows64/`.

**Still needed — critter species names:** `crittersDiscovered` IDs map to `CritterData` ScriptableObjects whose `displayName` is NOT in the localization tables. The `CritterNames` table in the localization bundles contains tamed critter pet names (Apollo, Mochi, etc.), not species names. Options:
- A) Accept that we can't show critter species names for now and skip them in the UI.
- B) Manually build a small static JSON of critter ID → species name by loading the game and checking which critters are discoverable in-game.

### How the extraction works (for reference)
- The game uses Unity Addressables + Unity Localization. Item names are in `InventoryItems Shared Data` (key: `{id}_name`) and `InventoryItems_en` (numeric key → localized string). The Python script joins these two bundles to produce `{game_id: name}`.
- The decompiled C# is in `grimshire-decompiled/Assembly-CSharp/` — useful for understanding save file structure. Key files: `GameData.cs`, `SaveObject.cs`, `ResourceManager.cs`.
- **Do NOT use dnSpy advice from old notes** — that was superseded. The extraction is done via the Python script above.

### Remaining to-do (in order)
1. ~~Get ID → name mappings~~ — **DONE**, see `server/helpers/game_id_maps.json`
2. ~~Extend `parseSaveFile.js` to extract the array fields~~ — **DONE**. `extractArray()` added; `parseSaveFile()` now returns `fishDiscovered`, `crittersDiscovered`, `itemsDiscovered`, `unlockedCraftingRecipes`, `unlockedCookingRecipes` as `number[]`.
3. ~~Populate Supabase reference tables~~ — **DONE (static JSON approach)**. ID→name lookups use `game_id_maps.json` server-side; no separate Supabase reference table needed.
4. ~~Store per-character discovered/unlocked arrays in Supabase~~ — **Schema ready, pending SQL run**. Five `integer[]` columns added to `server/sql/characters_schema.sql` and the `POST /api/save/parse` payload updated to write them. **Action needed: run the ALTER TABLE block from `characters_schema.sql` in the Supabase SQL editor** to add the columns to the live table.
5. Wire up the UI to show personalised data per character (e.g., highlight undiscovered fish, show unlocked recipes)

## Authentication System Implementation

**Status**: AuthContext.tsx created; database schema ready (profiles, characters tables). Pending: client-side auth UI and routing still needs debugging.

**Next Steps:**

All of the below are items for us to test later on 

3. **Complete the functionality for dropdown selector for character switching in header** —  Once I have run the necessary SQL to populate some sample data onto an existing real profile in the profiles table in SupaBase, I will need you to complete the functionality in the app code here to get the 'name' value returned and displayed as a line item in the dropdown selector for each item in the characters array for a given profile or user who is logged in.

4. **Pull live data from forageables and quests tables in SupaBase when loading the foreageables and quests web app pages, respectively** — I will stub out the data with SQL editor directly into SupaBase, and then confirm that's completed so that I can have you update the code here to pull that data live into the pages.

5. **For us to test later: Fix logout functionality** — Executing a logout still seems not to work, I am just getting no response visually from the web app when I click the logout button. I need you to properly hook up the logout so that it redirects to the login page when someone logs out, and remove any cached data in their browser at the time they log out so that the app knows they are fully logged out. 
