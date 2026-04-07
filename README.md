# SeatWise — Event Seating Planner

A full-stack event seating arrangement tool. Built with Express + React + SQLite.

---

## Deploy to Render (step-by-step)

### Step 1 — Push to GitHub

```bash
# In the seating-planner folder:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on github.com (name it: seatwise or anything you like)
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### Step 2 — Create a new Web Service on Render

1. Go to **https://render.com** → sign in → click **New → Web Service**
2. Click **Connect a repository** → authorize GitHub → select your repo
3. Render will auto-detect the `render.yaml` — confirm the settings:
   - **Name:** seatwise (or anything)
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Click **Create Web Service**

### Step 3 — Add a Persistent Disk (for the database)

> This is important — without it, the SQLite database resets on every deploy.

1. In your Render service dashboard, go to **Disks** (left sidebar)
2. Click **Add Disk**:
   - **Name:** `seatwise-db`
   - **Mount Path:** `/data`
   - **Size:** 1 GB (more than enough)
3. Click **Save** — Render will redeploy automatically

Your app will be live at `https://seatwise-XXXX.onrender.com`

---

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5000

---

## Notes

- The SQLite database file is stored at `/data/seating.db` on Render (persistent disk) and `seating.db` locally.
- All data persists across deploys as long as the disk is attached.
- The free Render plan spins down after 15 minutes of inactivity — first load after idle takes ~30 seconds to wake up. Upgrade to Starter ($7/mo) to keep it always on.
