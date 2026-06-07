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

1. **Show Users the grimshire filenames they have uploaded** can we have an on-hover effect next to each character name in the selector dropdown, so that when they hover on an icon for info next to the character name (to the left of it ideally), they see the actual filename from the DB, like "GS1405_76561198238464092" so they can confirm which files they have already uploaded?

2. **Get the quest data out of the grimshire game data files** - we need to know the names and details of quests for all days in the in-game calendar, and store them somewhere locally in the codebase to reference, or maybe in SupaBase if it makes more sense. so far our architecture is to save the reference ID data for all critters/fish/recipes, etc in a local JSON, so I don't see why we would move away from that now.

3. **Create a User-Level Settings Tab** - we want the users to have their own settings controls that they can get to from the nav, and a section in there to be able to choose whether they see spoilers or not. We will need a toggle for each "type" of spoilers, which hooks up to our render functions for the dashboard and other tabs. we will need toggles for "see undiscovered fish" "see undiscovered cooking recipes" "see undiscovered quests" "see undiscovered items" "see undiscovered forageables" "see undiscovered crafting recipes", etc, in some order that makes sense, maybe grouped by where they show up in the app (e.g. anything that affects Dashboard data goes together, anything that affects quest data goes together)

4. **Build a page listed in Nav for Quests** - we want the quests page to contain all upcoming quests for the next two weeks in game (we will need to check the previously-created and defaulted to "on" settings for users to determine whether they want spoiler protection on or not for quests, and then we will need to set the data to render with appropriate vagueness depending on their settings, e.g. "this area is not visible due to your spoiler settings, please click here to change them if you'd like to see this content"). we still want them to be able to see stats about their previously completed quests in this section, even if their spoiler protection is set to "on" for upcoming/undiscovered quests on this character.

5. **For us to test later: Fix logout functionality** — Executing a logout still seems not to work, I am just getting no response visually from the web app when I click the logout button. I need you to properly hook up the logout so that it redirects to the login page when someone logs out, and remove any cached data in their browser at the time they log out so that the app knows they are fully logged out. 
