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

Open the site and create the first account — it becomes the administrator.
After that only an administrator can add accounts; there is no open sign-up.

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
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

### 4. Set the environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon **pooled** connection string |
| `SESSION_SECRET` | any 32-byte random value — `openssl rand -hex 32`. Render generates one from `render.yaml`. Changing it later signs everyone out. |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |

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

Open the deployed URL and create an account. The first one becomes the
administrator; every later account has to be created by an administrator.

---

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
