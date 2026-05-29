## Authentication System Implementation

**Status**: AuthContext.tsx created; database schema ready (profiles, characters tables). Pending: client-side auth UI and routing.

**Next Steps:**

1. **Create `client/src/lib/supabase.ts`** — Initialize Supabase client with env variables. CRITICAL: AuthContext imports from here and will break without it.

2. **Create `client/src/pages/Login.tsx` and `client/src/pages/SignUp.tsx`** — Email/password forms. SignUp also needs username input in case the user does not wish to provide an email address.

3. **Create `client/src/components/ProtectedRoute.tsx` and `client/src/components/CharacterSelector.tsx`** — Route guard for auth, dropdown selector for character switching in header.

4. **Wire AuthProvider into App.tsx; update routing** — Wrap `<Routes>` in `<AuthProvider>`, add `/login` and `/signup` routes, protect Dashboard/Quests/Forageables/Critters/Events with `<ProtectedRoute>`.

5. **Update `client/src/components/Header.tsx`** — Add CharacterSelector dropdown + logout button in top-right; hide nav items if not authenticated. 

**Blocker**: supabase.ts must exist before AuthContext can initialize; all other steps depend on it.

6. **Create `client/src/components/DatePicker.tsx`** - Add a file to components to hold the datepicker that will be placed just to the left of the character selection dropdown in the header, that will have a Season dropdown (Spring|Summer|Fall|Winter with one icon to the left of each selectable item) and a text entry field that can only take number values between 1 and 28, inclusive. All over the app we will need to read this data from the header, and show the output from daysLeftInRange.ts helper file in various description fields.