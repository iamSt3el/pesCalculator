# Price Escalation (PES) Calculator — Design

**Date:** 2026-08-28
**Status:** Approved for planning
**Source:** `Pradeep Kumar 168.xlsx` — Agreement 168 of 2023-24, M/s. Pradeep Kumar Contractor

## 1. Problem

Price escalation bills under Clause-45 of the agreement are currently prepared in a
hand-maintained Excel workbook. Every new contract means copying the workbook and
re-wiring cell references by hand. Formulas are invisible until a cell is clicked,
manual overrides sit indistinguishably beside computed values, and a single broken
reference silently changes the final payable amount.

This project replaces the workbook with a deployed web application. Two things are
entered by hand — the published rate indices, and the contract's own particulars —
and everything else is derived.

## 2. Analysis of the source workbook

### 2.1 Sheet dependency graph

```
[Rates Chart ok]  ── manual master data, Apr-2023 … Aug-2026
   Month | Labour | Material | Cement | Steel | POL | Bitumen-G | Bitumen-H
        │
        ├───────────────────────────┐
        ▼                           │
[Index Average] ─ 63 refs ──────────┤   selects the 9 relevant months,
   3-month mean per quarter         │   averages each quarter
        │                           │
        ▼                           ▼
   [Base Rate] ◄─ 21 refs ── [Rates Chart]  (bitumen base, read directly)
        │  ▲
        │  └─ 15 refs ── [Main Data]  (header fields + component percentages)
        ▼
[Calculation PES] ◄─ 21 from Base Rate, 15 from Index Average,
        │             6 from Rates Chart, 1 from Main Data
        └─► 'Main Data'!Q18   (display-only back-reference)
```

Formula counts per sheet: Main Data 70, Rates Chart 1, Index Average 77,
Base Rate 66, Calculation PES 131.

### 2.2 Sheets deliberately excluded

`Expenditure`, `Expenditure ok`, and `Expenditure ok (new)` have **zero cross-sheet
references in or out**. They are scratch pads for unrelated contracts — package
RJ-20-07/BA/ML/2022-23 (17.67% tender premium below) and RJ-29-01 DLB Laxmangarh
(27.99% below). They contribute nothing to the escalation calculation and are out
of scope.

### 2.3 Inputs vs. derived values

**Entered by hand — Main Data:**

| Field | Workbook cell | Example |
|---|---|---|
| Agreement No. | D3 | 168 of 2023-24 |
| Name of Contractor | D4 | M/s. Pradeep Kumar Contractor |
| Name of Work | D5 | Const. of various Roads under Pkg No RJ-20-06/ML/2023-24 Distt Jhunjhunu |
| Work Order Amount | D7 | 23,977,779 |
| Work Done Amount | D9 | 21,717,359 |
| Last Date of Bid Submission | D10 | 12-Sep-2023 |
| Date of Commencement | D11 | 24-Sep-2023 |
| Stipulated Date of Completion | D12 | 23-Feb-2024 |
| Actual Date of Completion | D13 | 23-Feb-2024 |
| Work Order No. & Date | K12 | No. 1504-12 Date 14.09.2024 |
| Component percentages | L4:L9 | 9.28 / 53.12 / 0 / 0.65 / 8.11 / 28.84 |
| Component factors | M4:M9 | 0.75 ×5, 0.85 for Bitumen |
| Bitumen base offset (days) | L13 | 28 |
| Days worked per month, per span | D30:D65, F, H, J | — |
| Already-paid escalation | 'Calculation PES'!O48 | 0 |

Percentages must total 100 (L10 asserts this). In the source, POL and Bitumen were
written as `10.11-2` and `26.84+2` — a manual transfer of 2 percentage points from
POL to Bitumen. The application stores the resulting values (8.11, 28.84) and does
not model the transfer.

**Entered by hand — Rates Chart:** the published index for each month. Columns
Labour, Material (All Commodities), Cement, Steel, POL, Bitumen VG-10 rate.
Column H holds a second bitumen series (annotated "Panipat" for early rows) which
is recorded but not used in any calculation.

