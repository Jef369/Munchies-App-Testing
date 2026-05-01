# Deploy Munchies to the cloud (no Terminal needed)

This walks you through deploying Munchies to **Render.com**'s free tier so you get a real URL like `https://munchies-xxxx.onrender.com` that works on any phone or computer.

Total time: ~15 minutes. You only do this once. After that, the URL is permanent.

You will need:

1. An email address
2. A web browser

That's it. No Terminal, no installs.

---

## Step 1 — Create a free GitHub account (3 min)

GitHub is where your code lives so Render can find it.

1. Go to **https://github.com/signup**
2. Enter your email, create a password, pick a username (anything works — try `munchies-yourname`)
3. Verify your email (check inbox for the code)

You're done. Skip any "personalize your experience" setup screens.

---

## Step 2 — Create a new repo and upload the code (5 min)

1. After signing in, click the **+** icon in the top-right of GitHub → **New repository**
2. Name it: **munchies**
3. Choose **Public** (Render's free tier needs public repos)
4. **Don't** check any of the "Add a README/license/.gitignore" boxes
5. Click **Create repository**
6. On the next page you'll see "Quick setup" — look for the link **"uploading an existing file"** in the middle of the page. Click it.
7. **Open your `munchies` folder on your computer** (the one you unzipped)
8. **Select all the files inside it** (Cmd+A on Mac, Ctrl+A on Windows) and **drag them into the GitHub upload box**
   - Important: drag the **contents** of the folder, not the folder itself. You should see files like `server.js`, `package.json`, `README.md`, and the `public` folder.
9. Scroll down, leave the commit message as-is, click **Commit changes**

Wait ~10 seconds. Refresh the page. You should see all your files listed.

---

## Step 3 — Sign up for Render (2 min)

1. Go to **https://render.com**
2. Click **Get Started** in the top-right
3. Click **Sign up with GitHub** (this saves time vs. email signup)
4. Authorize Render to access your GitHub account when prompted

---

## Step 4 — Deploy your app (3 min)

1. On Render's dashboard, click **+ New** in the top-right → **Blueprint**
2. Click **Connect** next to your `munchies` repository
3. Render auto-reads the `render.yaml` file and shows you what it'll create. You'll see one service called "munchies".
4. Click **Apply** at the bottom
5. Wait ~2-3 minutes while Render builds and starts your app. You'll see logs scrolling — that's normal.
6. When you see the green **Live** indicator at the top, your app is up.

---

## Step 5 — Open your live app

At the top of the page, you'll see your URL — something like:

**`https://munchies-abc123.onrender.com`**

Click it. Add `/customer/` to the end:

`https://munchies-abc123.onrender.com/customer/`

That's your live customer app. You can:

- Open it on your phone — it works as a real installable app (Add to Home Screen in Safari)
- Open `/admin/` for the admin dashboard
- Open `/driver/` for the driver app
- Share the URL with anyone

Demo logins:
- Customer: `shop@munchies.test` / `shop123`
- Admin: `admin@munchies.test` / `admin123`
- Driver: `driver@munchies.test` / `driver123`

---

## Important free-tier notes

- **The app sleeps after 15 minutes of no traffic.** Next visit takes ~30 seconds to wake up. After that it's fast. To prevent sleep, upgrade to Render's $7/month plan or use a free uptime pinger like cron-job.org to hit the URL every 10 min.
- **Database resets when the server restarts** (Render's free tier doesn't include persistent disk). Fine for testing and demos. To make it permanent, upgrade to Render's $1/month disk add-on, or switch from SQLite to a free Postgres (Supabase free tier has plenty).

---

## When you want to update something

Edit a file in your GitHub repo (you can edit straight in the browser). Render auto-redeploys within ~2 minutes.

---

## Connecting your real domain

When you're ready to use a real domain like `munchiesdelivery.com`:
1. Buy it on Namecheap or Cloudflare (~$10/year)
2. In Render, go to your service → Settings → Custom Domains → Add
3. Render gives you a CNAME record to add to your domain's DNS settings
4. Done in ~30 minutes — Render handles HTTPS automatically

---

## When something breaks

- **Build fails:** Check the logs in Render. Most common issue is a missing file in the GitHub upload — re-upload everything.
- **App shows "Application failed to respond":** Click "Logs" in Render to see the error. Paste it back to me and I'll fix it.
- **Want to start over:** In Render, click your service → Settings → Delete Service. Then redo Step 4.
