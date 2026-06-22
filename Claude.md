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

### How the extraction works (for reference)
- The game uses Unity Addressables + Unity Localization. Item names are in `InventoryItems Shared Data` (key: `{id}_name`) and `InventoryItems_en` (numeric key → localized string). The Python script joins these two bundles to produce `{game_id: name}`.
- The decompiled C# is in `grimshire-decompiled/Assembly-CSharp/` — useful for understanding save file structure. Key files: `GameData.cs`, `SaveObject.cs`, `ResourceManager.cs`.
- **Do NOT use dnSpy advice from old notes** — that was superseded. The extraction is done via the Python script above.

### Crop death timing (confirmed from decompiled source)

**The end date is the last safe day. Death starts the next morning.**

When the player sleeps, `EndOfDayScreen.cs:33` calls `TimeControl.ChangeDay(1)`, which increments the date and immediately fires `newDayEvent`. That event calls `CropManager.UpdateAllPlantsStatus` with the date already advanced to the new day. The check (`ShouldPlantBeDead`, `CropManager.cs:126`) works as follows:

1. If `IfInSeason(0)` returns true (inclusive end: `currentDayNum <= endDayNum`), the plant is safe.
2. Otherwise, `GetDaysBetweenDates(endDate, currentDate)` returns how many days have passed since the end date. If `< 7`, there is a **10% chance to die** each morning (`Random.Range(0, 10) == 0`). If `>= 7`, the plant is **guaranteed dead**.

