# Price Escalation Calculator

Prepares price escalation bills under **Clause-45** for PWD road contracts.
It replaces a hand-maintained Excel workbook (`Pradeep Kumar 168.xlsx`) in which
every new contract meant copying the file and re-wiring cell references by hand.

Two things are entered by hand — the published rate indices, and the contract's
own particulars. Everything else is derived.

The calculation engine is verified against the original workbook: Agreement
168 of 2023-24 reproduces a payable of **₹1,72,604**, with every intermediate
matching to the paisa.

---

## How the numbers flow

```
Rates Chart          manual master data, shared by every contract
     │
     ├──────────────────────────┐
     ▼                          │
Index Average                   │   3-month mean per quarter
     │                          │
     ▼                          ▼
  Base Rate  ◄── Main Data (particulars, component shares, days worked)
     │
     ▼
Calculation          factor × share/100 × value × (current − base) / base
```

Full derivation and the reasoning behind each rule:
`docs/superpowers/specs/2026-08-28-pes-calculator-design.md`

---

## Running it locally

**Requirements:** Node 24+, and a PostgreSQL you can reach.

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and TEST_DATABASE_URL
npm run build
npm run seed                  # loads the rates chart and Agreement 168
npm start                     # http://localhost:3000
```

Open the site and create an account. Sign-up is open — anyone who can reach
the site can register — and the first account created becomes the administrator.

Each account sees only the contracts it created. The founding admin also adopts
any contract that predates sign-up, which is how the seeded Agreement 168 ends
up in the first account's list.

**Postgres in Docker**, if you don't already have one:

```bash
docker run -d --name pes-pg \
  -e POSTGRES_PASSWORD=pes -e POSTGRES_USER=pes -e POSTGRES_DB=pes \
  -p 55432:5432 postgres:17-alpine
docker exec pes-pg psql -U pes -d pes -c "CREATE DATABASE pes_test;"
```

**Working on the code** — two processes, with the API proxied to the Vite dev server:

```bash
npm run dev:server     # API on :3000
npm run dev:web        # UI on :5173, proxying /api to :3000
```

---

## Tests

```bash
npm test               # engine 39, server 27, web 8
```

> **The server tests call `DROP SCHEMA`.** They run only against
> `TEST_DATABASE_URL` and refuse any database whose name does not end in
> `_test`. Never point that variable at a database holding real work.

---

## Deploying to Render + Neon

### 1. Create the database

1. Sign in at [neon.tech](https://neon.tech) and create a project.
2. Copy the **pooled** connection string — the host contains `-pooler`.
   It looks like
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.

### 2. Push the repository

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin master
```

`.env` is git-ignored, so no credentials travel with the code.

### 3. Create the Render service

Either point Render at `render.yaml` (**New → Blueprint**), or create a
**New → Web Service** by hand with:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

### 4. Set the environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon **pooled** connection string |
| `SESSION_SECRET` | any 32-byte random value — `openssl rand -hex 32`. Render generates one from `render.yaml`. Changing it later signs everyone out. |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |

> **The build command must be `npm ci --include=dev`.** With
> `NODE_ENV=production` set, npm skips `devDependencies` — which is where
> `tsc` and `vite` live — and the build fails with `vite: not found`.

Leave `TEST_DATABASE_URL` unset in production. Nothing there runs tests, and
its absence is one more guard against a destructive run.

### 5. Deploy

Migrations apply automatically at startup, so the first boot creates the schema.
Watch the log for `Applied migrations: 001_init.sql`.

### 6. Load the rates chart

From your machine, pointed at Neon:

```bash
DATABASE_URL='<neon pooled url>' npm run seed -- --rates-only
```

That loads 39 months of published indices (Apr-2023 → Jun-2026) without
creating a sample contract. Drop `--rates-only` if you also want Agreement
168 of 2023-24 loaded as a worked example.

### 7. Create the first account

Open the deployed URL and create an account. **Create it immediately after
deploying:** sign-up is open, and the first account to register becomes the
administrator and adopts every contract already in the database.

---

## Keeping the free instance awake

Render spins a free service down after about 15 minutes of inactivity, and the
next visitor waits 50 seconds or more for it to boot. `.github/workflows/keep-warm.yml`
pings `/api/health` every 5 minutes during working hours so the service is up
when anyone would use it, and asleep overnight so the free instance-hours are
not spent idling.

**Setup** — one variable, no code change:

> Repo → Settings → Secrets and variables → Actions → **Variables** → New
> Name `RENDER_URL`, value `https://<your-service>.onrender.com`

Then run it once by hand to check: Actions → Keep warm → Run workflow.

**The budget it is designed around:**

| | |
|---|---|
| Awake window | 08:30 – 20:25 IST, Monday to Saturday |
| Render instance-hours | ~312/month, against a free allowance of 750 |
| Ping interval | 5 minutes — two runs can be skipped and the service still stays awake |
| GitHub Actions minutes | free and unlimited **while this repo is public** |

**Two caveats worth knowing:**

- **If you make the repo private**, this workflow costs ~3,700 Actions minutes a
  month against a 2,000-minute free allowance. Switch to the external pinger
  below, or widen the interval to 10 minutes and narrow the window.
- **GitHub disables scheduled workflows after 60 days without a commit.** If the
  project goes quiet, the pings stop silently. Any commit re-enables them.

**A more reliable alternative:** point [cron-job.org](https://cron-job.org) or
UptimeRobot at `https://<your-service>.onrender.com/api/health` every 5 minutes
with the same time window. Both are free, neither is subject to GitHub's
scheduling delays or the 60-day rule, and neither spends Actions minutes. If you
use one, delete the workflow so you are not doing the job twice.

Neither approach is a substitute for Render's paid Starter plan (~$7/month),
which simply does not spin down.

## Notes

- **The free Render plan sleeps when idle**, so the first request after a
  pause takes a few seconds to wake the service.
- **Session cookies use `secure: 'auto'`**, so they carry the Secure flag
  behind Render's TLS while still working if you run a production build over
  plain HTTP locally.
- **The rates chart is shared by every contract.** Fill a month once and every
  contract picks it up. Bills already prepared will change if you edit a month
  they depend on.
- **`npm run seed` overwrites contract #1's figures** with the workbook values.
  Avoid it once real contracts are in the database, or use `--rates-only`.
- **There is no password-change screen yet.** Passwords are set when an account
  is created.
- **Sign-up is open to anyone who can reach the site.** Contracts are walled off
  per account, so a stranger who registers sees an empty list and cannot read or
  delete your bills — but they can still create their own, and the rates chart
  is shared and editable by every signed-in account.
- **Deleting an account that owns contracts is refused** (`ON DELETE RESTRICT`),
  so removing a user cannot silently destroy billing data. Reassign its
  contracts first: `UPDATE contracts SET user_id = <new owner> WHERE user_id = <old>`.