**Everything else is derived.** Index Average, Base Rate (except the payment
schedule adjustments), and Calculation PES contain no independent inputs.

## 3. Domain rules

### 3.1 Spanwise work-done distribution

Given `commencement`, `actual_completion`, and `work_done_amount` W:

```
P  = actual_completion − commencement                     (152 days)
b  = [round(P/4), round(P/2), round(3P/4), P]             (38, 76, 114, 152)
d  = [b1, b2−b1, b3−b2, b4−b3]                            (38, 38, 38, 38)
t  = [commencement+d1, t1+d2, t2+d3, t3+d4]               (span end dates)
v  = [W/8, 3W/8, 3W/4, W]                                 (cumulative value)
s  = [v1, v2−v1, v3−v2, v4−v3]  =  [W/8, W/4, 3W/8, W/4]  (span value)
r  = [s1/d1, s2/d2, s3/d3, s4/d4]                         (per-day rate)
```

`round` is half-away-from-zero to zero decimals, matching Excel's `ROUND`.

For each month the operator enters days worked in each of the four spans. Then:

```
monthly_amount(m)   = Σ_i  days[m][i] × r[i]
quarterly_amount(q) = Σ  monthly_amount(m)  for m in calendar quarter q
```

Calendar quarters are Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec.

### 3.2 Base quarter and base indices

The **base quarter** is the calendar quarter containing the bid-submission date.
For a bid dated 12-Sep-2023 this is Jul–Sep 2023.

Base index per component, each rule overridable per contract:

| Component | Rule | Value in source |
|---|---|---|
| Labour | mean of the base quarter's 3 months | 126.2 |
| Material | mean of the base quarter's 3 months | 99.40 |
| Cement | mean of the base quarter's 3 months | 98.60 |
| Steel | mean of the base quarter's 3 months | 92.766… |
| POL | index of the **month containing the bid date** | 90.8 (Sep-2023) |
| Bitumen | rate of the **month containing (bid date − offset days)** | 38,882 (Aug-2023) |

The offset defaults to 28 days and is a per-contract field.

**Asymmetry to preserve:** POL's *base* is a single month, but POL's *current*
index is still the quarter mean, exactly as `'Index Average'!F15/F19/F23` feed
`'Calculation PES'!J32:J34`. Only the base differs from the other index components.

### 3.3 Quarters under consideration

Derived from the payment schedule: every calendar quarter that carries a payment.
For the source contract these are Jul–Sep 2023, Oct–Dec 2023, Jan–Mar 2024.

The first quarter under consideration coincides with the base quarter, so for the
five index components its `current − base` difference is zero by construction, and
Labour Q1 correctly yields 0. This is a property of the data, not a special case.

The current index for a quarter is the mean of that quarter's three months from the
Rates Chart, regardless of which months carry payments.

### 3.4 The escalation formula

For the five index components (Labour, Material, Cement, Steel, POL), per quarter:

```
amount = factor × (percent / 100) × payment_quarter × (current_index − base_index) / base_index
```

For Bitumen, per **month** rather than per quarter:

```
amount = 0.85 × (percent / 100) × payment_month × (rate_month − base_rate) / base_rate
```

Then:

```
grand_total = Σ amounts across all six components
payable     = round(grand_total − already_paid, 0)
```

### 3.5 Schedule of payment

The monthly figures are pre-filled from §3.1 and rounded to whole rupees, and each
month carries an editable adjustment. In the source workbook these adjustments were
`+500000`, `+800000`, `+400000`, `−900000`, `−800000` — netting to zero, so the
schedule still totals the Work Done Amount of 21,717,359.

```
payment_month = round(monthly_amount, 0) + adjustment
```

The schedule lists every month whose computed amount is non-zero, plus any month the
operator has given an adjustment. In the source contract that is Sep-2023 through
Feb-2024 — the six months carrying work.

