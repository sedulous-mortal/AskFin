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

### Blocking gap — integer ID mappings
The save file stores progress as arrays of integer IDs, e.g.:
- `fishDiscovered: [228, 483, 671, ...]`
- `crittersDiscovered: [...]`
- `unlockedCraftingRecipes: [1453, 1454, 427, ...]`
- `itemsDiscovered: [...]`

Without a lookup table (ID → name), these are useless in the UI.
**The ID mappings live in the Grimshire game assembly.** Use dnSpy to decompile `Grimshire_Data/Managed/Assembly-CSharp.dll` and find the classes that map these IDs to game objects — likely named something like `SaveManager`, `SaveData`, `ItemDatabase`, `FishDatabase`, `CritterDatabase`, or `GameData`.
Export those classes (File → Export to Project in dnSpy) or paste them into Claude's chat.

### dnSpy note
Claude cannot open or control dnSpy (it is a GUI tool). To collaborate:
- Option A: Export decompiled project to disk → Claude can read the .cs files.
- Option B: Copy-paste the relevant C# class bodies into the chat.

### Remaining to-do (in order)
1. Get ID → name mappings from dnSpy (see above) — **BLOCKER**
2. Extend `parseSaveFile.js` to extract the array fields (fishDiscovered, crittersDiscovered, etc.)
3. Populate Supabase reference tables (or static JSON) with the ID mappings
4. Store per-character discovered/unlocked data in Supabase
5. Wire up the UI to show personalised data per character (e.g., highlight undiscovered critters)

## Authentication System Implementation

**Status**: AuthContext.tsx created; database schema ready (profiles, characters tables). Pending: client-side auth UI and routing still needs debugging.

**Next Steps:**

All of the below are items for us to test later on 

3. **Complete the functionality for dropdown selector for character switching in header** —  Once I have run the necessary SQL to populate some sample data onto an existing real profile in the profiles table in SupaBase, I will need you to complete the functionality in the app code here to get the 'name' value returned and displayed as a line item in the dropdown selector for each item in the characters array for a given profile or user who is logged in.

4. **Pull live data from forageables and quests tables in SupaBase when loading the foreageables and quests web app pages, respectively** — I will stub out the data with SQL editor directly into SupaBase, and then confirm that's completed so that I can have you update the code here to pull that data live into the pages.

5. **For us to test later: Fix logout functionality** — Executing a logout still seems not to work, I am just getting no response visually from the web app when I click the logout button. I need you to properly hook up the logout so that it redirects to the login page when someone logs out, and remove any cached data in their browser at the time they log out so that the app knows they are fully logged out. 
