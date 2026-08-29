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
npm test               # engine 39, server 43, web 27
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
next visitor waits 50 seconds or more for it to boot. An external pinger hits
`/api/health` every 5 minutes during working hours, so the service is up when
anyone would use it and asleep overnight, which keeps the instance-hours well
inside the free allowance.

**Setup** — [cron-job.org](https://cron-job.org), free, and nothing in this repo:

> URL       `https://pes-calculator.onrender.com/api/health`
> Schedule  Custom → `*/5 8-20 * * 1-6`
> Timezone  Asia/Kolkata
> Notify    on failed execution, after 2 failures

Turn the failure notification on. A pinger that dies quietly is the exact
problem it exists to prevent.

**The budget it is designed around:**

| | |
|---|---|
| Awake window | 08:00 – 20:59 IST, Monday to Saturday |
| Render instance-hours | ~346/month, against a free allowance of 750 |
| Ping interval | 5 minutes — two runs can be skipped and the service still stays awake |

**Why not GitHub Actions.** This repo used to carry
`.github/workflows/keep-warm.yml` doing the same job on a `*/5 3-14 * * 1-6`
schedule. It was removed on 2026-08-29, for three reasons worth remembering
before anyone adds it back:

- **It never ran.** In 18 hours on the default branch it fired zero times, across
  roughly 60 eligible slots. GitHub throttles high-frequency `schedule` triggers
  hard on new, low-activity repositories.
- **It reported success while doing nothing.** With the `RENDER_URL` variable
  unset it took its `exit 0` branch and pinged nothing, so the Actions tab looked
  green the whole time it was broken.
- **Scheduled workflows are disabled after 60 days without a commit**, and if the
  repo were ever made private the job would cost ~3,700 Actions minutes a month
  against a 2,000-minute allowance.

**Avoid UptimeRobot for this.** Its free plan has prohibited commercial use since
December 2024, and it cannot restrict checks to a time window — pinging around
the clock would spend ~744 of the 750 free instance-hours.

No pinger is a substitute for Render's paid Starter plan (~$7/month), which
simply does not spin down.

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
- **Change your password under "Your account"**, linked from the contracts list
  and from every contract's sidebar. It asks for the current password, and on
  success signs the account out of every other device.
- **There is no forgotten-password recovery.** Nothing here sends email, so an
  account locked out of its password has to be reset directly in the database:
  hash a new one with argon2id and `UPDATE users SET password_hash = ...`.
- **Sign-up is open to anyone who can reach the site.** Contracts are walled off
  per account, so a stranger who registers sees an empty list and cannot read or
  delete your bills — but they can still create their own, and the rates chart
  is shared and editable by every signed-in account.
- **Deleting an account that owns contracts is refused** (`ON DELETE RESTRICT`),
  so removing a user cannot silently destroy billing data. Reassign its
  contracts first: `UPDATE contracts SET user_id = <new owner> WHERE user_id = <old>`.
