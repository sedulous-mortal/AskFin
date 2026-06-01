## Authentication System Implementation

**Status**: AuthContext.tsx created; database schema ready (profiles, characters tables). Pending: client-side auth UI and routing still needs debugging.

**Next Steps:**

1. can you modify the expectations on the code side here so that "name" is actually a composite of subtype + critter_type (in that order) from the db? or better yet, can we pull the critter_type (e.g. Bluggy) and subtype separately as a part of the db call, and then concat them in the front end to have the critters page show their "names" as expected with the unique subtype listed on each of the four vertical subsections of the critter_Type section? 

the image is called sprite in the critters table. the critters table will only be returning 'bluggy_frostberry.png', for example, so on our side we will need to always prepend '/critters/' to the image path, or it won't render, since the images will be stored locally on the client side in the public/critters folder (as the samples are now).

Also, can you update "foods" to be pulled from critter_foods and do some sort of join on our side to embed the data as expected? I haven't finished populating the table, but as a sample I currently have critter_id and forageable_id and both are foreign key references and that's all the table contains.

I confirmed all of the below:
critters table: critter_type (e.g. Bluggy) + subtype (e.g. Frostberry) as separate columns; sprite (bare filename like bluggy_frostberry.png); plus habitat, active_at, description.
Display name = subtype + " " + critter_type ("Frostberry Bluggy"), composed on the client.
Each critter_type is one section; its subtype rows become the four vertical subsections (replacing the old fake buildVariants stubs — these are now real rows grouped by critter_type).
sprite → prepend /critters/ to get the renderable path.
foods → join critter_foods (critter_id, forageable_id) → forageables, embedded server-side via PostgREST. forageables name column is just called name.

All of the below are items for us to test later on (2. through 5.):

2. **For us to test later on: Fix password reset functionality** - something is wrong with the execution of the password reset; SupaBase does send a link to the email provided, and the link points to http://localhost:5173/#access_token=eyJhbGciOiJFUzI1NiIsImtpZCI6ImVjOTk4NDhiLTdhNDAtNGRkZS1hYTdmLTdkYTBlMTExMmM0YyIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3RzZnZhaWVwbm1ubGlqYW1rZXVhLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIwYzBmNjNhNy1kNWVmLTQ2MjYtOGUzYi02N2E5NWNhMDU0YzciLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzgwMTcxODczLCJpYXQiOjE3ODAxNjgyNzMsImVtYWlsIjoiYWxleC5iZWUub2JpZUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoiYWxleC5iZWUub2JpZUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiIwYzBmNjNhNy1kNWVmLTQ2MjYtOGUzYi02N2E5NWNhMDU0YzcifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJvdHAiLCJ0aW1lc3RhbXAiOjE3ODAxNjgyNzN9XSwic2Vzc2lvbl9pZCI6Ijg1NTQ3YTc5LWFhMmYtNDA0ZC1hMGI3LTk2Mjg5M2RjNjBiZSIsImlzX2Fub255bW91cyI6ZmFsc2V9.Ju5EXZCyfQjmZYg5RA86Kahb7yR0-PAtXubs3GN_evEi9DRoHW-IX-JkD7KidXtzgoz1hiSKnbojcMlvBsivIg&expires_at=1780171873&expires_in=3600&refresh_token=onjp3xhfxkl4&sb=&token_type=bearer&type=recovery, but when I try to actually execute the click on that link, it takes me to a version of the app that just has a permanent loading circle. I need you to build out an actual password reset component and have it point to that instead. Let me know if you need me to change anything in SupaBase settings to help fix this.

3. **Complete the functionality for dropdown selector for character switching in header** —  Once I have run the necessary SQL to populate some sample data onto an existing real profile in the profiles table in SupaBase, I will need you to complete the functionality in the app code here to get the 'name' value returned and displayed as a line item in the dropdown selector for each item in the characters array for a given profile or user who is logged in.

4. **Pull live data from forageables and quests tables in SupaBase when loading the foreageables and quests web app pages, respectively** — I will stub out the data with SQL editor directly into SupaBase, and then confirm that's completed so that I can have you update the code here to pull that data live into the pages.

5. **For us to test later: Fix logout functionality** — Executing a logout still seems not to work, I am just getting no response visually from the web app when I click the logout button. I need you to properly hook up the logout so that it redirects to the login page when someone logs out, and remove any cached data in their browser at the time they log out so that the app knows they are fully logged out. 
