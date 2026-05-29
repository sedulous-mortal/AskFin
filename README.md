# 🌱 AskFin

Welcome to **AskFin** — your cozy companion app for exploring, organizing, and interacting with your Grimshire game world data.

AskFin is designed to help players upload their save/game files, browse critters, forageables, world data, and eventually uncover deeper insights about their adventures. ✨

---

## 🐾 Goals of the Project

AskFin aims to:

* Provide a friendly interface for viewing game data
* Help players organize and understand collected creatures/items
* Allow save-file importing and profile-based data loading
* Create a playful and visually cozy experience
* Support future expansion for analytics, maps, guides, and discoveries

---

# 🧸 Tech Stack

* Frontend: React / Vite / TypeScript
* Backend: Node.js / Express
* Database: PostgreSQL/SupaBase
* Auth: Username/Password at this time, chose to skip Google OAuth for now

---

# 🚀 Getting Started

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd AskFin
```

---

# 🌼 Running the Frontend

Open a terminal and run:

```bash
cd client
npm install
npm run dev
```

This will start the frontend development server.

---

# 🔧 Running the Backend

Open a second terminal and run:

```bash
cd server
npm install
npm run start
```

This will start the backend server.

---

# 💾 Uploading Your Game File
> Coming soon!

To load your game data into AskFin:

1. Launch the frontend app
2. Create or log into your profile
3. Navigate to the **Profile** section and then the **Upload Save** button
4. Upload your game file (should be hosted in `C:\Program Files (x86)\Steam\steamapps\common\Grimshire\Grimshire_Data`)
5. Wait for AskFin to process and import your data ✨

Once uploaded, your critters, items, and other game information should appear throughout the app.

---

# 📁 Project Structure

```text
AskFin/
├── client/     # Frontend application
├── server/     # Backend API/server
└── README.md
```

---

# 🌟 Planned Features

* User profiles (hosted in SupaBase)
* "Days remaining" calculations for finding fish/seasonal forage for Adeline's research
* Critter encyclopedia and checklisting capability to track which you have on your farm
* Forageable tracking and tips (maps of where to expect to find all cherry trees, for example)
* Seasonal activity timelines (what to stock for upcoming villager birthdays, etc, and when to stock them so they don't go bad before turn-in)
* Save-file parsing (this will be a heavy lift but is kind of the point of the web app)
* Search + filtering (this will be for the "Ask Fin" capability to quickly get correct answers since Googling leads to false AI results)
* Analytics/dashboard views of stats across your characters (this is blocked until gamefile upload is functional)

---

# 🛠 Development Notes

> Coming eventually: Contributor guidelines, environment variables, database setup, API docs, etc.

---

# 💖 Contributing

Contributions, ideas, and bug reports are welcome!

> Add contribution workflow here later.

---

# 📜 License

Note: This content is not to be republished/repurposed for any kind of monetization, it is solely a fan-created web app for educational purposes. I do not have rights to any of this Grimshire content, nor will I be monetizing in any way the deployment of this content to a public-facing hosted URL. Please ensure you also do not monetize this content, as the Acute Owl dev team behind Grimshire works very hard to keep their game great, and they would not appreciate having to waste time on legal stuff.

---

Made with love, marsh water, and tiny critters 🌿