**Rounding must preserve the total.** Rounding each month independently loses money:
the six exact monthly amounts round to 21,717,358, one rupee short of the Work Done
Amount. This is precisely why the source workbook contains a hand-typed `5572218`
where the calculation yields 5,572,217.11 — a manual patch for a rounding shortfall.
The application instead allocates by **largest remainder**: floor every month, then
distribute the shortfall one rupee at a time to the months with the largest discarded
fractions. The rounded figures then sum to the Work Done Amount by construction, with
no manual correction. Verified against the source contract: largest-remainder
allocation and the workbook's hand-patched figures produce identical component totals
to the paisa and the same payable of ₹1,72,604.

The UI warns, without blocking, when the schedule total drifts from the Work Done
Amount. Bitumen consumes the monthly figures; the other five consume the quarterly
sums of the same figures.

## 4. Architecture

```
Render Web Service (single service, push-to-deploy from GitHub)
  └─ Express on Node 24 ── serves the built React bundle AND the JSON API
        │                   single origin: no CORS, no serverless adaptation
        ├─ engine/          pure TypeScript, zero I/O, zero dependencies
        └─ pg ────────────► Neon PostgreSQL   (main = production, dev = local)
```

The calculation engine is a standalone workspace imported by **both** the browser
and the server. The browser uses it to recalculate live as the operator types; the
server re-runs it on every write so stored results cannot drift from stored inputs.
Clause-45 exists in exactly one place and is unit-tested in isolation.

### 4.1 Engine modules

| Module | Responsibility | Depends on |
|---|---|---|
| `types.ts` | domain types, component keys, base-rule enum | — |
| `dates.ts` | month keys, calendar-quarter grouping, Excel-serial import | — |
| `spans.ts` | §3.1 — period → spans → per-day rates → monthly/quarterly amounts | dates |
| `indices.ts` | §3.2/§3.3 — rate lookup, quarter means, base-rate resolution | dates |
| `escalation.ts` | §3.4 — per-component amounts, grand total, payable | all above |

Each module is independently testable and none performs I/O. `indices.ts` returns a
typed "missing months" list rather than throwing, so the UI can name the exact
months absent from the Rates Chart.

### 4.2 Repository layout

```
engine/       pure calculation + its unit tests
server/       Express app, routes, auth, migrations, seed
web/          React + Vite + TypeScript
render.yaml   infrastructure as code
```

Tied together with npm workspaces so `engine` imports as a single module on both
sides.

## 5. Data model (PostgreSQL)

All monetary and index values use `NUMERIC`, never floating point. The workbook's
`130.19999999999999` artefacts are float noise and are not reproduced.

| Table | Columns | Notes |
|---|---|---|
| `users` | id, email (unique), password_hash, role, created_at | argon2 hashes |
| `session` | managed by connect-pg-simple | survives restarts |
| `rates` | month (DATE, PK), labour, material, cement, steel, pol, bitumen_g, bitumen_h, source | **global master** |
| `contracts` | id, agreement_no, contractor, work_name, wo_no_date, wo_amount, work_done_amount, bid_date, commencement, stipulated_completion, actual_completion, bitumen_offset_days, already_paid, created_at, updated_at | |
| `components` | contract_id, key, percent, factor, base_rule, base_override | 6 rows per contract |
| `progress` | contract_id, month, span1_days, span2_days, span3_days, span4_days | PK (contract_id, month) |
| `payments` | contract_id, month, adjustment | PK (contract_id, month); computed part is derived, not stored |

`components.key` is one of `labour | material | cement | steel | pol | bitumen`.
`components.base_rule` is one of `quarter_average | bid_month | offset_month`.
`base_override` is null unless the operator has pinned a value by hand.

Only the operator's `adjustment` is persisted in `payments`; the computed portion is
recalculated from `progress` on read, so correcting a day count propagates correctly
instead of leaving a stale stored amount behind.

Migrations are numbered plain-SQL files applied at server startup, tracked in a
`schema_migrations` table.

## 6. HTTP API

