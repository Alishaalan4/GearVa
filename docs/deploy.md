# First deployment: step by step

What you do by hand to put Gearva online at **gearva.online**. The code side is ready (`render.yaml`, README 9). Do the parts in order. Each part says what you should see; if you see something else, stop and send Claude the screen text or the service's logs.

**Plan:** about 2 hours, most of it waiting for builds and DNS.

| Address | What it is |
|---|---|
| `https://gearva.online` (and `www`) | The website and the garage app |
| `https://admin.gearva.online` | The admin app |
| `https://api.gearva.online` | The API (the two apps talk to it; you never open it) |

**You will collect these values on the way.** Keep them in a note until Part C:

| Value | From |
|---|---|
| Resend API key (`re_...`) | Part B2 |
| R2 endpoint, Access Key ID, Secret Access Key | Part B3 |
| An admin password you choose (12+ characters) | You |

---

## Part A: Push the code

In Git Bash, in the Gearva folder:

```bash
git push
```

(The commit commands come from Claude's message.) Then open GitHub, Actions: the CI run should turn green.

---

## Part B: Three accounts

### B1. Render
1. Go to **render.com** and sign up **with GitHub**.
2. When it asks, allow access to the **GearVa** repository.
3. **Billing:** add a card. The Hobby plan includes 2 custom domains and we use 4 (`gearva.online`, `www`, `admin`, `api`), so expect about **$0.50 a month**. Everything else is free.

### B2. Resend (sends the emails)
1. Go to **resend.com** and sign up.
2. **Domains, Add domain:** `gearva.online`, region **Ireland (eu-west-1)**.
3. Resend shows 3 or 4 DNS records (MX, TXT for SPF, TXT for DKIM, maybe DMARC). **Leave this page open.** You add them in Part E.
4. **API Keys, Create API key:**
   - name `gearva-render`;
   - permission **Sending access**;
   - domain `gearva.online`.

   Copy the key (`re_...`). It is shown only once.

### B3. Cloudflare R2 (keeps logos and invoice PDFs)
1. Go to **dash.cloudflare.com** and sign up.
2. Left menu, **R2 Object Storage**. Cloudflare asks for a card to turn R2 on; up to 10 GB is free.
3. **Create bucket:**
   - name **`gearva-files`** (exactly this);
   - location **Automatic**;
   - keep it **private** (no public access).
4. Back on the R2 overview, **Manage API tokens** (or "API" then "Manage API tokens"), then **Create API token**:
   - permissions **Object Read & Write**;
   - apply to **specific bucket: `gearva-files`** only;
   - **Create**.
5. Copy three values, each shown only once:
   - **Access Key ID**
   - **Secret Access Key**
   - **S3 endpoint**: like `https://<long id>.r2.cloudflarestorage.com`. Copy it **without** `/gearva-files` at the end.

---

## Part C: Create everything on Render (Blueprint)

1. Render dashboard: **New**, then **Blueprint**.
2. Pick the **GearVa** repository, branch **main**. Blueprint name: `gearva`.
   - **Check the page title** says *"You are deploying from a Blueprint for …/GearVa"*. If the account can see other repositories, it is easy to pick the wrong one (its file may create paid services).
   - Before **Apply**, check that every item in *Specified configurations* is on the **Free** plan.
3. Render reads `render.yaml` and lists:
   - 3 web services: `gearva-api`, `gearva-garage-web` and `gearva-admin`;
   - `gearva-redis`;
   - the database `gearva-db`;
   - the environment group `gearva-shared`.
4. It asks for the values that are not in the file:

| Asks for | Put |
|---|---|
| `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `PLATFORM_DATABASE_URL` | **Leave empty** (Part D) |
| `RESEND_API_KEY` | the `re_...` key |
| `S3_ENDPOINT` | the R2 endpoint |
| `S3_ACCESS_KEY` | the R2 Access Key ID |
| `S3_SECRET_KEY` | the R2 Secret Access Key |
| `SEED_ADMIN_PASSWORD` | your admin password (12+ characters; keep it in a password manager) |

5. Click **Apply**.

**Render does not create a variable you leave empty.** The three database variables are then missing in `gearva-api`; Part D adds them with **+ Add**.

**What you should see:** the database and Redis become *Available*, and the two web apps build and go *Live*. **`gearva-api` fails**, because it has no database settings yet. That is expected; Part D fixes it.

If Render refuses the Blueprint because of the custom domains, check the card from B1, then apply again.

Because `gearva-api` fails, Render **cancels the three "Add domain" items** ("canceled: another action failed"). After Part D, open **Blueprints, gearva**, click **Manual sync**, then **Approve**: the domains are added.

---

## Part D: Set up the database (from your computer)

1. On Render, open **gearva-db** and wait until it says **Available**.
2. **Connect** (or *Info, Connections*): copy the **External Database URL**. It looks like `postgresql://gearva_admin:...@dpg-....frankfurt-postgres.render.com/gearva`.
3. In Git Bash, in the Gearva folder (put the URL inside the quotes):

   ```bash
   npm run bootstrap:render -w @gearva/database -- "PASTE_THE_EXTERNAL_URL_HERE"
   ```

   **You should see:** "Connected ...", "Created role ..." three times, and then three lines starting with `DATABASE_URL=`, `MIGRATION_DATABASE_URL=` and `PLATFORM_DATABASE_URL=`.
   - "without BYPASSRLS" in the output is fine.
   - If it says **"This user may not create roles"**, stop and send Claude the output.
4. On Render, open **gearva-api**, then **Environment**, then **Edit**. Add the three with **+ Add** (key as printed, value = the part **after** the `=`). Then **Save, rebuild, and deploy**. The first start takes about 3 to 4 minutes after "Build successful".
5. Open **gearva-api, Logs** and wait for:
   - `All migrations have been successfully applied.`
   - `Created super-admin admin@gearva.online.`
   - `Created 11 global service types.`
   - `Nest application successfully started`

   The service turns **Live**.

The three passwords exist only in Render now. If you ever need new ones, run the same command again and paste the new lines.

---

## Part E: DNS (where you bought gearva.online)

**Before anything else, check that the domain is not suspended.** A new domain must have its owner's email confirmed within 15 days, or the registrar suspends it: its nameservers become `verify-contact-details.namecheap.com` / `failed-whois-verification.namecheap.com`, and nothing below works. The **registrant** (the owner in the domain's contacts) clicks the link in the registrar's "verify your contact information" email, or uses *Resend verification email* in the registrar's domain list. Also check the domain's **Nameservers** setting is the registrar's own DNS (Namecheap: *Namecheap BasicDNS*), so the records below are used.

