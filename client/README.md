To see it in the browser: `npm run dev`

(make sure you are in the client folder where this README file is hosted, if not, then run `cd client` first)

dev server is set up to run by default on http://localhost:5173 


Next steps, if you want to do them here:
Run in server folder:
`npm install`
`npm run dev 2>&1`

This should start the Express server with Supabase.

the terminal should spit out 
`Server listening on http://localhost:4000`
`SQLite database: C:\Users\ansob\claude-tests\server\quests.db`

SQL access
The database is hosted at supabase.com, which has a full GUI and embedded SQL editor.

The frontend will reflect any DB changes on the next reload.