Example timeline for a crop with end date Spring 28 (season 0, day# 28):

| Day | Days past end date | Result |
|---|---|---|
| Spring 28 | — | `IfInSeason` true → safe |
| Summer 1 | 1 | 10% chance to die |
| Summer 2–6 | 2–6 | 10% chance to die each morning |
| Summer 7+ | ≥7 | Guaranteed dead |

Once `isDead` is set it is never cleared. Key source files: `CropManager.cs` (lines 92–138), `AvailableDateRange.cs` (line 80), `TimeControl.cs` (lines 393–398, 435–445).

### Gone-to-seed harvest: when you get the crop vs. just seeds (confirmed from decompiled source)

**You always get seeds. You only get the crop produce too when `IsBumperCrop()` fires.**

`SpawnDrops` (`CropObject.cs:307`) always gives the gone-to-seed growth stage's `HarvestItemDrops` (seeds). Then two bumper bonuses are checked. Since the gone-to-seed stage has both `GoneToSeedStage = true` AND `Harvestable = true`, both apply when `IsBumperCrop()` returns true:
- `IsGoneToSeed() && IsBumperCrop()` → +1 extra seed (`CropObject.cs:330`)
- `IsHarvestable() && IsBumperCrop()` → +1 crop produce (`CropObject.cs:334`)

`IsBumperCrop()` re-seeds the same RNG each call so it returns the same value both times. When bumper fires: base seeds + extra seed + crop produce. When it doesn't: just base seeds.

**`IsBumperCrop()` formula** (`CropObject.cs:227`):
```
minChanceForMega = fertility / (DaysToMaturity + 1)   [+ 0.1 if skill 876 unlocked]
minChanceForMega = min(minChanceForMega, 0.8)          [hard cap]
bumper = Random.Range(minChanceForMega, 1.0) > 0.9
```
Probability = `0.1 / (1.0 − minChanceForMega)`:

| minChanceForMega | Bumper chance |
|---|---|
| 0.0 (no compost, no skill) | 10% |
| 0.5 | 20% |
| 0.75 | 40% |
| 0.8 (max) | 50% |

**Compost does help.** Fertility accumulates +1 per watered day on fertilized soil (`CropManager.cs:105`). `minChanceForMega = fertility / (DaysToMaturity + 1)`, so a fully composted grow (fertility ≈ DaysToMaturity) hits the 0.8 cap → 50% bumper chance. Forage plants are excluded (`isForage` always returns false from `IsBumperCrop`).

**Deterministic per crop instance.** The RNG is seeded with `objID + posX + posY` before every roll, so the outcome is fixed for a given crop on a given tile. Compost shifts the threshold — it can push a specific crop from non-bumper to bumper — but it's not re-randomized each harvest attempt.

Skill 888 also gives a separate 10% chance for +1 bonus seed on any harvestable crop (`CropObject.cs:326`), independent of bumper.

## Settings System — How It Works

All user preferences live in a single `preferences` JSONB column on `public.profiles` (no separate columns). The server reads/writes the whole blob at `GET /api/settings/:userId` and `PATCH /api/settings/:userId`. The client merges server data with `DEFAULT_PREFERENCES` on load so missing keys always fall back gracefully.

**Key files:**
- `server/index.js` — `DEFAULT_PREFERENCES` constant (~line 157); `GET` and `PATCH` `/api/settings/:userId` routes (~line 1038)
- `client/src/context/SettingsContext.tsx` — `UserPreferences` type, `DEFAULT_PREFERENCES`, `SettingsProvider`, all updater hooks
- `client/src/pages/Settings.tsx` — Settings UI (spoiler toggles, appearance, timezone, default landing tab)
- `server/sql/profiles_preferences_schema.sql` — documents the column and all JSONB keys

**Adding a new preference:** add the key + default to `DEFAULT_PREFERENCES` in both `server/index.js` and `client/src/context/SettingsContext.tsx`, handle it in the PATCH route, add an updater in `SettingsContext`, and expose it in the `Settings` page. No schema change needed.

### Default Landing Tab

Stored in `preferences.default_tab` (string, e.g. `'stats'`) and `preferences.default_subtab` (string | null, only meaningful for Tips and Ref). Default is `'stats'` / `null`.

**Valid `default_tab` values** (match the `navItems` labels in `Header.tsx`):
`stats` → `/dashboard`, `tips` → `/tips`, `ref` → `/ref`, `faq` → `/faq`, `dashboard-overview` → `/dashboard-overview`, `settings` → `/settings`

**Subtabs by page:**
- `tips`: `quests`, `research`, `upgrades`, `critters`, `events`, `farm`
- `ref`: `critters`, `forageables`, `quests`, `events`

**How routing works:** After login, `Login.tsx` navigates to `/` (not `/dashboard`). `HomeRedirect` in `App.tsx` reads the loaded preferences, seeds `sessionStorage` with the subtab key if needed (`tips-active-tab` / `ref-active-tab`), then issues a `<Navigate>` to the resolved path. A spinner is shown while settings are loading. Guest login bypasses this and goes straight to `/dashboard`. The `EnrollmentQuestionnaire` does **not** include this setting — it lives only on the Settings page.

## Authentication System Implementation

**Status**: AuthContext.tsx created; database schema ready (profiles, characters tables). Pending: client-side auth UI and routing still needs debugging.

**Next Steps:**

1. **Fix the colors on the Tips page** - We need to fix the colors to be less obtrusive/clashy for favorites and dislikes on the pale yellow Birthday cards. Also, we need to account for any other types of events that might not be festivals or birthdays, if there are any other types of Calendar events from in the game that we are omitting, and set a color standard for those. 

2. **For us to test later: Fix logout functionality** — Executing a logout still has different issues, I can describe them when we get to this. For example, the login page has "visit as guest" button or whatever it's called encroaching visually on the regular login space, something with the css is off there. Then when I do log in as guest, we need to handle a lot of weird bugs/blank space that should have stubbed data with a warning that this is just a sample of what you'd get, with a notice to hit Login button in the top right to see your own data.

4. **Human to do: fix this mess, confirm if these fertility values are something we could figure out based on interacting with game directly or if this is unintentionally exposing secrets from randomized int rolls unique to each character file** - Changes made by Claude:

parseSaveFile.js — now extracts the fertility float from each crop entry in the save file
server/index.js — passes fertility through to crops_data in the character response
AuthContext.tsx — added fertility: number to CropEntry type; guest stub data defaults to 0
Tips.tsx — SeedHarvestCalc now:
Averages fertility across all tiles of the same crop type when building the dropdown options
Shows (avg X compost days across N tiles) in the option label for multi-tile crops, or (X compost days) for single tiles with fertility > 0
Auto-fills both maturity and fertilized days when you pick a crop
Footnote bumped from text-xs to text-sm
Yes, you need to re-upload your save file — the old DB rows for crops_data were stored without fertility, so the values will be 0 until you re-parse. Once you upload, selecting a crop from the dropdown will auto-fill both fields from live game data.

8. **Human To Do: Email SMTP Server Setup** - Supabase is doing some severe rate-limiting on outgoing emails for password resets or enrollment (two or three emails total per day allotted total for the app across all users) - we will need to set up a server to handle the email volume when this is live/hosted for the general public. Research has indicated there are only two or three good options for which service to use for SMTP, so the human dev will have to do setup and then coordinate with Claude to ensure that all necessary code (if any) is written into the app to appropriately ensure expected functionality is maintained as it currently works great directly through SupaBase email functions.

9. **Test new user enrollment** - we need to test that the SMTP server is allowing new enrollments, and test the new enrollment page/modal that Claude previously created to ensure that it is capturing each setting correctly and mainatining it across logout/navigating away and back to the app, etc.

10. **UI polish pass — responsive layout, spacing, and mobile views** — There are myriad issues across the app with resizing, spacing, and mobile/small-screen layouts. When touching any component, also fix nearby responsive issues. General standards to apply:
    - All pages should be usable on mobile (≥320px wide) and not overflow horizontally.
    - Cards, grids, and columns should reflow gracefully at small viewports (prefer CSS Grid with `auto-fill`/`minmax` or Flexbox wrapping rather than fixed column counts).
    - Touch targets (buttons, links, interactive elements) should be at least 44×44px on mobile.
    - Padding and margin should scale down on small screens — avoid hardcoded large values that look fine on desktop but crowd mobile.
    - The Header/Nav should collapse or adapt cleanly on narrow screens (hamburger menu or similar) rather than overflowing or overlapping content.
    - Modal/dialog overlays must be fully visible and scrollable on small screens.
    - Test at 375px (iPhone SE), 768px (tablet), and 1280px (desktop) breakpoints as a baseline.

11. **Debug: Fish Audit section (Tips.tsx)** — Hiding it: removed `debugColumn` from the one `<DailyChecklist>` call site. `FishAuditColumn`, `DailyChecklist`'s `debugColumn` prop, `FISH_AUDIT_LIST`, `FISH_AUDIT_KEY`, and all audit logic are still in the file untouched. To bring it back, restore `debugColumn={<FishAuditColumn fishScheduleMap={fishScheduleMap} />}` on that call.

12. **Issues / Feedback button + Linear integration** — Add a clearly visible "Issues" button to the header. The button will need to live alongside Logout/Load Files on desktop and appear in the hamburger menu on mobile — placement TBD when we get to it. Clicking it routes to a public `/feedback` page that requires no login. That page hosts a form with fields for: type (Bug / Feature Request / Missing Info Noticed / Providing Missing Info / Incorrect Info Present / Other), title, description, and optionally contact email. On submit the form POSTs to a server endpoint that creates a ticket in Linear via the Linear API. Linear workspace does not exist yet — human dev needs to create it and obtain an API key and Team ID before Claude can wire up the integration. Once those credentials are available, store them as server-side env vars (`LINEAR_API_KEY`, `LINEAR_TEAM_ID`) and implement `POST /api/feedback` on the server to call the Linear GraphQL mutation `issueCreate`.

