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

## Authentication System Implementation

**Status**: AuthContext.tsx created; database schema ready (profiles, characters tables). Pending: client-side auth UI and routing still needs debugging.

**Next Steps:**

All of the below are items for us to test later on 

1. **Quest page: "Available now" vs "Active now" badge, and item name resolution**

   **Quest status badges:** The quests page currently shows a green "Active now" badge for any quest whose availability window overlaps the current in-game date. But in Grimshire, a quest doesn't become active until the player speaks to the NPC to accept it — the window just means the NPC *will* offer it during that period. We should:
   - Change "Active now" to **"Available now"** (pale orange / amber badge) as the default for quests whose window is open, since we can't confirm the player has accepted them.
   - Reserve a green "Active" or "In progress" badge for confirmed in-progress quests — but this requires knowing which quests the character has already accepted, which the `.grimshire` save file may store. Check `grimshire-decompiled/Assembly-CSharp/SaveObject.cs` for a field like `activeQuests`, `acceptedQuests`, `questsInProgress`, or similar array of quest IDs. If such a field exists, add it to `parseSaveFile.js` extraction and use it to drive the badge color.
   - **Open question for game devs:** Do the displayed date ranges (e.g. Spring 1–Spring 28) represent (a) the window the NPC will *offer* the quest, (b) the deadline to *turn it in* after accepting, or (c) both? If (a) and (b) are different windows, we need two date ranges per quest in `quests.json`. For example: can a player accept the quest on Spring 27 and still turn it in by Spring 28, or must they accept it before some earlier cutoff?

   **Pending: quest item name resolution:** `server/helpers/quests.json` contains requirements and reward_items as `"Unknown item (path_id=XXXX)"` because item name lookup is not yet working. The data pipeline (`parseAssetStudioDumps.py`) correctly extracts the path IDs from UABE dumps, and `diagRawBytes.py` confirmed that raw byte parsing at offset 28 (m_Name) and the Id field immediately after gives the correct game ID (e.g. path_id=25174 → game_id=34 → "Carrot", path_id=25188 → game_id=294 → "Hawthorn Berry"). The blocker is that the current UnityPy version's `EndianBinaryReader_Streamable` reader object does not expose a `byte_size` attribute — need to find the correct attribute name (try `dir(obj.reader)` or `dir(obj)` on an item MonoBehaviour to find size/length) and update the path-ID map building section of the parse script accordingly.

2. **Create a User-Level Settings Tab** - we want the users to have their own settings controls that they can get to from the nav, and a section in there to be able to choose whether they see spoilers or not. We will need a toggle for each "type" of spoilers, which hooks up to our render functions for the dashboard and other tabs. we will need toggles for "see undiscovered fish" "see undiscovered cooking recipes" "see undiscovered quests" "see undiscovered items" "see undiscovered forageables" "see undiscovered crafting recipes", etc, in some order that makes sense, maybe grouped by where they show up in the app (e.g. anything that affects Dashboard data goes together, anything that affects quest data goes together). we will also need at the very top of this user settings tab to have a setting with a timezone dropdown for UTC options (e.g. +0500 eastern/US time, etc). We should utilize whatever the setting is here (default to Eastern US time) in order to properly render into the info box on the characters dropdown in header, we want the on-hover effect to tell them the last load time based on their own timezone, not whatever the database provides raw.

3. **Build a page listed in Nav for Quests** - we want the quests page to contain all upcoming quests for the next two weeks in game (we will need to check the previously-created and defaulted to "on" settings for users to determine whether they want spoiler protection on or not for quests, and then we will need to set the data to render with appropriate vagueness depending on their settings, e.g. "this area is not visible due to your spoiler settings, please click here to change them if you'd like to see this content"). we still want them to be able to see stats about their previously completed quests in this section, even if their spoiler protection is set to "on" for upcoming/undiscovered quests on this character.

4. **For us to test later: Fix logout functionality** — Executing a logout still has different issues, I can describe them when we get to this. For example, the login page has "visit as guest" button or whatever it's called encroaching visually on the regular login space, something with the css is off there. Then when I do log in as guest, we need to handle a lot of weird bugs/blank space that should have stubbed data with a warning that this is just a sample of what you'd get, with a notice to hit Login button in the top right to see your own data.