All routes below `/api` require an authenticated session.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | email + password → session cookie |
| POST | `/api/auth/logout` | destroy session |
| GET | `/api/auth/me` | current user |
| POST | `/api/users` | admin only — create an account |
| GET/PUT | `/api/rates` | read / upsert the shared rates table |
| POST | `/api/rates/paste` | parse a tab-separated block pasted from Excel |
| GET/POST | `/api/contracts` | list / create |
| GET/PUT/DELETE | `/api/contracts/:id` | contract header |
| PUT | `/api/contracts/:id/components` | percentages, factors, base rules and overrides |
| PUT | `/api/contracts/:id/progress` | days per month per span |
| PUT | `/api/contracts/:id/payments` | per-month adjustments |
| GET | `/api/contracts/:id/calculation` | the full computed result — every intermediate, not just the total |

`GET /api/contracts/:id/calculation` returns the entire derivation: span table, base
quarter and its months, resolved base rates with the rule that produced each,
quarter means, per-component per-quarter lines, and the payable total. The report
screen renders that response directly rather than recomputing it, so what is printed
is exactly what the server calculated.

## 7. Screens

1. **Contracts** — list, create, open. Multiple agreements coexist.
2. **Main Data** — agreement particulars; component percentage table with a live
   "must total 100" check; spanwise grid for days per month. Span dates, per-day
   rates and monthly/quarterly totals update as the operator types.
3. **Rates Chart** — editable grid seeded with the workbook's Apr-2023 → Aug-2026
   rows, with paste-from-Excel.
4. **Index Average** — read-only. Shows which nine months were selected and each
   quarter's mean, so the selection can be audited at a glance.
5. **Base Rate** — resolved base index per component, each showing the rule that
   produced it and accepting an override; plus the Schedule of Payment, auto-filled
   and editable, with a live total-drift warning.
6. **Calculation PES** — the report. Six component blocks showing each line of the
   formula with its operands, grand total, less already paid, rounded payable.
   Print-ready.

## 8. Validation and error handling

Validation is surfaced inline and never blocks typing:

- component percentages not totalling 100
- a month required by the calculation missing from the Rates Chart — named explicitly
- payment schedule total drifting from the Work Done Amount
- actual completion earlier than commencement
- a base index resolving to zero, which would divide by zero

The calculation endpoint returns partial results alongside the problems that
prevented completion, so the operator sees how far the derivation got.

## 9. Authentication

Session cookies with `httpOnly`, `secure`, `sameSite=lax`; argon2 password hashing;
sessions in Postgres. **No open sign-up** — the first account created becomes admin
and the admin creates all further accounts. Login is rate-limited. All authenticated
users share the same contracts and the same rates table: this is one firm's internal
tool, not multi-tenant software. Helmet sets security headers; `sameSite=lax` plus
JSON-only mutation endpoints covers CSRF.

## 10. Testing

**The workbook is the acceptance test.** A golden fixture seeds Agreement 168 of
2023-24 and asserts the engine reproduces every intermediate:

- span days 38 / 38 / 38 / 38 and span values 1/8, 1/4, 3/8, 1/4 of 21,717,359
- base quarter Jul–Sep 2023
- base rates 126.2 / 99.40 / 98.60 / 92.766… / 90.8 / 38,882
- component totals −18,356 / +24,517 / 0 / −4,386 / −6,959 / +177,789
- payable **₹1,72,604**

Component-level unit tests cover the rules independently of that fixture: rounding
behaviour, base-rule resolution including overrides, quarter grouping across a year
boundary, and the missing-rate-month path. API integration tests run against a Neon
test branch. A seed script loads the same contract so the deployed app has real data
to click through from first run.

## 11. Deployment

`render.yaml` declares one web service: build runs the workspace install, the engine
and web builds, and the server compile; start runs migrations then boots Express.
`DATABASE_URL` and `SESSION_SECRET` are environment variables — `DATABASE_URL` points
at Neon's pooled connection string. Local development uses a Neon dev branch, so no
local Postgres install is needed and dev can be reset without touching production.

The repository, the Neon project and the Render service are created by the operator;
this project produces the code, the `render.yaml`, and step-by-step deploy
instructions. Nothing is pushed or provisioned on the operator's behalf.

## 12. Out of scope

- The three Expenditure sheets (§2.2) — unrelated contracts, no links
- Excel file export; the report screen is print/PDF only
- Multi-tenancy, per-user permissions beyond admin/user
- Editing the published index figures' provenance, or fetching them from any source