1. On Render, open each web service and note its address at the top, like `gearva-api.onrender.com`. If Render added a suffix (`gearva-api-ab12.onrender.com`), use the address it shows.
2. In your domain registrar's **DNS settings**:
   - **Delete** any existing `A`, `AAAA` or `CNAME` records for `@` (the bare domain) and `www`. These are usually the registrar's parking page.
   - **Add:**

| Type | Name / Host | Value / Points to |
|---|---|---|
| `A` | `@` | `216.24.57.1` |
| `CNAME` | `www` | `gearva-garage-web.onrender.com` |
| `CNAME` | `admin` | `gearva-admin.onrender.com` |
| `CNAME` | `api` | `gearva-api.onrender.com` |
| *(the Resend records)* | *exactly as the Resend page shows them* | |

   If the registrar offers `ALIAS` or `ANAME` for `@`, you may point `@` to `gearva-garage-web.onrender.com` instead of the `A` record. Either works.
3. **Render:** each web service, **Settings, Custom Domains**, then the **↻** button on each domain row. It turns *Verified*, then the certificate *Issued*. A **Certificate Error** right after the DNS changed is usually only timing: click **↻** again a few minutes later. Until `api.gearva.online` has its certificate, the two apps answer **500** on everything that needs the API (login included).
4. **Resend:** open the domain page and click **Verify**. It shows *Checking DNS*, then *Verified* (about 5 to 30 minutes). An email sent before that fails for good (`Resend 403: The gearva.online domain is not verified`, under Monitoring, failed messages); send it again afterwards (for an invite: the garage page, **Resend invite**).

---

## Part F: Check that it works

Free services sleep after 15 minutes without visitors. The API took **about 90 seconds** to wake when measured on 2026-11-15 (it also checks the migrations, the seed and loads Chrome at start). Meanwhile the apps get **502** and may stay on "Loading…": refresh after a minute or two. A paid plan for `gearva-api` removes this.

1. **Website:**
   - Open `https://gearva.online`: the website appears with a padlock (HTTPS).
   - Send the **Apply** form with your own details.
2. **Admin:**
   - Open `https://admin.gearva.online` and sign in with `admin@gearva.online` and your admin password.
   - Go to **Account** and turn on **two-factor authentication** (recommended).
3. **Email:**
   - In admin, open **Applications** and approve your application. Use an **email address you can read** as the garage email.
   - Within a minute the invite email arrives (check spam too).
   - Open its link, set a password, and sign in at `https://gearva.online`.
4. **Files and PDFs:**
   - In the garage app, upload a **logo** in Settings.
   - Add a customer and a car, record a service with an invoice, and **download the invoice PDF**. The PDF shows the logo.
5. **Your IP:** Claude will check this with you, so keep the External Database URL handy.

**Then message Claude:** "done", plus anything that did not work. For a failing service, copy the last 50 lines of its **Logs**.

---

## Handing over to the buyer (decided 2026-11-15: at the end of the project)

The running setup is in the developer's accounts and serves as the test environment. At the end of the project it moves to the buyer's accounts:
- **Namecheap:** already the buyer's. **Resend and Cloudflare:** the buyer is a member and pays with his card, so the keys keep working.
- **Render:** a Hobby workspace has only one member, so the buyer creates **his own Render account** and Part C to E run again there (about 45 minutes). First delete the old services, so the names (`gearva-api`, …) and the domains are free and the DNS records stay the same.
- **GitHub (decided 2026-11-21):** Render can only read a repository its owner allowed, so the buyer has **his own copy**: an empty private repository `GearVa` on his GitHub, with the developer as a collaborator. The developer's repository stays as it is; `origin` gets two push URLs (`git remote set-url --add --push origin <url>` for each), so one `git push` updates both. The buyer's Render (Part C) uses the buyer's repository.
- The database starts empty (the test data is not moved).

## Later: before the free database runs out

The free database is **deleted 30 days after it is created** (you get 14 more days of grace to upgrade).
- Before then, open **gearva-db** and change its plan to the smallest paid one. The data stays.
- Before real garages use Gearva, also move the three web services to a paid plan, so they don't sleep (README 9).
