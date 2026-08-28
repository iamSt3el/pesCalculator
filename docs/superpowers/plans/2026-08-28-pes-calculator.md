# PES Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace a hand-maintained Excel workbook with a deployed web application that computes Clause-45 price escalation bills from two hand-entered inputs — published rate indices and contract particulars — deriving everything else.

**Architecture:** A pure TypeScript calculation engine with zero I/O is imported by both the browser and the server, so Clause-45 lives in exactly one place. An Express server on Node 24 serves both the built React bundle and the JSON API from a single origin, backed by Neon PostgreSQL. The server re-runs the engine on every read so stored results cannot drift from stored inputs.

**Tech Stack:** Node 24, TypeScript (ESM, native type stripping), Express 5, `pg`, `express-session` + `connect-pg-simple`, argon2, Zod, React 19, Vite 7, `node:test`. Deployed as one Render web service against Neon Postgres.

**Spec:** `docs/superpowers/specs/2026-08-28-pes-calculator-design.md`

## Global Constraints

- **Node >= 24.** `package.json` sets `"engines": { "node": ">=24" }`. All packages are ESM (`"type": "module"`).
- **TypeScript with `erasableSyntaxOnly: true`.** Tests run directly on `.ts` via Node's native type stripping (`node --test`), so no `enum`, no `namespace`, no parameter properties. Use `const` objects plus union types instead.
- **`engine/` has zero runtime dependencies.** Its only devDependency is `typescript`. It must never import from `server/` or `web/`.
- **Money is integer rupees inside the engine.** Payments, adjustments and totals are whole-rupee integers (safely under `Number.MAX_SAFE_INTEGER`). Indices and intermediate escalation amounts are float64; rounding happens only at the final payable. Postgres stores money as `NUMERIC`; the boundary in `server/src/assemble.ts` converts the strings `pg` returns into numbers.
- **Rounding is half-away-from-zero** (Excel `ROUND` semantics), via `roundHalfAwayFromZero` in `engine/src/dates.ts`. Never use bare `Math.round`, which is half-up and wrong for negatives.
- **The payment schedule uses largest-remainder allocation** so rounded monthly figures sum exactly to the Work Done Amount. Never round months independently.
- **Component keys are exactly** `'labour' | 'material' | 'cement' | 'steel' | 'pol' | 'bitumen'`, in that order everywhere they are listed.
- **Months are canonically `'YYYY-MM'` strings.** Dates are `'YYYY-MM-DD'` strings. Never pass `Date` objects across module boundaries — timezone drift silently shifts a month.
- **No open sign-up.** The first account created becomes `admin`; only an admin may create further accounts.
- **Golden values that must never regress:** base rates 126.2 / 99.4 / 98.6 / 92.766667 / 90.8 / 38882; component totals −18356.29 / +24516.94 / 0 / −4386.11 / −6959.29 / +177788.75; payable **172604**.

---

## File Structure

```
pes-calculator/
├── package.json                  npm workspaces root, shared scripts
├── tsconfig.base.json            strict + erasableSyntaxOnly, shared by all workspaces
├── render.yaml                   Render infrastructure as code
├── .env.example                  DATABASE_URL, SESSION_SECRET
├── engine/                       pure calculation — zero runtime deps
│   ├── src/
│   │   ├── types.ts              domain types and component key list
│   │   ├── dates.ts              month keys, quarters, date arithmetic, rounding
│   │   ├── spans.ts              span distribution, monthly amounts, rupee allocation
│   │   ├── indices.ts            rate lookup, quarter means, base-rate resolution
│   │   ├── escalation.ts         the Clause-45 formula, totals, payable
│   │   └── index.ts              public surface re-exports
│   └── test/
│       ├── dates.test.ts  spans.test.ts  indices.test.ts  escalation.test.ts
│       ├── golden.test.ts        Agreement 168 end-to-end
│       └── fixtures/agreement168.ts
├── server/
│   ├── src/
│   │   ├── index.ts              bootstrap: migrate, then listen
│   │   ├── app.ts                Express app factory (testable without a port)
│   │   ├── db.ts                 pg Pool
│   │   ├── migrate.ts            numbered-SQL migration runner
│   │   ├── assemble.ts           DB rows → engine input → CalculationResult
│   │   ├── auth/                 password.ts, routes.ts, middleware.ts
│   │   ├── repo/                 rates.ts, contracts.ts, components.ts, progress.ts, payments.ts
│   │   └── routes/               rates.ts, contracts.ts, calculation.ts
│   ├── migrations/001_init.sql
│   ├── seed/{rates.json, seed.ts}
│   └── test/
└── web/
    ├── vite.config.ts, index.html
    └── src/
        ├── main.tsx, App.tsx, api.ts, styles.css
        ├── pages/                Contracts, MainData, RatesChart, IndexAverage, BaseRate, Calculation
        └── components/           shared table/field primitives
```

Split by responsibility, not by layer: each engine module owns one rule from the spec and is tested against that rule alone. `assemble.ts` is the only place that knows both the database shape and the engine shape.

---

### Task 1: Workspace scaffold and the dates module

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `engine/package.json`, `engine/tsconfig.json`
- Create: `engine/src/types.ts`, `engine/src/dates.ts`
- Test: `engine/test/dates.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `type ComponentKey = 'labour'|'material'|'cement'|'steel'|'pol'|'bitumen'`
  - `const COMPONENT_KEYS: readonly ComponentKey[]`
  - `type BaseRule = 'quarter_average'|'bid_month'|'offset_month'`
  - `type Month = string` (`'YYYY-MM'`), `type Quarter = string` (`'YYYY-Qn'`), `type IsoDate = string`
  - `interface RateRow { month: Month; labour: number|null; material: number|null; cement: number|null; steel: number|null; pol: number|null; bitumenG: number|null; bitumenH: number|null }`
  - `interface ComponentConfig { key: ComponentKey; percent: number; factor: number; baseRule: BaseRule; baseOverride: number|null }`
  - `interface ContractInput { agreementNo: string; contractor: string; workName: string; woNoDate: string; woAmount: number; workDoneAmount: number; bidDate: IsoDate; commencement: IsoDate; stipulatedCompletion: IsoDate; actualCompletion: IsoDate; bitumenOffsetDays: number; alreadyPaid: number }`
  - `interface ProgressRow { month: Month; spanDays: [number,number,number,number] }`
  - `monthOfDate(d: IsoDate): Month`
  - `addDays(d: IsoDate, n: number): IsoDate`
  - `daysBetween(a: IsoDate, b: IsoDate): number`
  - `quarterOfMonth(m: Month): Quarter`
  - `monthsOfQuarter(q: Quarter): [Month, Month, Month]`
  - `roundHalfAwayFromZero(x: number, dp?: number): number`

- [ ] **Step 1: Create the workspace root**

`package.json`:
```json
{
  "name": "pes-calculator",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "workspaces": ["engine", "server", "web"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present"
  },
  "devDependencies": { "typescript": "^5.7.0" }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "skipLibCheck": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.env
*.log
```

`engine/package.json`:
```json
{
  "name": "@pes/engine",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test 'test/**/*.test.ts'"
  }
}
```

`engine/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

Run `npm install` at the root.

- [ ] **Step 2: Write the failing test**

`engine/test/dates.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOfDate, addDays, daysBetween, quarterOfMonth,
  monthsOfQuarter, roundHalfAwayFromZero,
} from '../src/dates.ts';

test('monthOfDate truncates a date to its month', () => {
  assert.equal(monthOfDate('2023-09-12'), '2023-09');
  assert.equal(monthOfDate('2024-01-01'), '2024-01');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2023-09-12', -28), '2023-08-15');
  assert.equal(addDays('2023-12-31', 1), '2024-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); // leap year
});

test('daysBetween counts the work period', () => {
  assert.equal(daysBetween('2023-09-24', '2024-02-23'), 152);
  assert.equal(daysBetween('2024-02-23', '2023-09-24'), -152);
});

test('quarterOfMonth groups into calendar quarters', () => {
  assert.equal(quarterOfMonth('2023-09'), '2023-Q3');
  assert.equal(quarterOfMonth('2023-10'), '2023-Q4');
  assert.equal(quarterOfMonth('2024-01'), '2024-Q1');
});

test('monthsOfQuarter expands a quarter, including across a year boundary', () => {
  assert.deepEqual(monthsOfQuarter('2023-Q3'), ['2023-07', '2023-08', '2023-09']);
  assert.deepEqual(monthsOfQuarter('2024-Q1'), ['2024-01', '2024-02', '2024-03']);
});

test('roundHalfAwayFromZero matches Excel ROUND, including negatives', () => {
  assert.equal(roundHalfAwayFromZero(38), 38);
  assert.equal(roundHalfAwayFromZero(0.5), 1);
  assert.equal(roundHalfAwayFromZero(-0.5), -1);   // Math.round gives -0 here
  assert.equal(roundHalfAwayFromZero(-1.5), -2);   // Math.round gives -1 here
  assert.equal(roundHalfAwayFromZero(172603.9973), 172604);
  assert.equal(roundHalfAwayFromZero(-18356.293429, 2), -18356.29);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @pes/engine`
Expected: FAIL — `Cannot find module '../src/dates.ts'`

- [ ] **Step 4: Write the types**

`engine/src/types.ts`:
```ts
export type ComponentKey = 'labour' | 'material' | 'cement' | 'steel' | 'pol' | 'bitumen';

export const COMPONENT_KEYS: readonly ComponentKey[] = [
  'labour', 'material', 'cement', 'steel', 'pol', 'bitumen',
] as const;

/** How a component's base index is derived from the rates chart. */
export type BaseRule = 'quarter_average' | 'bid_month' | 'offset_month';

export type Month = string;    // 'YYYY-MM'
export type Quarter = string;  // 'YYYY-Qn'
export type IsoDate = string;  // 'YYYY-MM-DD'

export interface RateRow {
  month: Month;
  labour: number | null;
  material: number | null;
  cement: number | null;
  steel: number | null;
  pol: number | null;
  bitumenG: number | null;
  /** Second bitumen series, recorded but unused in any calculation. */
  bitumenH: number | null;
}

export interface ComponentConfig {
  key: ComponentKey;
  percent: number;
  factor: number;
  baseRule: BaseRule;
  /** When set, overrides the rule-derived base index. */
  baseOverride: number | null;
}

export interface ContractInput {
  agreementNo: string;
  contractor: string;
  workName: string;
  woNoDate: string;
  woAmount: number;
  workDoneAmount: number;
  bidDate: IsoDate;
  commencement: IsoDate;
  stipulatedCompletion: IsoDate;
  actualCompletion: IsoDate;
  bitumenOffsetDays: number;
  alreadyPaid: number;
}

export interface ProgressRow {
  month: Month;
  spanDays: [number, number, number, number];
}
```

- [ ] **Step 5: Write the dates module**

`engine/src/dates.ts`:
```ts
import type { IsoDate, Month, Quarter } from './types.ts';

/** Parse 'YYYY-MM-DD' as a UTC timestamp. Local time would shift months. */
function utc(d: IsoDate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

function iso(ts: number): IsoDate {
  return new Date(ts).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function monthOfDate(d: IsoDate): Month {
  return d.slice(0, 7);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return iso(utc(d) + n * DAY_MS);
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

export function quarterOfMonth(m: Month): Quarter {
  const [y, mm] = m.split('-').map(Number) as [number, number];
  return `${y}-Q${Math.floor((mm - 1) / 3) + 1}`;
}

export function monthsOfQuarter(q: Quarter): [Month, Month, Month] {
  const [ys, qs] = q.split('-Q') as [string, string];
  const first = (Number(qs) - 1) * 3 + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return [`${ys}-${pad(first)}`, `${ys}-${pad(first + 1)}`, `${ys}-${pad(first + 2)}`];
}

/**
 * Excel ROUND semantics: ties go away from zero.
 * Math.round is half-up, which rounds -1.5 to -1 instead of -2.
 */
export function roundHalfAwayFromZero(x: number, dp = 0): number {
  const f = 10 ** dp;
  const scaled = x * f;
  // Nudge past float representation error (e.g. 1.005*100 === 100.49999999999999)
  const corrected = Number(scaled.toPrecision(12));
  return (corrected < 0 ? -Math.round(-corrected) : Math.round(corrected)) / f;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w @pes/engine`
Expected: PASS — 6 tests

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json .gitignore engine/ package-lock.json
git commit -m "feat(engine): add workspace scaffold, domain types and date utilities"
```

---

### Task 2: Span distribution and the payment schedule

**Files:**
- Create: `engine/src/spans.ts`
- Test: `engine/test/spans.test.ts`

**Interfaces:**
- Consumes: from Task 1 — `roundHalfAwayFromZero`, `daysBetween`, `addDays`, `quarterOfMonth`, types `Month`, `Quarter`, `IsoDate`, `ProgressRow`
- Produces:
  - `interface SpanTable { totalDays: number; days: [number,number,number,number]; values: [number,number,number,number]; perDay: [number,number,number,number]; endDates: [IsoDate,IsoDate,IsoDate,IsoDate] }`
  - `computeSpans(commencement: IsoDate, actualCompletion: IsoDate, workDoneAmount: number): SpanTable`
  - `monthlyExact(progress: ProgressRow[], spans: SpanTable): Map<Month, number>`
  - `allocateRupees(exact: Map<Month, number>, total: number): Map<Month, number>`
  - `interface ScheduleRow { month: Month; computed: number; adjustment: number; payment: number }`
  - `interface PaymentSchedule { rows: ScheduleRow[]; total: number; byQuarter: Map<Quarter, number> }`
  - `buildSchedule(progress: ProgressRow[], spans: SpanTable, workDoneAmount: number, adjustments: Map<Month, number>): PaymentSchedule`

- [ ] **Step 1: Write the failing test**

`engine/test/spans.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpans, monthlyExact, allocateRupees, buildSchedule } from '../src/spans.ts';
import type { ProgressRow } from '../src/types.ts';

const W = 21_717_359;
const spans = computeSpans('2023-09-24', '2024-02-23', W);

const progress: ProgressRow[] = [
  { month: '2023-09', spanDays: [6, 0, 0, 0] },
  { month: '2023-10', spanDays: [31, 0, 0, 0] },
  { month: '2023-11', spanDays: [1, 29, 0, 0] },
  { month: '2023-12', spanDays: [0, 9, 22, 0] },
  { month: '2024-01', spanDays: [0, 0, 16, 15] },
  { month: '2024-02', spanDays: [0, 0, 0, 23] },
];

test('computeSpans splits the period into four quarters of time', () => {
  assert.equal(spans.totalDays, 152);
  assert.deepEqual(spans.days, [38, 38, 38, 38]);
});

test('computeSpans splits value 1/8, 1/4, 3/8, 1/4 and they sum to the whole', () => {
  assert.deepEqual(spans.values, [W / 8, W / 4, (W * 3) / 8, W / 4]);
  assert.equal(spans.values.reduce((a, b) => a + b, 0), W);
});

test('computeSpans dates each span end from the commencement date', () => {
  assert.deepEqual(spans.endDates, ['2023-11-01', '2023-12-09', '2024-01-16', '2024-02-23']);
});

test('computeSpans derives per-day rates from value over days', () => {
  assert.equal(spans.perDay[0], W / 8 / 38);
  assert.ok(Math.abs(spans.perDay[2] - 214316.0427631579) < 1e-6);
});

test('monthlyExact multiplies days by the rate of their own span', () => {
  const monthly = monthlyExact(progress, spans);
  assert.ok(Math.abs(monthly.get('2023-09')! - 428632.0855263158) < 1e-6);
  assert.ok(Math.abs(monthly.get('2023-12')! - 6000849.197368421) < 1e-6);
  const sum = [...monthly.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - W) < 1e-6);
});

test('allocateRupees preserves the total instead of rounding each month down', () => {
  const monthly = monthlyExact(progress, spans);
  const alloc = allocateRupees(monthly, W);
  // Independent rounding would total 21717358 — one rupee short.
  assert.equal([...alloc.values()].reduce((a, b) => a + b, 0), W);
  assert.equal(alloc.get('2023-09'), 428_632);
  assert.equal(alloc.get('2023-10'), 2_214_599);
  assert.equal(alloc.get('2023-11'), 4_214_882);
  assert.equal(alloc.get('2023-12'), 6_000_849);
  assert.equal(alloc.get('2024-01'), 5_572_217);
  // Feb carries the largest discarded fraction (.32) so it takes the spare rupee.
  assert.equal(alloc.get('2024-02'), 3_286_180);
});

test('allocateRupees gives every month a whole number of rupees', () => {
  const alloc = allocateRupees(monthlyExact(progress, spans), W);
  for (const v of alloc.values()) assert.equal(Number.isInteger(v), true);
});

test('buildSchedule applies adjustments and groups by calendar quarter', () => {
  const adjustments = new Map<string, number>([
    ['2023-10', 500_000], ['2023-11', 800_000], ['2023-12', 400_000],
    ['2024-01', -900_000], ['2024-02', -800_000],
  ]);
  const sched = buildSchedule(progress, spans, W, adjustments);
  assert.equal(sched.total, W);
  assert.equal(sched.rows.find((r) => r.month === '2023-10')!.payment, 2_714_599);
  assert.equal(sched.byQuarter.get('2023-Q3'), 428_632);
  assert.equal(sched.byQuarter.get('2023-Q4'), 14_130_330);
  assert.equal(sched.byQuarter.get('2024-Q1'), 7_158_397);
});

test('buildSchedule includes a month that has only an adjustment', () => {
  const sched = buildSchedule(progress, spans, W, new Map([['2024-03', 1000]]));
  const march = sched.rows.find((r) => r.month === '2024-03');
  assert.equal(march?.computed, 0);
  assert.equal(march?.payment, 1000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @pes/engine`
Expected: FAIL — `Cannot find module '../src/spans.ts'`

- [ ] **Step 3: Write the implementation**

`engine/src/spans.ts`:
```ts
import { addDays, daysBetween, quarterOfMonth, roundHalfAwayFromZero } from './dates.ts';
import type { IsoDate, Month, ProgressRow, Quarter } from './types.ts';

export interface SpanTable {
  totalDays: number;
  days: [number, number, number, number];
  values: [number, number, number, number];
  perDay: [number, number, number, number];
  endDates: [IsoDate, IsoDate, IsoDate, IsoDate];
}

/**
 * Spec 3.1. The period is cut at 1/4, 1/2, 3/4 and full; the work value follows
 * the standard S-curve, cumulative 1/8, 3/8, 3/4, 1 — so each span carries
 * 1/8, 1/4, 3/8, 1/4 of the total.
 */
export function computeSpans(
  commencement: IsoDate,
  actualCompletion: IsoDate,
  workDoneAmount: number,
): SpanTable {
  const P = daysBetween(commencement, actualCompletion);
  const b = [
    roundHalfAwayFromZero(P / 4),
    roundHalfAwayFromZero(P / 2),
    roundHalfAwayFromZero((P * 3) / 4),
    P,
  ] as const;
  const days: [number, number, number, number] =
    [b[0], b[1] - b[0], b[2] - b[1], b[3] - b[2]];

  const W = workDoneAmount;
  const cumulative = [W / 8, (W * 3) / 8, (W * 3) / 4, W] as const;
  const values: [number, number, number, number] = [
    cumulative[0],
    cumulative[1] - cumulative[0],
    cumulative[2] - cumulative[1],
    cumulative[3] - cumulative[2],
  ];

  const perDay: [number, number, number, number] = [
    days[0] === 0 ? 0 : values[0] / days[0],
    days[1] === 0 ? 0 : values[1] / days[1],
    days[2] === 0 ? 0 : values[2] / days[2],
    days[3] === 0 ? 0 : values[3] / days[3],
  ];

  let cursor = commencement;
  const endDates = days.map((d) => (cursor = addDays(cursor, d))) as
    [IsoDate, IsoDate, IsoDate, IsoDate];

  return { totalDays: P, days, values, perDay, endDates };
}

/** Exact, unrounded amount earned in each month across all four spans. */
export function monthlyExact(progress: ProgressRow[], spans: SpanTable): Map<Month, number> {
  const out = new Map<Month, number>();
  for (const row of progress) {
    let amount = 0;
    for (let i = 0; i < 4; i++) amount += (row.spanDays[i] ?? 0) * (spans.perDay[i] ?? 0);
    out.set(row.month, (out.get(row.month) ?? 0) + amount);
  }
  return out;
}

/**
 * Largest-remainder allocation. Rounding each month independently loses money:
 * the source contract's six months round to one rupee under the work done amount.
 * Floor everything, then hand the shortfall to the largest discarded fractions.
 */
export function allocateRupees(exact: Map<Month, number>, total: number): Map<Month, number> {
  const entries = [...exact.entries()];
  const floors = entries.map(([m, v]) => ({ month: m, floor: Math.floor(v), frac: v - Math.floor(v) }));
  const allocated = floors.reduce((a, f) => a + f.floor, 0);
  let shortfall = Math.round(total - allocated);

  const byFraction = [...floors].sort((a, b) => b.frac - a.frac || a.month.localeCompare(b.month));
  const bump = new Map<Month, number>();
  for (const f of byFraction) {
    if (shortfall <= 0) break;
    bump.set(f.month, 1);
    shortfall--;
  }

  return new Map(floors.map((f) => [f.month, f.floor + (bump.get(f.month) ?? 0)]));
}

export interface ScheduleRow {
  month: Month;
  computed: number;
  adjustment: number;
  payment: number;
}

export interface PaymentSchedule {
  rows: ScheduleRow[];
  total: number;
  byQuarter: Map<Quarter, number>;
}

/**
 * Spec 3.5. Lists every month with a non-zero computed amount, plus any month
 * carrying an operator adjustment.
 */
export function buildSchedule(
  progress: ProgressRow[],
  spans: SpanTable,
  workDoneAmount: number,
  adjustments: Map<Month, number>,
): PaymentSchedule {
  const exact = monthlyExact(progress, spans);
  for (const [m, v] of exact) if (v === 0) exact.delete(m);
  const allocated = allocateRupees(exact, workDoneAmount);

  const months = new Set<Month>([...allocated.keys(), ...adjustments.keys()]);
  const rows: ScheduleRow[] = [...months].sort().map((month) => {
    const computed = allocated.get(month) ?? 0;
    const adjustment = adjustments.get(month) ?? 0;
    return { month, computed, adjustment, payment: computed + adjustment };
  });

  const byQuarter = new Map<Quarter, number>();
  for (const r of rows) {
    const q = quarterOfMonth(r.month);
    byQuarter.set(q, (byQuarter.get(q) ?? 0) + r.payment);
  }

  return { rows, total: rows.reduce((a, r) => a + r.payment, 0), byQuarter };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @pes/engine`
Expected: PASS — all 9 span tests plus the 6 from Task 1

- [ ] **Step 5: Commit**

```bash
git add engine/
git commit -m "feat(engine): add span distribution and largest-remainder payment schedule"
```

---

### Task 3: Rate lookup and base-index resolution

**Files:**
- Create: `engine/src/indices.ts`
- Test: `engine/test/indices.test.ts`

**Interfaces:**
- Consumes: from Task 1 — `monthOfDate`, `addDays`, `quarterOfMonth`, `monthsOfQuarter`, types `RateRow`, `ComponentConfig`, `ComponentKey`, `Month`, `Quarter`; from Task 2 — `PaymentSchedule`
- Produces:
  - `type RateField = 'labour'|'material'|'cement'|'steel'|'pol'|'bitumenG'`
  - `rateFieldFor(key: ComponentKey): RateField`
  - `buildRateIndex(rows: RateRow[]): Map<Month, RateRow>`
  - `interface MeanResult { value: number | null; missing: Month[] }`
  - `quarterMean(rates: Map<Month, RateRow>, q: Quarter, key: ComponentKey): MeanResult`
  - `monthValue(rates: Map<Month, RateRow>, m: Month, key: ComponentKey): number | null`
  - `baseQuarterOf(bidDate: IsoDate): Quarter`
  - `interface ResolvedBase { key: ComponentKey; rule: BaseRule; sourceMonths: Month[]; value: number | null; overridden: boolean }`
  - `resolveBaseRates(rates, contract, components): { bases: Map<ComponentKey, ResolvedBase>; missing: Month[] }`
  - `quartersUnderConsideration(schedule: PaymentSchedule): Quarter[]`

- [ ] **Step 1: Write the failing test**

`engine/test/indices.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRateIndex, quarterMean, monthValue, baseQuarterOf,
  resolveBaseRates, quartersUnderConsideration, rateFieldFor,
} from '../src/indices.ts';
import { computeSpans, buildSchedule } from '../src/spans.ts';
import { RATES_2023_24, CONTRACT_168, COMPONENTS_168, PROGRESS_168 } from './fixtures/agreement168.ts';

const rates = buildRateIndex(RATES_2023_24);

test('rateFieldFor maps the bitumen component to the G series', () => {
  assert.equal(rateFieldFor('bitumen'), 'bitumenG');
  assert.equal(rateFieldFor('labour'), 'labour');
});

test('quarterMean averages the three months of a quarter', () => {
  assert.equal(quarterMean(rates, '2023-Q3', 'labour').value, 126.2);
  const steel = quarterMean(rates, '2023-Q3', 'steel').value!;
  assert.ok(Math.abs(steel - 92.76666666666667) < 1e-9);
});

test('quarterMean reports missing months instead of guessing', () => {
  const sparse = buildRateIndex(RATES_2023_24.filter((r) => r.month !== '2023-08'));
  const result = quarterMean(sparse, '2023-Q3', 'labour');
  assert.equal(result.value, null);
  assert.deepEqual(result.missing, ['2023-08']);
});

test('monthValue reads a single month', () => {
  assert.equal(monthValue(rates, '2023-09', 'pol'), 90.8);
  assert.equal(monthValue(rates, '2023-08', 'bitumen'), 38882);
  assert.equal(monthValue(rates, '2019-01', 'pol'), null);
});

test('baseQuarterOf is the calendar quarter containing the bid date', () => {
  assert.equal(baseQuarterOf('2023-09-12'), '2023-Q3');
  assert.equal(baseQuarterOf('2024-01-05'), '2024-Q1');
});

test('resolveBaseRates applies a different rule per component', () => {
  const { bases, missing } = resolveBaseRates(rates, CONTRACT_168, COMPONENTS_168);
  assert.deepEqual(missing, []);
  // Averaging three floats leaves artefacts (99.39999999999999), exactly as the
  // source workbook does, so these compare with a tolerance rather than strictly.
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  near(bases.get('labour')!.value!, 126.2);
  near(bases.get('material')!.value!, 99.4);
  near(bases.get('cement')!.value!, 98.6);
  near(bases.get('steel')!.value!, 92.76666666666667);
  // POL's base is the bid month alone, not the quarter average of 89.9.
  assert.equal(bases.get('pol')!.value, 90.8);
  assert.deepEqual(bases.get('pol')!.sourceMonths, ['2023-09']);
  // Bitumen's base is the month of (bid date - 28 days) = Aug 2023.
  assert.equal(bases.get('bitumen')!.value, 38882);
  assert.deepEqual(bases.get('bitumen')!.sourceMonths, ['2023-08']);
});

test('resolveBaseRates honours an operator override', () => {
  const overridden = COMPONENTS_168.map((c) =>
    c.key === 'pol' ? { ...c, baseOverride: 91.5 } : c);
  const { bases } = resolveBaseRates(rates, CONTRACT_168, overridden);
  assert.equal(bases.get('pol')!.value, 91.5);
  assert.equal(bases.get('pol')!.overridden, true);
  assert.equal(bases.get('labour')!.overridden, false);
});

test('quartersUnderConsideration comes from the months that carry payments', () => {
  const spans = computeSpans(CONTRACT_168.commencement, CONTRACT_168.actualCompletion, CONTRACT_168.workDoneAmount);
  const sched = buildSchedule(PROGRESS_168, spans, CONTRACT_168.workDoneAmount, new Map());
  assert.deepEqual(quartersUnderConsideration(sched), ['2023-Q3', '2023-Q4', '2024-Q1']);
});
```

- [ ] **Step 2: Create the shared fixture**

`engine/test/fixtures/agreement168.ts` — the real contract, reused by Tasks 3, 4 and 5:
```ts
import type { ComponentConfig, ContractInput, ProgressRow, RateRow } from '../../src/types.ts';

const r = (
  month: string, labour: number, material: number, cement: number,
  steel: number, pol: number, bitumenG: number | null,
): RateRow => ({ month, labour, material, cement, steel, pol, bitumenG, bitumenH: null });

/** Rows from 'Rates Chart ok' covering the base quarter and every quarter under consideration. */
export const RATES_2023_24: RateRow[] = [
  r('2023-07', 130.0, 99.1, 98.1, 91.5, 89.1, 38472),
  r('2023-08', 125.2, 99.5, 98.3, 92.2, 89.8, 38882),
  r('2023-09', 123.4, 99.6, 99.4, 94.6, 90.8, 42072),
  r('2023-10', 124.2, 100.1, 102.4, 92.1, 91.4, 42542),
  r('2023-11', 124.4, 100.1, 102.3, 89.5, 90.9, 42202),
  r('2023-12', 124.2, 99.4, 100.0, 88.2, 89.8, 40582),
  r('2024-01', 125.3, 99.3, 98.1, 87.5, 89.6, 37452),
  r('2024-02', 125.5, 99.3, 97.6, 86.3, 89.9, 37292),
  r('2024-03', 125.3, 99.4, 96.1, 86.3, 89.3, 38312),
];

export const CONTRACT_168: ContractInput = {
  agreementNo: '168 of 2023-24',
  contractor: 'M/s. Pradeep Kumar Contractor',
  workName: 'Const. of various Roads under Pkg No RJ-20-06/ML/2023-24 Distt Jhunjhunu',
  woNoDate: 'No. 1504-12 Date 14.09.2024',
  woAmount: 23_977_779,
  workDoneAmount: 21_717_359,
  bidDate: '2023-09-12',
  commencement: '2023-09-24',
  stipulatedCompletion: '2024-02-23',
  actualCompletion: '2024-02-23',
  bitumenOffsetDays: 28,
  alreadyPaid: 0,
};

export const COMPONENTS_168: ComponentConfig[] = [
  { key: 'labour',   percent: 9.28,  factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
  { key: 'material', percent: 53.12, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
  { key: 'cement',   percent: 0,     factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
  { key: 'steel',    percent: 0.65,  factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
  { key: 'pol',      percent: 8.11,  factor: 0.75, baseRule: 'bid_month',       baseOverride: null },
  { key: 'bitumen',  percent: 28.84, factor: 0.85, baseRule: 'offset_month',    baseOverride: null },
];

export const PROGRESS_168: ProgressRow[] = [
  { month: '2023-09', spanDays: [6, 0, 0, 0] },
  { month: '2023-10', spanDays: [31, 0, 0, 0] },
  { month: '2023-11', spanDays: [1, 29, 0, 0] },
  { month: '2023-12', spanDays: [0, 9, 22, 0] },
  { month: '2024-01', spanDays: [0, 0, 16, 15] },
  { month: '2024-02', spanDays: [0, 0, 0, 23] },
];

export const ADJUSTMENTS_168 = new Map<string, number>([
  ['2023-10', 500_000], ['2023-11', 800_000], ['2023-12', 400_000],
  ['2024-01', -900_000], ['2024-02', -800_000],
]);
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @pes/engine`
Expected: FAIL — `Cannot find module '../src/indices.ts'`

- [ ] **Step 4: Write the implementation**

`engine/src/indices.ts`:
```ts
import { addDays, monthOfDate, monthsOfQuarter, quarterOfMonth } from './dates.ts';
import type { PaymentSchedule } from './spans.ts';
import type {
  BaseRule, ComponentConfig, ComponentKey, ContractInput,
  IsoDate, Month, Quarter, RateRow,
} from './types.ts';

export type RateField = 'labour' | 'material' | 'cement' | 'steel' | 'pol' | 'bitumenG';

/** Bitumen reads the G series; column H is recorded but never used. */
export function rateFieldFor(key: ComponentKey): RateField {
  return key === 'bitumen' ? 'bitumenG' : key;
}

export function buildRateIndex(rows: RateRow[]): Map<Month, RateRow> {
  return new Map(rows.map((r) => [r.month, r]));
}

export interface MeanResult {
  value: number | null;
  missing: Month[];
}

export function quarterMean(
  rates: Map<Month, RateRow>, q: Quarter, key: ComponentKey,
): MeanResult {
  const field = rateFieldFor(key);
  const months = monthsOfQuarter(q);
  const missing: Month[] = [];
  let sum = 0;
  for (const m of months) {
    const v = rates.get(m)?.[field];
    if (v === undefined || v === null) missing.push(m);
    else sum += v;
  }
  return missing.length > 0 ? { value: null, missing } : { value: sum / 3, missing: [] };
}

export function monthValue(
  rates: Map<Month, RateRow>, m: Month, key: ComponentKey,
): number | null {
  return rates.get(m)?.[rateFieldFor(key)] ?? null;
}

/** Spec 3.2 — the calendar quarter containing the bid submission date. */
export function baseQuarterOf(bidDate: IsoDate): Quarter {
  return quarterOfMonth(monthOfDate(bidDate));
}

export interface ResolvedBase {
  key: ComponentKey;
  rule: BaseRule;
  sourceMonths: Month[];
  value: number | null;
  overridden: boolean;
}

/**
 * Spec 3.2. Each component's base index follows its own rule:
 *   quarter_average — mean of the base quarter's three months
 *   bid_month       — the month containing the bid date (POL)
 *   offset_month    — the month containing (bid date - offset days) (Bitumen)
 * An operator override, when present, wins over the rule.
 */
export function resolveBaseRates(
  rates: Map<Month, RateRow>,
  contract: ContractInput,
  components: ComponentConfig[],
): { bases: Map<ComponentKey, ResolvedBase>; missing: Month[] } {
  const baseQuarter = baseQuarterOf(contract.bidDate);
  const bidMonth = monthOfDate(contract.bidDate);
  const offsetMonth = monthOfDate(addDays(contract.bidDate, -contract.bitumenOffsetDays));

  const bases = new Map<ComponentKey, ResolvedBase>();
  const missing = new Set<Month>();

  for (const c of components) {
    if (c.baseOverride !== null) {
      bases.set(c.key, {
        key: c.key, rule: c.baseRule, sourceMonths: [],
        value: c.baseOverride, overridden: true,
      });
      continue;
    }

    let value: number | null;
    let sourceMonths: Month[];
    if (c.baseRule === 'quarter_average') {
      const mean = quarterMean(rates, baseQuarter, c.key);
      value = mean.value;
      sourceMonths = monthsOfQuarter(baseQuarter);
      for (const m of mean.missing) missing.add(m);
    } else {
      const m = c.baseRule === 'bid_month' ? bidMonth : offsetMonth;
      value = monthValue(rates, m, c.key);
      sourceMonths = [m];
      if (value === null) missing.add(m);
    }

    bases.set(c.key, { key: c.key, rule: c.baseRule, sourceMonths, value, overridden: false });
  }

  return { bases, missing: [...missing].sort() };
}

/** Spec 3.3 — every calendar quarter that carries a payment, in order. */
export function quartersUnderConsideration(schedule: PaymentSchedule): Quarter[] {
  return [...schedule.byQuarter.keys()].sort();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @pes/engine`
Expected: PASS — 8 index tests plus everything earlier

- [ ] **Step 6: Commit**

```bash
git add engine/
git commit -m "feat(engine): add rate lookup, quarter means and base-index resolution"
```

---

### Task 4: The Clause-45 escalation formula

**Files:**
- Create: `engine/src/escalation.ts`, `engine/src/index.ts`
- Test: `engine/test/escalation.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 — `computeSpans`, `buildSchedule`, `SpanTable`, `PaymentSchedule`, `buildRateIndex`, `quarterMean`, `monthValue`, `resolveBaseRates`, `baseQuarterOf`, `quartersUnderConsideration`, `roundHalfAwayFromZero`
- Produces:
  - `interface EscalationLine { component: ComponentKey; period: Quarter | Month; periodKind: 'quarter'|'month'; factor: number; percent: number; value: number; currentIndex: number|null; baseIndex: number|null; amount: number }`
  - `interface Problem { code: 'missing_rates'|'percent_total'|'zero_base'|'invalid_period'|'schedule_drift'; message: string; months?: Month[] }`
  - `interface CalculationInput { contract: ContractInput; components: ComponentConfig[]; rates: RateRow[]; progress: ProgressRow[]; adjustments: Map<Month, number> }`
  - `interface CalculationResult { spans: SpanTable; schedule: PaymentSchedule; baseQuarter: Quarter; bases: Map<ComponentKey, ResolvedBase>; quarters: Quarter[]; lines: EscalationLine[]; componentTotals: Map<ComponentKey, number>; grandTotal: number; alreadyPaid: number; payable: number; problems: Problem[] }`
  - `calculate(input: CalculationInput): CalculationResult`

- [ ] **Step 1: Write the failing test**

`engine/test/escalation.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/escalation.ts';
import {
  RATES_2023_24, CONTRACT_168, COMPONENTS_168, PROGRESS_168, ADJUSTMENTS_168,
} from './fixtures/agreement168.ts';

const input = {
  contract: CONTRACT_168, components: COMPONENTS_168,
  rates: RATES_2023_24, progress: PROGRESS_168, adjustments: ADJUSTMENTS_168,
};

test('the five index components are billed quarterly, bitumen monthly', () => {
  const result = calculate(input);
  const labour = result.lines.filter((l) => l.component === 'labour');
  assert.equal(labour.length, 3);
  assert.equal(labour[0]!.periodKind, 'quarter');
  const bitumen = result.lines.filter((l) => l.component === 'bitumen');
  assert.equal(bitumen.length, 6);
  assert.equal(bitumen[0]!.periodKind, 'month');
});

test('the first quarter under consideration is the base quarter, so it nets to zero', () => {
  const result = calculate(input);
  const q1 = result.lines.find((l) => l.component === 'labour' && l.period === '2023-Q3')!;
  assert.equal(q1.currentIndex, q1.baseIndex);
  assert.equal(q1.amount, 0);
});

test('a zero-percent component contributes nothing', () => {
  const result = calculate(input);
  assert.equal(result.componentTotals.get('cement'), 0);
});

test('POL uses a single-month base against quarter-average current values', () => {
  const result = calculate(input);
  const q1 = result.lines.find((l) => l.component === 'pol' && l.period === '2023-Q3')!;
  assert.equal(q1.baseIndex, 90.8);                         // Sep 2023 alone
  assert.ok(Math.abs(q1.currentIndex! - 89.9) < 1e-9);       // Jul-Sep mean
});

test('component totals match the source workbook to the paisa', () => {
  const t = calculate(input).componentTotals;
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.005, `${a} != ${b}`);
  near(t.get('labour')!, -18356.29);
  near(t.get('material')!, 24516.94);
  near(t.get('cement')!, 0);
  near(t.get('steel')!, -4386.11);
  near(t.get('pol')!, -6959.29);
  near(t.get('bitumen')!, 177788.75);
});

test('payable is the rounded grand total less what has already been paid', () => {
  assert.equal(calculate(input).payable, 172604);
  const withPaid = calculate({ ...input, contract: { ...CONTRACT_168, alreadyPaid: 100000 } });
  assert.equal(withPaid.payable, 72604);
});

test('missing rate months are reported by name rather than throwing', () => {
  const result = calculate({ ...input, rates: RATES_2023_24.filter((r) => r.month !== '2024-03') });
  const problem = result.problems.find((p) => p.code === 'missing_rates');
  assert.ok(problem, 'expected a missing_rates problem');
  assert.deepEqual(problem!.months, ['2024-03']);
});

test('percentages not totalling 100 are flagged but do not stop the calculation', () => {
  const bad = COMPONENTS_168.map((c) => (c.key === 'labour' ? { ...c, percent: 10 } : c));
  const result = calculate({ ...input, components: bad });
  assert.ok(result.problems.some((p) => p.code === 'percent_total'));
  assert.ok(Number.isFinite(result.payable));
});

test('a zero base index is reported instead of producing Infinity', () => {
  const bad = COMPONENTS_168.map((c) => (c.key === 'labour' ? { ...c, baseOverride: 0 } : c));
  const result = calculate({ ...input, components: bad });
  assert.ok(result.problems.some((p) => p.code === 'zero_base'));
  assert.equal(result.componentTotals.get('labour'), 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @pes/engine`
Expected: FAIL — `Cannot find module '../src/escalation.ts'`

- [ ] **Step 3: Write the implementation**

`engine/src/escalation.ts`:
```ts
import { roundHalfAwayFromZero } from './dates.ts';
import {
  baseQuarterOf, buildRateIndex, monthValue, quarterMean,
  quartersUnderConsideration, resolveBaseRates, type ResolvedBase,
} from './indices.ts';
import { buildSchedule, computeSpans, type PaymentSchedule, type SpanTable } from './spans.ts';
import type {
  ComponentConfig, ComponentKey, ContractInput, Month,
  ProgressRow, Quarter, RateRow,
} from './types.ts';

export interface EscalationLine {
  component: ComponentKey;
  period: Quarter | Month;
  periodKind: 'quarter' | 'month';
  factor: number;
  percent: number;
  value: number;
  currentIndex: number | null;
  baseIndex: number | null;
  amount: number;
}

export interface Problem {
  code: 'missing_rates' | 'percent_total' | 'zero_base' | 'invalid_period' | 'schedule_drift';
  message: string;
  months?: Month[];
}

export interface CalculationInput {
  contract: ContractInput;
  components: ComponentConfig[];
  rates: RateRow[];
  progress: ProgressRow[];
  adjustments: Map<Month, number>;
}

export interface CalculationResult {
  spans: SpanTable;
  schedule: PaymentSchedule;
  baseQuarter: Quarter;
  bases: Map<ComponentKey, ResolvedBase>;
  quarters: Quarter[];
  lines: EscalationLine[];
  componentTotals: Map<ComponentKey, number>;
  grandTotal: number;
  alreadyPaid: number;
  payable: number;
  problems: Problem[];
}

/** Spec 3.4: factor x percent/100 x value x (current - base) / base */
function lineAmount(
  factor: number, percent: number, value: number,
  current: number | null, base: number | null,
): number {
  if (current === null || base === null || base === 0) return 0;
  return (factor * (percent / 100) * value * (current - base)) / base;
}

export function calculate(input: CalculationInput): CalculationResult {
  const { contract, components, progress, adjustments } = input;
  const problems: Problem[] = [];
  const rates = buildRateIndex(input.rates);

  if (contract.actualCompletion < contract.commencement) {
    problems.push({
      code: 'invalid_period',
      message: 'Actual completion is earlier than the date of commencement.',
    });
  }

  const percentTotal = components.reduce((a, c) => a + c.percent, 0);
  if (Math.abs(percentTotal - 100) > 1e-9) {
    problems.push({
      code: 'percent_total',
      message: `Component percentages total ${percentTotal}, not 100.`,
    });
  }

  const spans = computeSpans(contract.commencement, contract.actualCompletion, contract.workDoneAmount);
  const schedule = buildSchedule(progress, spans, contract.workDoneAmount, adjustments);
  if (schedule.total !== contract.workDoneAmount) {
    problems.push({
      code: 'schedule_drift',
      message: `Schedule totals ${schedule.total}, but the work done amount is ${contract.workDoneAmount}.`,
    });
  }

  const baseQuarter = baseQuarterOf(contract.bidDate);
  const { bases, missing } = resolveBaseRates(rates, contract, components);
  const missingMonths = new Set<Month>(missing);

  const quarters = quartersUnderConsideration(schedule);
  const lines: EscalationLine[] = [];
  const componentTotals = new Map<ComponentKey, number>();

  for (const c of components) {
    const base = bases.get(c.key)!;
    if (base.value === 0) {
      problems.push({
        code: 'zero_base',
        message: `The base index for ${c.key} is zero, so its escalation cannot be computed.`,
      });
    }

    let total = 0;
    if (c.key === 'bitumen') {
      for (const row of schedule.rows) {
        const current = monthValue(rates, row.month, c.key);
        if (current === null) missingMonths.add(row.month);
        const amount = lineAmount(c.factor, c.percent, row.payment, current, base.value);
        total += amount;
        lines.push({
          component: c.key, period: row.month, periodKind: 'month',
          factor: c.factor, percent: c.percent, value: row.payment,
          currentIndex: current, baseIndex: base.value, amount,
        });
      }
    } else {
      for (const q of quarters) {
        const mean = quarterMean(rates, q, c.key);
        for (const m of mean.missing) missingMonths.add(m);
        const value = schedule.byQuarter.get(q) ?? 0;
        const amount = lineAmount(c.factor, c.percent, value, mean.value, base.value);
        total += amount;
        lines.push({
          component: c.key, period: q, periodKind: 'quarter',
          factor: c.factor, percent: c.percent, value,
          currentIndex: mean.value, baseIndex: base.value, amount,
        });
      }
    }
    componentTotals.set(c.key, total);
  }

  if (missingMonths.size > 0) {
    const months = [...missingMonths].sort();
    problems.push({
      code: 'missing_rates',
      message: `The rates chart is missing ${months.length} month(s) needed by this calculation: ${months.join(', ')}.`,
      months,
    });
  }

  const grandTotal = [...componentTotals.values()].reduce((a, b) => a + b, 0);
  return {
    spans, schedule, baseQuarter, bases, quarters, lines, componentTotals,
    grandTotal,
    alreadyPaid: contract.alreadyPaid,
    payable: roundHalfAwayFromZero(grandTotal - contract.alreadyPaid),
    problems,
  };
}
```

`engine/src/index.ts`:
```ts
export * from './types.ts';
export * from './dates.ts';
export * from './spans.ts';
export * from './indices.ts';
export * from './escalation.ts';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @pes/engine`
Expected: PASS — 9 escalation tests plus everything earlier

- [ ] **Step 5: Verify the engine compiles and has no runtime dependencies**

Run: `npm run build -w @pes/engine && node -e "import('@pes/engine').then(m => console.log(Object.keys(m).length + ' exports'))"`
Expected: compiles clean; prints an export count. Confirm `engine/package.json` still has no `dependencies` key.

- [ ] **Step 6: Commit**

```bash
git add engine/
git commit -m "feat(engine): add Clause-45 escalation formula and calculation entry point"
```

---

### Task 5: Golden test against the source workbook

**Files:**
- Test: `engine/test/golden.test.ts`

**Interfaces:**
- Consumes: Task 4 — `calculate`, `CalculationResult`; Task 3 — the Agreement 168 fixture
- Produces: no new source; a regression gate on the Global Constraints golden values

- [ ] **Step 1: Write the golden test**

`engine/test/golden.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/index.ts';
import {
  RATES_2023_24, CONTRACT_168, COMPONENTS_168, PROGRESS_168, ADJUSTMENTS_168,
} from './fixtures/agreement168.ts';

/**
 * Reproduces 'Pradeep Kumar 168.xlsx' end to end. Every value below was read
 * from the workbook itself; none may change without a deliberate spec change.
 */
const result = calculate({
  contract: CONTRACT_168, components: COMPONENTS_168,
  rates: RATES_2023_24, progress: PROGRESS_168, adjustments: ADJUSTMENTS_168,
});

const near = (a: number, b: number, tol = 0.005) =>
  assert.ok(Math.abs(a - b) < tol, `expected ${b}, got ${a}`);

test('golden: no problems are reported for a complete contract', () => {
  assert.deepEqual(result.problems, []);
});

test('golden: spanwise time and value distribution', () => {
  assert.equal(result.spans.totalDays, 152);
  assert.deepEqual(result.spans.days, [38, 38, 38, 38]);
  near(result.spans.values[0]!, 2_714_669.875, 1e-6);
  near(result.spans.values[1]!, 5_429_339.75, 1e-6);
  near(result.spans.values[2]!, 8_144_009.625, 1e-6);
  near(result.spans.values[3]!, 5_429_339.75, 1e-6);
  assert.deepEqual(result.spans.endDates,
    ['2023-11-01', '2023-12-09', '2024-01-16', '2024-02-23']);
});

test('golden: schedule of payment totals the work done amount', () => {
  assert.equal(result.schedule.total, 21_717_359);
  assert.equal(result.schedule.byQuarter.get('2023-Q3'), 428_632);
  assert.equal(result.schedule.byQuarter.get('2023-Q4'), 14_130_330);
  assert.equal(result.schedule.byQuarter.get('2024-Q1'), 7_158_397);
});

test('golden: base quarter and base indices', () => {
  assert.equal(result.baseQuarter, '2023-Q3');
  near(result.bases.get('labour')!.value!, 126.2, 1e-9);
  near(result.bases.get('material')!.value!, 99.4, 1e-9);
  near(result.bases.get('cement')!.value!, 98.6, 1e-9);
  near(result.bases.get('steel')!.value!, 92.766667, 1e-6);
  near(result.bases.get('pol')!.value!, 90.8, 1e-9);
  near(result.bases.get('bitumen')!.value!, 38882, 1e-9);
});

test('golden: quarters under consideration', () => {
  assert.deepEqual(result.quarters, ['2023-Q3', '2023-Q4', '2024-Q1']);
});

test('golden: component totals', () => {
  near(result.componentTotals.get('labour')!, -18356.29);
  near(result.componentTotals.get('material')!, 24516.94);
  near(result.componentTotals.get('cement')!, 0);
  near(result.componentTotals.get('steel')!, -4386.11);
  near(result.componentTotals.get('pol')!, -6959.29);
  near(result.componentTotals.get('bitumen')!, 177788.75);
});

test('golden: the payable amount is Rs. 1,72,604', () => {
  near(result.grandTotal, 172604.0, 0.01);
  assert.equal(result.payable, 172604);
});
```

- [ ] **Step 2: Run the golden test**

Run: `npm test -w @pes/engine`
Expected: PASS — 7 golden tests. If any fail, the engine is wrong; do not adjust the expected values.

- [ ] **Step 3: Commit**

```bash
git add engine/test/golden.test.ts
git commit -m "test(engine): add golden regression test reproducing Agreement 168 of 2023-24"
```

---
### Task 6: Server scaffold, schema and migration runner

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `.env.example`
- Create: `server/src/db.ts`, `server/src/migrate.ts`, `server/src/app.ts`, `server/src/index.ts`
- Create: `server/migrations/001_init.sql`
- Test: `server/test/migrate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `pool: Pool` and `withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T>` from `db.ts`
  - `runMigrations(pool: Pool): Promise<string[]>` — returns the names applied this run
  - `createApp(): express.Express` from `app.ts` — an app with no port bound, so tests can drive it
- Note for the implementer: every later server task adds routes by mounting them inside `createApp()`.

- [ ] **Step 1: Create the server workspace**

`server/package.json`:
```json
{
  "name": "@pes/server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "node --watch src/index.ts",
    "test": "node --test 'test/**/*.test.ts'",
    "seed": "node seed/seed.ts"
  },
  "dependencies": {
    "@pes/engine": "*",
    "argon2": "^0.41.1",
    "connect-pg-simple": "^10.0.0",
    "express": "^5.0.1",
    "express-rate-limit": "^7.4.0",
    "express-session": "^1.18.1",
    "helmet": "^8.0.0",
    "pg": "^8.13.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/express-session": "^1.18.0",
    "@types/node": "^24.0.0",
    "@types/pg": "^8.11.0",
    "typescript": "^5.7.0"
  }
}
```

`server/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src"]
}
```

`.env.example` at the repo root:
```
# Neon pooled connection string
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
# openssl rand -hex 32
SESSION_SECRET=replace-me
PORT=3000
NODE_ENV=development
```

Run `npm install` at the root.

- [ ] **Step 2: Write the schema**

`server/migrations/001_init.sql`:
```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shared master data: one row per month, used by every contract.
CREATE TABLE rates (
  month      DATE PRIMARY KEY,
  labour     NUMERIC(12, 3),
  material   NUMERIC(12, 3),
  cement     NUMERIC(12, 3),
  steel      NUMERIC(12, 3),
  pol        NUMERIC(12, 3),
  bitumen_g  NUMERIC(14, 2),
  bitumen_h  NUMERIC(14, 2),
  source     TEXT
);

CREATE TABLE contracts (
  id                     SERIAL PRIMARY KEY,
  agreement_no           TEXT NOT NULL,
  contractor             TEXT NOT NULL DEFAULT '',
  work_name              TEXT NOT NULL DEFAULT '',
  wo_no_date             TEXT NOT NULL DEFAULT '',
  wo_amount              NUMERIC(16, 2) NOT NULL DEFAULT 0,
  work_done_amount       NUMERIC(16, 2) NOT NULL DEFAULT 0,
  bid_date               DATE,
  commencement           DATE,
  stipulated_completion  DATE,
  actual_completion      DATE,
  bitumen_offset_days    INTEGER NOT NULL DEFAULT 28,
  already_paid           NUMERIC(16, 2) NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE components (
  contract_id   INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  key           TEXT NOT NULL CHECK (key IN ('labour','material','cement','steel','pol','bitumen')),
  percent       NUMERIC(8, 4) NOT NULL DEFAULT 0,
  factor        NUMERIC(5, 3) NOT NULL DEFAULT 0.75,
  base_rule     TEXT NOT NULL CHECK (base_rule IN ('quarter_average','bid_month','offset_month')),
  base_override NUMERIC(14, 4),
  PRIMARY KEY (contract_id, key)
);

CREATE TABLE progress (
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month       DATE NOT NULL,
  span1_days  INTEGER NOT NULL DEFAULT 0,
  span2_days  INTEGER NOT NULL DEFAULT 0,
  span3_days  INTEGER NOT NULL DEFAULT 0,
  span4_days  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (contract_id, month)
);

-- Only the operator's adjustment is stored; the computed part is always
-- recalculated from progress, so correcting a day count propagates.
CREATE TABLE payments (
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month       DATE NOT NULL,
  adjustment  NUMERIC(16, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (contract_id, month)
);

CREATE TABLE session (
  sid    TEXT PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_session_expire ON session (expire);
```

- [ ] **Step 3: Write the failing test**

`server/test/migrate.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

test('runMigrations creates the schema and is idempotent', async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  const first = await runMigrations(pool);
  assert.deepEqual(first, ['001_init.sql']);

  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const tables = rows.map((r: { table_name: string }) => r.table_name);
  for (const t of ['components', 'contracts', 'payments', 'progress', 'rates', 'schema_migrations', 'session', 'users']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }

  const second = await runMigrations(pool);
  assert.deepEqual(second, [], 'a second run should apply nothing');
});

test.after(async () => { await pool.end(); });
```

- [ ] **Step 4: Run the test to verify it fails**

Set `DATABASE_URL` to a Neon **dev branch** first — never production.
Run: `DATABASE_URL=$DEV_DATABASE_URL npm test -w @pes/server`
Expected: FAIL — `Cannot find module '../src/db.ts'`

- [ ] **Step 5: Write db, migrate, app and bootstrap**

`server/src/db.ts`:
```ts
import pg from 'pg';

const { Pool } = pg;

// NUMERIC arrives as a string by default so precision is not silently lost in
// transit. The engine wants numbers, so parse at this single boundary.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v: string) => Number(v));
// DATE must not become a local-midnight Date; keep the wire format.
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
});

export async function withTransaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

`server/src/migrate.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Applies any numbered .sql file not yet recorded. Returns what it applied. */
export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return ran;
}
```

`server/src/app.ts`:
```ts
import express from 'express';
import helmet from 'helmet';

export function createApp(): express.Express {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

  // Routes from later tasks mount here.

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
```

`server/src/index.ts`:
```ts
import { pool } from './db.ts';
import { runMigrations } from './migrate.ts';
import { createApp } from './app.ts';

const applied = await runMigrations(pool);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => console.log(`Listening on :${port}`));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `DATABASE_URL=$DEV_DATABASE_URL npm test -w @pes/server`
Expected: PASS — 1 test, the schema created then a no-op second run

- [ ] **Step 7: Commit**

```bash
git add server/ .env.example package-lock.json
git commit -m "feat(server): add database pool, migration runner and schema"
```

---

### Task 7: Authentication

**Files:**
- Create: `server/src/auth/password.ts`, `server/src/auth/middleware.ts`, `server/src/auth/routes.ts`
- Modify: `server/src/app.ts` — add session middleware and mount the auth router
- Test: `server/test/auth.test.ts`

**Interfaces:**
- Consumes: Task 6 — `pool`, `createApp`, `runMigrations`
- Produces:
  - `hashPassword(plain: string): Promise<string>`, `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `requireAuth`, `requireAdmin` — Express `RequestHandler`s
  - `authRouter: express.Router` mounted at `/api/auth`, plus `POST /api/users` for account creation
  - Session shape: `req.session.user = { id: number; email: string; role: 'admin' | 'user' }`

- [ ] **Step 1: Write the failing test**

`server/test/auth.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';
import { createApp } from '../src/app.ts';

const app = createApp();
let server: ReturnType<typeof app.listen>;
let base = '';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

test.after(async () => { server.close(); await pool.end(); });

/** Minimal cookie-jar fetch: keeps the connect.sid cookie between calls. */
function agent() {
  let cookie = '';
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers },
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0]!;
    return res;
  };
}

test('the first account created becomes an admin', async () => {
  const a = agent();
  const res = await a('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'correct horse battery' }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).role, 'admin');
});

test('a second account cannot be created anonymously', async () => {
  const res = await agent()('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'sneak@example.com', password: 'correct horse battery' }),
  });
  assert.equal(res.status, 401);
});

test('login establishes a session and logout ends it', async () => {
  const a = agent();
  const bad = await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'wrong' }),
  });
  assert.equal(bad.status, 401);

  const ok = await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'correct horse battery' }),
  });
  assert.equal(ok.status, 200);

  const me = await a('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, 'first@example.com');

  await a('/api/auth/logout', { method: 'POST' });
  assert.equal((await a('/api/auth/me')).status, 401);
});

test('an admin can create further accounts, which default to the user role', async () => {
  const a = agent();
  await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'correct horse battery' }),
  });
  const res = await a('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'clerk@example.com', password: 'another good phrase' }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).role, 'user');
});

test('a non-admin cannot create accounts', async () => {
  const a = agent();
  await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'clerk@example.com', password: 'another good phrase' }),
  });
  const res = await a('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'nope@example.com', password: 'yet another phrase' }),
  });
  assert.equal(res.status, 403);
});

test('the password hash is never returned', async () => {
  const a = agent();
  await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'correct horse battery' }),
  });
  const body = await (await a('/api/auth/me')).json();
  assert.equal('password_hash' in body, false);
  assert.equal('passwordHash' in body, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: FAIL — `Cannot find module '../src/auth/routes.ts'` (via `app.ts`)

- [ ] **Step 3: Write the password helper**

`server/src/auth/password.ts`:
```ts
import argon2 from 'argon2';

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Write the middleware**

`server/src/auth/middleware.ts`:
```ts
import type { RequestHandler } from 'express';

export interface SessionUser {
  id: number;
  email: string;
  role: 'admin' | 'user';
}

declare module 'express-session' {
  interface SessionData { user?: SessionUser }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.user) { res.status(401).json({ error: 'Not signed in' }); return; }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.session.user) { res.status(401).json({ error: 'Not signed in' }); return; }
  if (req.session.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required' }); return;
  }
  next();
};
```

- [ ] **Step 5: Write the auth routes**

`server/src/auth/routes.ts`:
```ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../db.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { requireAdmin, type SessionUser } from './middleware.ts';

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
});

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true });

export const authRouter: Router = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) { res.status(401).json({ error: 'Invalid email or password' }); return; }

  const { rows } = await pool.query<{ id: number; email: string; role: 'admin' | 'user'; password_hash: string }>(
    'SELECT id, email, role, password_hash FROM users WHERE email = $1', [parsed.data.email],
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(user.password_hash, parsed.data.password))) {
    res.status(401).json({ error: 'Invalid email or password' }); return;
  }

  // Rotate the session id on login so a pre-auth cookie cannot be replayed.
  req.session.regenerate((err) => {
    if (err) { res.status(500).json({ error: 'Could not start session' }); return; }
    req.session.user = { id: user.id, email: user.email, role: user.role };
    res.json(req.session.user);
  });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('connect.sid'); res.status(204).end(); });
});

authRouter.get('/me', (req, res) => {
  if (!req.session.user) { res.status(401).json({ error: 'Not signed in' }); return; }
  res.json(req.session.user);
});

export const usersRouter: Router = Router();

/**
 * No open sign-up: the very first account bootstraps an admin, and after that
 * only an admin may create accounts.
 */
usersRouter.post('/', async (req, res, next) => {
  const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text FROM users');
  const isFirst = rows[0]!.count === '0';
  if (isFirst) { void createUser(req, res, 'admin'); return; }
  requireAdmin(req, res, () => { void createUser(req, res, 'user'); });
});

async function createUser(
  req: Parameters<Parameters<Router['post']>[1]>[0],
  res: Parameters<Parameters<Router['post']>[1]>[1],
  role: 'admin' | 'user',
): Promise<void> {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email must be valid and the password at least 12 characters' });
    return;
  }
  const hash = await hashPassword(parsed.data.password);
  try {
    const { rows } = await pool.query<SessionUser>(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [parsed.data.email, hash, role],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That email address already has an account' });
      return;
    }
    throw err;
  }
}
```

- [ ] **Step 6: Wire sessions into the app**

Modify `server/src/app.ts` — add the imports and the session middleware before the routes:
```ts
import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { authRouter, usersRouter } from './auth/routes.ts';
import { pool } from './db.ts';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);  // Render terminates TLS in front of us
  app.use(helmet());
  app.use(express.json({ limit: '2mb' }));

  const PgStore = connectPgSimple(session);
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');

  app.use(session({
    store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
    },
  }));

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  // Routes from later tasks mount here.

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: PASS — 6 auth tests plus the migration test

- [ ] **Step 8: Commit**

```bash
git add server/
git commit -m "feat(server): add session authentication with admin-only account creation"
```

---

### Task 8: Rates chart API

**Files:**
- Create: `server/src/repo/rates.ts`, `server/src/routes/rates.ts`
- Modify: `server/src/app.ts` — mount the rates router
- Test: `server/test/rates.test.ts`

**Interfaces:**
- Consumes: Task 6 — `pool`; Task 7 — `requireAuth`; Task 1 — `RateRow` from `@pes/engine`
- Produces:
  - `listRates(): Promise<RateRow[]>` — ascending by month
  - `upsertRates(rows: RateRow[]): Promise<number>` — returns the count written
  - `parsePastedRates(text: string): { rows: RateRow[]; errors: string[] }`
  - `ratesRouter` mounted at `/api/rates`: `GET /`, `PUT /`, `POST /paste`

- [ ] **Step 1: Write the failing test**

`server/test/rates.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePastedRates } from '../src/routes/rates.ts';
import { listRates, upsertRates } from '../src/repo/rates.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
});
test.after(async () => { await pool.end(); });

test('upsertRates inserts, then updates the same month rather than duplicating', async () => {
  await upsertRates([
    { month: '2023-07', labour: 130, material: 99.1, cement: 98.1, steel: 91.5, pol: 89.1, bitumenG: 38472, bitumenH: null },
  ]);
  await upsertRates([
    { month: '2023-07', labour: 131, material: 99.1, cement: 98.1, steel: 91.5, pol: 89.1, bitumenG: 38472, bitumenH: null },
  ]);
  const rows = await listRates();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.labour, 131);
  assert.equal(rows[0]!.month, '2023-07');
});

test('listRates returns months in ascending order', async () => {
  await upsertRates([
    { month: '2023-09', labour: 123.4, material: null, cement: null, steel: null, pol: 90.8, bitumenG: 42072, bitumenH: null },
    { month: '2023-08', labour: 125.2, material: null, cement: null, steel: null, pol: 89.8, bitumenG: 38882, bitumenH: null },
  ]);
  const months = (await listRates()).map((r) => r.month);
  assert.deepEqual(months, ['2023-07', '2023-08', '2023-09']);
});

test('parsePastedRates reads a tab-separated block copied from Excel', () => {
  const text = [
    '2023-07\t130.0\t99.1\t98.1\t91.5\t89.1\t38472\t36972',
    '2023-08\t125.2\t99.5\t98.3\t92.2\t89.8\t38882\t40922',
  ].join('\n');
  const { rows, errors } = parsePastedRates(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.month, '2023-07');
  assert.equal(rows[0]!.labour, 130);
  assert.equal(rows[1]!.bitumenH, 40922);
});

test('parsePastedRates accepts blank cells as null and skips a header row', () => {
  const text = 'Month\tLabour\tMaterial\tCement\tSteel\tPOL\tBitumen\n2024-01\t125.3\t\t98.1\t87.5\t89.6\t37452';
  const { rows, errors } = parsePastedRates(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.material, null);
  assert.equal(rows[0]!.bitumenH, null);
});

test('parsePastedRates reports an unreadable month instead of silently dropping it', () => {
  const { rows, errors } = parsePastedRates('not-a-month\t130\n2023-07\t130');
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 1);
  assert.ok(errors[0]!.includes('not-a-month'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: FAIL — `Cannot find module '../src/repo/rates.ts'`

- [ ] **Step 3: Write the repository**

`server/src/repo/rates.ts`:
```ts
import type { RateRow } from '@pes/engine';
import { pool } from '../db.ts';

interface RateDbRow {
  month: string; labour: number | null; material: number | null; cement: number | null;
  steel: number | null; pol: number | null; bitumen_g: number | null; bitumen_h: number | null;
}

const toRateRow = (r: RateDbRow): RateRow => ({
  month: r.month.slice(0, 7),
  labour: r.labour, material: r.material, cement: r.cement,
  steel: r.steel, pol: r.pol, bitumenG: r.bitumen_g, bitumenH: r.bitumen_h,
});

export async function listRates(): Promise<RateRow[]> {
  const { rows } = await pool.query<RateDbRow>(
    'SELECT month::text, labour, material, cement, steel, pol, bitumen_g, bitumen_h FROM rates ORDER BY month',
  );
  return rows.map(toRateRow);
}

/** Upsert by month. Months are stored as the first day of the month. */
export async function upsertRates(rows: RateRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    const o = i * 8;
    values.push(`${r.month}-01`, r.labour, r.material, r.cement, r.steel, r.pol, r.bitumenG, r.bitumenH);
    return `($${o + 1}::date, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
  });
  const { rowCount } = await pool.query(
    `INSERT INTO rates (month, labour, material, cement, steel, pol, bitumen_g, bitumen_h)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (month) DO UPDATE SET
       labour = EXCLUDED.labour, material = EXCLUDED.material, cement = EXCLUDED.cement,
       steel = EXCLUDED.steel, pol = EXCLUDED.pol,
       bitumen_g = EXCLUDED.bitumen_g, bitumen_h = EXCLUDED.bitumen_h`,
    values,
  );
  return rowCount ?? 0;
}
```

- [ ] **Step 4: Write the routes and the paste parser**

`server/src/routes/rates.ts`:
```ts
import type { RateRow } from '@pes/engine';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.ts';
import { listRates, upsertRates } from '../repo/rates.ts';

const rateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
  labour: z.number().nullable(), material: z.number().nullable(),
  cement: z.number().nullable(), steel: z.number().nullable(),
  pol: z.number().nullable(), bitumenG: z.number().nullable(),
  bitumenH: z.number().nullable(),
});

const num = (cell: string | undefined): number | null => {
  const t = (cell ?? '').trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Reads a tab-separated block copied out of Excel. Columns, in order:
 * Month, Labour, Material, Cement, Steel, POL, Bitumen G, Bitumen H.
 * A leading header row is skipped; unreadable months are reported, not dropped.
 */
export function parsePastedRates(text: string): { rows: RateRow[]; errors: string[] } {
  const rows: RateRow[] = [];
  const errors: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const cells = line.split('\t');
    const rawMonth = (cells[0] ?? '').trim();
    if (/^month$/i.test(rawMonth)) continue;

    const match = /^(\d{4})-(\d{1,2})/.exec(rawMonth);
    if (!match) { errors.push(`Could not read a month from "${rawMonth}"`); continue; }
    const month = `${match[1]}-${match[2]!.padStart(2, '0')}`;

    rows.push({
      month,
      labour: num(cells[1]), material: num(cells[2]), cement: num(cells[3]),
      steel: num(cells[4]), pol: num(cells[5]),
      bitumenG: num(cells[6]), bitumenH: num(cells[7]),
    });
  }
  return { rows, errors };
}

export const ratesRouter: Router = Router();
ratesRouter.use(requireAuth);

ratesRouter.get('/', async (_req, res) => { res.json(await listRates()); });

ratesRouter.put('/', async (req, res) => {
  const parsed = z.array(rateSchema).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const written = await upsertRates(parsed.data);
  res.json({ written, rates: await listRates() });
});

ratesRouter.post('/paste', async (req, res) => {
  const parsed = z.object({ text: z.string().max(200_000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'A text block is required' }); return; }
  const { rows, errors } = parsePastedRates(parsed.data.text);
  const written = await upsertRates(rows);
  res.json({ written, errors, rates: await listRates() });
});
```

Mount it in `server/src/app.ts`, replacing the "Routes from later tasks mount here." comment:
```ts
import { ratesRouter } from './routes/rates.ts';
// ...
app.use('/api/rates', ratesRouter);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: PASS — 5 rates tests plus everything earlier

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat(server): add shared rates chart API with Excel paste support"
```

---

### Task 9: Contracts API

**Files:**
- Create: `server/src/repo/contracts.ts`, `server/src/routes/contracts.ts`
- Modify: `server/src/app.ts` — mount the contracts router
- Test: `server/test/contracts.test.ts`

**Interfaces:**
- Consumes: Task 6 — `pool`, `withTransaction`; Task 7 — `requireAuth`; Task 1 — `COMPONENT_KEYS`, `ComponentConfig`, `ContractInput`, `ProgressRow`
- Produces:
  - `interface ContractRecord extends ContractInput { id: number }`
  - `listContracts(): Promise<Array<{ id: number; agreementNo: string; contractor: string; workName: string }>>`
  - `createContract(agreementNo: string): Promise<ContractRecord>` — also inserts the six default components
  - `getContract(id: number): Promise<{ contract: ContractRecord; components: ComponentConfig[]; progress: ProgressRow[]; adjustments: Array<{ month: string; adjustment: number }> } | null>`
  - `updateContract`, `replaceComponents`, `replaceProgress`, `replaceAdjustments`, `deleteContract`
  - `contractsRouter` mounted at `/api/contracts`
- The six default components created with a new contract carry the spec's default rules: `pol` → `bid_month`, `bitumen` → `offset_month` with factor `0.85`, all others → `quarter_average` with factor `0.75`, every percent `0`.

- [ ] **Step 1: Write the failing test**

`server/test/contracts.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContract, getContract, listContracts, replaceComponents,
  replaceProgress, replaceAdjustments, updateContract, deleteContract,
} from '../src/repo/contracts.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
});
test.after(async () => { await pool.end(); });

test('a new contract arrives with six components carrying the default rules', async () => {
  const created = await createContract('168 of 2023-24');
  const loaded = await getContract(created.id);
  assert.ok(loaded);
  assert.equal(loaded.components.length, 6);
  assert.deepEqual(loaded.components.map((c) => c.key),
    ['labour', 'material', 'cement', 'steel', 'pol', 'bitumen']);
  assert.equal(loaded.components.find((c) => c.key === 'pol')!.baseRule, 'bid_month');
  assert.equal(loaded.components.find((c) => c.key === 'bitumen')!.baseRule, 'offset_month');
  assert.equal(loaded.components.find((c) => c.key === 'bitumen')!.factor, 0.85);
  assert.equal(loaded.components.find((c) => c.key === 'labour')!.factor, 0.75);
  assert.equal(loaded.contract.bitumenOffsetDays, 28);
});

test('dates round-trip as YYYY-MM-DD strings without timezone drift', async () => {
  const c = await createContract('drift check');
  await updateContract(c.id, {
    bidDate: '2023-09-12', commencement: '2023-09-24',
    stipulatedCompletion: '2024-02-23', actualCompletion: '2024-02-23',
    workDoneAmount: 21_717_359, woAmount: 23_977_779,
  });
  const loaded = await getContract(c.id);
  assert.equal(loaded!.contract.bidDate, '2023-09-12');
  assert.equal(loaded!.contract.actualCompletion, '2024-02-23');
  assert.equal(loaded!.contract.workDoneAmount, 21_717_359);
});

test('replaceProgress stores span days per month and replaces the whole set', async () => {
  const c = await createContract('progress check');
  await replaceProgress(c.id, [
    { month: '2023-09', spanDays: [6, 0, 0, 0] },
    { month: '2023-10', spanDays: [31, 0, 0, 0] },
  ]);
  await replaceProgress(c.id, [{ month: '2023-09', spanDays: [7, 0, 0, 0] }]);
  const loaded = await getContract(c.id);
  assert.equal(loaded!.progress.length, 1);
  assert.deepEqual(loaded!.progress[0], { month: '2023-09', spanDays: [7, 0, 0, 0] });
});

test('replaceComponents persists percentages, factors, rules and overrides', async () => {
  const c = await createContract('components check');
  await replaceComponents(c.id, [
    { key: 'labour', percent: 9.28, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'material', percent: 53.12, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'cement', percent: 0, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'steel', percent: 0.65, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'pol', percent: 8.11, factor: 0.75, baseRule: 'bid_month', baseOverride: 90.8 },
    { key: 'bitumen', percent: 28.84, factor: 0.85, baseRule: 'offset_month', baseOverride: null },
  ]);
  const loaded = await getContract(c.id);
  const pol = loaded!.components.find((x) => x.key === 'pol')!;
  assert.equal(pol.percent, 8.11);
  assert.equal(pol.baseOverride, 90.8);
  assert.equal(loaded!.components.find((x) => x.key === 'material')!.percent, 53.12);
});

test('replaceAdjustments stores only the operator adjustment', async () => {
  const c = await createContract('adjustments check');
  await replaceAdjustments(c.id, [
    { month: '2023-10', adjustment: 500_000 },
    { month: '2024-01', adjustment: -900_000 },
  ]);
  const loaded = await getContract(c.id);
  assert.deepEqual(loaded!.adjustments, [
    { month: '2023-10', adjustment: 500_000 },
    { month: '2024-01', adjustment: -900_000 },
  ]);
});

test('deleting a contract removes its children', async () => {
  const c = await createContract('cascade check');
  await replaceProgress(c.id, [{ month: '2023-09', spanDays: [1, 0, 0, 0] }]);
  await deleteContract(c.id);
  assert.equal(await getContract(c.id), null);
  const { rows } = await pool.query('SELECT * FROM progress WHERE contract_id = $1', [c.id]);
  assert.equal(rows.length, 0);
});

test('listContracts returns a summary of every contract', async () => {
  const all = await listContracts();
  assert.ok(all.length >= 1);
  assert.ok('agreementNo' in all[0]!);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: FAIL — `Cannot find module '../src/repo/contracts.ts'`

- [ ] **Step 3: Write the repository**

`server/src/repo/contracts.ts`:
```ts
import { COMPONENT_KEYS, type ComponentConfig, type ContractInput, type ProgressRow } from '@pes/engine';
import { pool, withTransaction } from '../db.ts';

export interface ContractRecord extends ContractInput { id: number }
export interface AdjustmentRow { month: string; adjustment: number }

export interface ContractBundle {
  contract: ContractRecord;
  components: ComponentConfig[];
  progress: ProgressRow[];
  adjustments: AdjustmentRow[];
}

const CONTRACT_COLUMNS = `
  id, agreement_no, contractor, work_name, wo_no_date, wo_amount, work_done_amount,
  bid_date::text, commencement::text, stipulated_completion::text, actual_completion::text,
  bitumen_offset_days, already_paid`;

interface ContractDbRow {
  id: number; agreement_no: string; contractor: string; work_name: string; wo_no_date: string;
  wo_amount: number; work_done_amount: number; bid_date: string | null; commencement: string | null;
  stipulated_completion: string | null; actual_completion: string | null;
  bitumen_offset_days: number; already_paid: number;
}

const toRecord = (r: ContractDbRow): ContractRecord => ({
  id: r.id,
  agreementNo: r.agreement_no,
  contractor: r.contractor,
  workName: r.work_name,
  woNoDate: r.wo_no_date,
  woAmount: r.wo_amount,
  workDoneAmount: r.work_done_amount,
  bidDate: r.bid_date ?? '',
  commencement: r.commencement ?? '',
  stipulatedCompletion: r.stipulated_completion ?? '',
  actualCompletion: r.actual_completion ?? '',
  bitumenOffsetDays: r.bitumen_offset_days,
  alreadyPaid: r.already_paid,
});

/** Spec 3.2 defaults: POL keys off the bid month, bitumen off the offset month. */
function defaultComponent(key: (typeof COMPONENT_KEYS)[number]): ComponentConfig {
  if (key === 'pol') return { key, percent: 0, factor: 0.75, baseRule: 'bid_month', baseOverride: null };
  if (key === 'bitumen') return { key, percent: 0, factor: 0.85, baseRule: 'offset_month', baseOverride: null };
  return { key, percent: 0, factor: 0.75, baseRule: 'quarter_average', baseOverride: null };
}

export async function listContracts(): Promise<Array<{ id: number; agreementNo: string; contractor: string; workName: string }>> {
  const { rows } = await pool.query<{ id: number; agreement_no: string; contractor: string; work_name: string }>(
    'SELECT id, agreement_no, contractor, work_name FROM contracts ORDER BY id DESC',
  );
  return rows.map((r) => ({
    id: r.id, agreementNo: r.agreement_no, contractor: r.contractor, workName: r.work_name,
  }));
}

export async function createContract(agreementNo: string): Promise<ContractRecord> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<ContractDbRow>(
      `INSERT INTO contracts (agreement_no) VALUES ($1) RETURNING ${CONTRACT_COLUMNS}`,
      [agreementNo],
    );
    const record = toRecord(rows[0]!);
    for (const key of COMPONENT_KEYS) {
      const c = defaultComponent(key);
      await client.query(
        'INSERT INTO components (contract_id, key, percent, factor, base_rule, base_override) VALUES ($1,$2,$3,$4,$5,$6)',
        [record.id, c.key, c.percent, c.factor, c.baseRule, c.baseOverride],
      );
    }
    return record;
  });
}

export async function getContract(id: number): Promise<ContractBundle | null> {
  const { rows } = await pool.query<ContractDbRow>(
    `SELECT ${CONTRACT_COLUMNS} FROM contracts WHERE id = $1`, [id],
  );
  if (rows.length === 0) return null;

  const components = await pool.query<{ key: ComponentConfig['key']; percent: number; factor: number; base_rule: ComponentConfig['baseRule']; base_override: number | null }>(
    `SELECT key, percent, factor, base_rule, base_override FROM components
     WHERE contract_id = $1
     ORDER BY array_position(ARRAY['labour','material','cement','steel','pol','bitumen']::text[], key)`,
    [id],
  );
  const progress = await pool.query<{ month: string; span1_days: number; span2_days: number; span3_days: number; span4_days: number }>(
    'SELECT month::text, span1_days, span2_days, span3_days, span4_days FROM progress WHERE contract_id = $1 ORDER BY month',
    [id],
  );
  const adjustments = await pool.query<{ month: string; adjustment: number }>(
    'SELECT month::text, adjustment FROM payments WHERE contract_id = $1 ORDER BY month', [id],
  );

  return {
    contract: toRecord(rows[0]!),
    components: components.rows.map((c) => ({
      key: c.key, percent: c.percent, factor: c.factor,
      baseRule: c.base_rule, baseOverride: c.base_override,
    })),
    progress: progress.rows.map((p) => ({
      month: p.month.slice(0, 7),
      spanDays: [p.span1_days, p.span2_days, p.span3_days, p.span4_days] as [number, number, number, number],
    })),
    adjustments: adjustments.rows.map((a) => ({ month: a.month.slice(0, 7), adjustment: a.adjustment })),
  };
}

export async function updateContract(id: number, patch: Partial<ContractInput>): Promise<void> {
  const columns: Record<keyof ContractInput, string> = {
    agreementNo: 'agreement_no', contractor: 'contractor', workName: 'work_name',
    woNoDate: 'wo_no_date', woAmount: 'wo_amount', workDoneAmount: 'work_done_amount',
    bidDate: 'bid_date', commencement: 'commencement',
    stipulatedCompletion: 'stipulated_completion', actualCompletion: 'actual_completion',
    bitumenOffsetDays: 'bitumen_offset_days', alreadyPaid: 'already_paid',
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns) as Array<[keyof ContractInput, string]>) {
    if (!(key in patch)) continue;
    const value = patch[key];
    values.push(value === '' ? null : value);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) return;
  values.push(id);
  await pool.query(
    `UPDATE contracts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
    values,
  );
}

export async function replaceComponents(id: number, components: ComponentConfig[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM components WHERE contract_id = $1', [id]);
    for (const c of components) {
      await client.query(
        'INSERT INTO components (contract_id, key, percent, factor, base_rule, base_override) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, c.key, c.percent, c.factor, c.baseRule, c.baseOverride],
      );
    }
  });
}

export async function replaceProgress(id: number, rows: ProgressRow[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM progress WHERE contract_id = $1', [id]);
    for (const r of rows) {
      await client.query(
        'INSERT INTO progress (contract_id, month, span1_days, span2_days, span3_days, span4_days) VALUES ($1,$2::date,$3,$4,$5,$6)',
        [id, `${r.month}-01`, r.spanDays[0], r.spanDays[1], r.spanDays[2], r.spanDays[3]],
      );
    }
  });
}

export async function replaceAdjustments(id: number, rows: AdjustmentRow[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM payments WHERE contract_id = $1', [id]);
    for (const r of rows) {
      await client.query(
        'INSERT INTO payments (contract_id, month, adjustment) VALUES ($1, $2::date, $3)',
        [id, `${r.month}-01`, r.adjustment],
      );
    }
  });
}

export async function deleteContract(id: number): Promise<void> {
  await pool.query('DELETE FROM contracts WHERE id = $1', [id]);
}
```

- [ ] **Step 4: Write the routes**

`server/src/routes/contracts.ts`:
```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.ts';
import {
  createContract, deleteContract, getContract, listContracts,
  replaceAdjustments, replaceComponents, replaceProgress, updateContract,
} from '../repo/contracts.ts';

const monthString = z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(''));

const contractPatch = z.object({
  agreementNo: z.string().max(200), contractor: z.string().max(300),
  workName: z.string().max(1000), woNoDate: z.string().max(300),
  woAmount: z.number(), workDoneAmount: z.number(),
  bidDate: dateString, commencement: dateString,
  stipulatedCompletion: dateString, actualCompletion: dateString,
  bitumenOffsetDays: z.number().int().min(0).max(365),
  alreadyPaid: z.number(),
}).partial();

const componentsBody = z.array(z.object({
  key: z.enum(['labour', 'material', 'cement', 'steel', 'pol', 'bitumen']),
  percent: z.number().min(0).max(100),
  factor: z.number().min(0).max(2),
  baseRule: z.enum(['quarter_average', 'bid_month', 'offset_month']),
  baseOverride: z.number().nullable(),
})).length(6);

const progressBody = z.array(z.object({
  month: monthString,
  spanDays: z.tuple([z.number().int().min(0), z.number().int().min(0),
                     z.number().int().min(0), z.number().int().min(0)]),
}));

const adjustmentsBody = z.array(z.object({ month: monthString, adjustment: z.number() }));

export const contractsRouter: Router = Router();
contractsRouter.use(requireAuth);

const id = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

contractsRouter.get('/', async (_req, res) => { res.json(await listContracts()); });

contractsRouter.post('/', async (req, res) => {
  const parsed = z.object({ agreementNo: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'An agreement number is required' }); return; }
  res.status(201).json(await createContract(parsed.data.agreementNo));
});

contractsRouter.get('/:id', async (req, res) => {
  const contractId = id(req.params.id);
  if (contractId === null) { res.status(400).json({ error: 'Invalid contract id' }); return; }
  const bundle = await getContract(contractId);
  if (!bundle) { res.status(404).json({ error: 'No such contract' }); return; }
  res.json(bundle);
});

contractsRouter.put('/:id', async (req, res) => {
  const contractId = id(req.params.id);
  if (contractId === null) { res.status(400).json({ error: 'Invalid contract id' }); return; }
  const parsed = contractPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  await updateContract(contractId, parsed.data);
  res.json(await getContract(contractId));
});

contractsRouter.delete('/:id', async (req, res) => {
  const contractId = id(req.params.id);
  if (contractId === null) { res.status(400).json({ error: 'Invalid contract id' }); return; }
  await deleteContract(contractId);
  res.status(204).end();
});

function replaceRoute<T>(
  path: string,
  schema: z.ZodType<T>,
  apply: (contractId: number, value: T) => Promise<void>,
): void {
  contractsRouter.put(`/:id/${path}`, async (req, res) => {
    const contractId = id(req.params.id);
    if (contractId === null) { res.status(400).json({ error: 'Invalid contract id' }); return; }
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    await apply(contractId, parsed.data);
    res.json(await getContract(contractId));
  });
}

replaceRoute('components', componentsBody, replaceComponents);
replaceRoute('progress', progressBody, replaceProgress);
replaceRoute('payments', adjustmentsBody, replaceAdjustments);
```

Mount it in `server/src/app.ts`:
```ts
import { contractsRouter } from './routes/contracts.ts';
// ...
app.use('/api/contracts', contractsRouter);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: PASS — 7 contract tests plus everything earlier

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat(server): add contracts API with components, progress and adjustments"
```

---

### Task 10: Calculation endpoint

**Files:**
- Create: `server/src/assemble.ts`, `server/src/routes/calculation.ts`
- Modify: `server/src/routes/contracts.ts` — mount the calculation route on the contract router
- Test: `server/test/calculation.test.ts`

**Interfaces:**
- Consumes: Task 4 — `calculate`, `CalculationResult`; Task 8 — `listRates`; Task 9 — `getContract`
- Produces:
  - `assembleCalculation(contractId: number): Promise<CalculationResult | null>`
  - `serialiseResult(r: CalculationResult): SerialisedResult` — Maps become plain objects and arrays so the result survives JSON
  - `GET /api/contracts/:id/calculation`
- Note: `CalculationResult` uses `Map`, which `JSON.stringify` renders as `{}`. Everything crossing the wire must go through `serialiseResult`.

- [ ] **Step 1: Write the failing test**

`server/test/calculation.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCalculation, serialiseResult } from '../src/assemble.ts';
import {
  createContract, replaceAdjustments, replaceComponents, replaceProgress, updateContract,
} from '../src/repo/contracts.ts';
import { upsertRates } from '../src/repo/rates.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

let contractId = 0;

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);

  await upsertRates([
    { month: '2023-07', labour: 130.0, material: 99.1, cement: 98.1, steel: 91.5, pol: 89.1, bitumenG: 38472, bitumenH: null },
    { month: '2023-08', labour: 125.2, material: 99.5, cement: 98.3, steel: 92.2, pol: 89.8, bitumenG: 38882, bitumenH: null },
    { month: '2023-09', labour: 123.4, material: 99.6, cement: 99.4, steel: 94.6, pol: 90.8, bitumenG: 42072, bitumenH: null },
    { month: '2023-10', labour: 124.2, material: 100.1, cement: 102.4, steel: 92.1, pol: 91.4, bitumenG: 42542, bitumenH: null },
    { month: '2023-11', labour: 124.4, material: 100.1, cement: 102.3, steel: 89.5, pol: 90.9, bitumenG: 42202, bitumenH: null },
    { month: '2023-12', labour: 124.2, material: 99.4, cement: 100.0, steel: 88.2, pol: 89.8, bitumenG: 40582, bitumenH: null },
    { month: '2024-01', labour: 125.3, material: 99.3, cement: 98.1, steel: 87.5, pol: 89.6, bitumenG: 37452, bitumenH: null },
    { month: '2024-02', labour: 125.5, material: 99.3, cement: 97.6, steel: 86.3, pol: 89.9, bitumenG: 37292, bitumenH: null },
    { month: '2024-03', labour: 125.3, material: 99.4, cement: 96.1, steel: 86.3, pol: 89.3, bitumenG: 38312, bitumenH: null },
  ]);

  const c = await createContract('168 of 2023-24');
  contractId = c.id;
  await updateContract(contractId, {
    contractor: 'M/s. Pradeep Kumar Contractor',
    woAmount: 23_977_779, workDoneAmount: 21_717_359,
    bidDate: '2023-09-12', commencement: '2023-09-24',
    stipulatedCompletion: '2024-02-23', actualCompletion: '2024-02-23',
    bitumenOffsetDays: 28, alreadyPaid: 0,
  });
  await replaceComponents(contractId, [
    { key: 'labour', percent: 9.28, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'material', percent: 53.12, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'cement', percent: 0, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'steel', percent: 0.65, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'pol', percent: 8.11, factor: 0.75, baseRule: 'bid_month', baseOverride: null },
    { key: 'bitumen', percent: 28.84, factor: 0.85, baseRule: 'offset_month', baseOverride: null },
  ]);
  await replaceProgress(contractId, [
    { month: '2023-09', spanDays: [6, 0, 0, 0] },
    { month: '2023-10', spanDays: [31, 0, 0, 0] },
    { month: '2023-11', spanDays: [1, 29, 0, 0] },
    { month: '2023-12', spanDays: [0, 9, 22, 0] },
    { month: '2024-01', spanDays: [0, 0, 16, 15] },
    { month: '2024-02', spanDays: [0, 0, 0, 23] },
  ]);
  await replaceAdjustments(contractId, [
    { month: '2023-10', adjustment: 500_000 }, { month: '2023-11', adjustment: 800_000 },
    { month: '2023-12', adjustment: 400_000 }, { month: '2024-01', adjustment: -900_000 },
    { month: '2024-02', adjustment: -800_000 },
  ]);
});
test.after(async () => { await pool.end(); });

test('the stored contract reproduces the workbook payable end to end', async () => {
  const result = await assembleCalculation(contractId);
  assert.ok(result);
  assert.deepEqual(result.problems, []);
  assert.equal(result.payable, 172_604);
  assert.equal(result.baseQuarter, '2023-Q3');
  assert.equal(result.schedule.total, 21_717_359);
});

test('serialiseResult converts every Map so the response survives JSON', async () => {
  const result = await assembleCalculation(contractId);
  const wire = JSON.parse(JSON.stringify(serialiseResult(result!)));
  assert.equal(wire.payable, 172_604);
  assert.equal(wire.bases.labour.value, 126.2);
  assert.equal(wire.componentTotals.cement, 0);
  assert.equal(wire.schedule.byQuarter['2023-Q4'], 14_130_330);
  assert.equal(Array.isArray(wire.lines), true);
});

test('editing a day count changes the schedule rather than leaving a stale amount', async () => {
  await replaceProgress(contractId, [
    { month: '2023-09', spanDays: [7, 0, 0, 0] },
    { month: '2023-10', spanDays: [30, 0, 0, 0] },
    { month: '2023-11', spanDays: [1, 29, 0, 0] },
    { month: '2023-12', spanDays: [0, 9, 22, 0] },
    { month: '2024-01', spanDays: [0, 0, 16, 15] },
    { month: '2024-02', spanDays: [0, 0, 0, 23] },
  ]);
  const result = await assembleCalculation(contractId);
  assert.equal(result!.schedule.rows.find((r) => r.month === '2023-09')!.computed, 500_071);
  assert.equal(result!.schedule.total, 21_717_359);
});

test('an unknown contract yields null rather than throwing', async () => {
  assert.equal(await assembleCalculation(999_999), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: FAIL — `Cannot find module '../src/assemble.ts'`

- [ ] **Step 3: Write the assembler**

`server/src/assemble.ts`:
```ts
import { calculate, type CalculationResult } from '@pes/engine';
import { getContract } from './repo/contracts.ts';
import { listRates } from './repo/rates.ts';

/** The single place that knows both the database shape and the engine shape. */
export async function assembleCalculation(contractId: number): Promise<CalculationResult | null> {
  const bundle = await getContract(contractId);
  if (!bundle) return null;

  return calculate({
    contract: bundle.contract,
    components: bundle.components,
    rates: await listRates(),
    progress: bundle.progress,
    adjustments: new Map(bundle.adjustments.map((a) => [a.month, a.adjustment])),
  });
}

const fromMap = <V>(m: Map<string, V>): Record<string, V> => Object.fromEntries(m);

export interface SerialisedResult extends Omit<
  CalculationResult, 'bases' | 'componentTotals' | 'schedule'
> {
  bases: Record<string, unknown>;
  componentTotals: Record<string, number>;
  schedule: Omit<CalculationResult['schedule'], 'byQuarter'> & { byQuarter: Record<string, number> };
}

/** JSON.stringify renders a Map as {}. Flatten every Map before responding. */
export function serialiseResult(r: CalculationResult): SerialisedResult {
  return {
    ...r,
    bases: fromMap(r.bases),
    componentTotals: fromMap(r.componentTotals),
    schedule: { ...r.schedule, byQuarter: fromMap(r.schedule.byQuarter) },
  };
}
```

- [ ] **Step 4: Write the route**

`server/src/routes/calculation.ts`:
```ts
import { Router } from 'express';
import { assembleCalculation, serialiseResult } from '../assemble.ts';

export const calculationRouter: Router = Router({ mergeParams: true });

calculationRouter.get('/', async (req, res) => {
  const contractId = Number((req.params as { id: string }).id);
  if (!Number.isInteger(contractId) || contractId <= 0) {
    res.status(400).json({ error: 'Invalid contract id' }); return;
  }
  const result = await assembleCalculation(contractId);
  if (!result) { res.status(404).json({ error: 'No such contract' }); return; }
  res.json(serialiseResult(result));
});
```

Mount it at the end of `server/src/routes/contracts.ts`:
```ts
import { calculationRouter } from './calculation.ts';
// ...
contractsRouter.use('/:id/calculation', calculationRouter);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: PASS — 4 calculation tests plus everything earlier

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat(server): add calculation endpoint returning the full derivation"
```

---

### Task 11: Seed script

**Files:**
- Create: `server/seed/rates.json`, `server/seed/seed.ts`
- Test: `server/test/seed.test.ts`

**Interfaces:**
- Consumes: Task 8 — `upsertRates`; Task 9 — the contract repository; Task 10 — `assembleCalculation`
- Produces: `seedDatabase(): Promise<{ rates: number; contractId: number }>`, runnable as `npm run seed -w @pes/server`

- [ ] **Step 1: Create the rates data**

`server/seed/rates.json` — the full 'Rates Chart ok' sheet, Apr-2023 to Jun-2026. Columns in order: `month, labour, material, cement, steel, pol, bitumenG, bitumenH`.
```json
[
["2023-04",128.1,99.0,98.2,96.9,89.7,48232,49582],
["2023-05",127.8,98.6,98.2,95.5,88.7,48282,47642],
["2023-06",128.6,98.3,97.6,94.7,88.5,45312,40852],
["2023-07",130.0,99.1,98.1,91.5,89.1,38472,36972],
["2023-08",125.2,99.5,98.3,92.2,89.8,38882,40922],
["2023-09",123.4,99.6,99.4,94.6,90.8,42072,41612],
["2023-10",124.2,100.1,102.4,92.1,91.4,42542,43032],
["2023-11",124.4,100.1,102.3,89.5,90.9,42202,41632],
["2023-12",124.2,99.4,100.0,88.2,89.8,40582,39122],
["2024-01",125.3,99.3,98.1,87.5,89.6,37452,36592],
["2024-02",125.5,99.3,97.6,86.3,89.9,37292,38082],
["2024-03",125.3,99.4,96.1,86.3,89.3,38312,37742],
["2024-04",124.7,99.9,95.7,90.5,88.0,37832,38492],
["2024-05",124.7,100.4,95.0,92.8,87.6,38592,38232],
["2024-06",126.1,100.7,93.9,91.1,86.9,37852,37652],
["2024-07",128.4,101.0,91.6,85.5,87.5,38382,38492],
["2024-08",129.7,100.8,90.8,83.2,87.2,40592,40662],
["2024-09",130.2,101.2,94.0,82.3,86.4,40052,38472],
["2024-10",131.3,102.1,94.2,85.6,86.0,38012,40252],
["2024-11",130.7,102.1,93.7,83.3,86.1,41712,42102],
["2024-12",128.8,101.6,96.2,82.6,86.2,43282,45382],
["2025-01",128.1,101.1,96.0,83.4,86.6,45452,45202],
["2025-02",127.5,100.9,96.3,83.6,87.1,45052,45202],
["2025-03",127.7,100.6,96.0,84.5,86.5,44962,45862],
["2025-04",128.3,100.5,97.2,86.8,84.6,46312,46482],
["2025-05",127.9,100.2,98.3,84.6,82.8,45872,45752],
["2025-06",128.3,100.3,98.1,82.4,82.9,46082,45422],
["2025-07",131.2,100.2,97.4,80.7,84.2,44942,44552],
["2025-08",132.0,100.8,96.6,80.2,84.4,44312,44232],
["2025-09",132.2,101.0,95.8,78.8,84.1,43372,42162],
["2025-10",132.5,100.9,95.0,76.9,84.6,41042,40472],
["2025-11",131.8,101.5,95.2,77.3,84.8,40022,40322],
["2025-12",132.2,101.9,94.8,78.5,84.6,42182,null],
["2026-01",131.7,102.3,94.8,84.0,83.4,null,null],
["2026-02",133.7,103.1,95.0,86.8,84.3,null,null],
["2026-03",134.4,104.6,95.8,87.2,89.8,null,null],
["2026-04",135.1,108.9,97.1,90.0,102.4,null,null],
["2026-05",135.2,109.9,97.2,88.9,105.1,null,null],
["2026-06",135.2,110.2,96.5,85.1,109.9,null,null]
]
```

- [ ] **Step 2: Write the failing test**

`server/test/seed.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedDatabase } from '../seed/seed.ts';
import { assembleCalculation } from '../src/assemble.ts';
import { listRates } from '../src/repo/rates.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
});
test.after(async () => { await pool.end(); });

test('seeding loads the full rates chart and Agreement 168, which still totals 172604', async () => {
  const { rates, contractId } = await seedDatabase();
  assert.equal(rates, 39);
  assert.equal((await listRates()).length, 39);

  const result = await assembleCalculation(contractId);
  assert.ok(result);
  assert.deepEqual(result.problems, []);
  assert.equal(result.payable, 172_604);
});

test('seeding twice does not duplicate the rates chart', async () => {
  await seedDatabase();
  assert.equal((await listRates()).length, 39);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: FAIL — `Cannot find module '../seed/seed.ts'`

- [ ] **Step 4: Write the seed script**

`server/seed/seed.ts`:
```ts
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RateRow } from '@pes/engine';
import { pool } from '../src/db.ts';
import { upsertRates } from '../src/repo/rates.ts';
import {
  createContract, replaceAdjustments, replaceComponents, replaceProgress, updateContract,
} from '../src/repo/contracts.ts';

type RateTuple = [string, ...(number | null)[]];

async function loadRates(): Promise<RateRow[]> {
  const path = join(dirname(fileURLToPath(import.meta.url)), 'rates.json');
  const tuples = JSON.parse(await readFile(path, 'utf8')) as RateTuple[];
  return tuples.map(([month, labour, material, cement, steel, pol, bitumenG, bitumenH]) => ({
    month,
    labour: labour ?? null, material: material ?? null, cement: cement ?? null,
    steel: steel ?? null, pol: pol ?? null,
    bitumenG: bitumenG ?? null, bitumenH: bitumenH ?? null,
  }));
}

/** Loads the shared rates chart and the source contract, idempotently. */
export async function seedDatabase(): Promise<{ rates: number; contractId: number }> {
  const rates = await loadRates();
  await upsertRates(rates);

  const agreementNo = '168 of 2023-24';
  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM contracts WHERE agreement_no = $1', [agreementNo],
  );
  const contract = existing.rows[0] ?? (await createContract(agreementNo));
  const contractId = contract.id;

  await updateContract(contractId, {
    contractor: 'M/s. Pradeep Kumar Contractor',
    workName: 'Const. of various Roads under Pkg No RJ-20-06/ML/2023-24 Distt Jhunjhunu',
    woNoDate: 'No. 1504-12 Date 14.09.2024',
    woAmount: 23_977_779, workDoneAmount: 21_717_359,
    bidDate: '2023-09-12', commencement: '2023-09-24',
    stipulatedCompletion: '2024-02-23', actualCompletion: '2024-02-23',
    bitumenOffsetDays: 28, alreadyPaid: 0,
  });

  await replaceComponents(contractId, [
    { key: 'labour', percent: 9.28, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'material', percent: 53.12, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'cement', percent: 0, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'steel', percent: 0.65, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'pol', percent: 8.11, factor: 0.75, baseRule: 'bid_month', baseOverride: null },
    { key: 'bitumen', percent: 28.84, factor: 0.85, baseRule: 'offset_month', baseOverride: null },
  ]);

  await replaceProgress(contractId, [
    { month: '2023-09', spanDays: [6, 0, 0, 0] },
    { month: '2023-10', spanDays: [31, 0, 0, 0] },
    { month: '2023-11', spanDays: [1, 29, 0, 0] },
    { month: '2023-12', spanDays: [0, 9, 22, 0] },
    { month: '2024-01', spanDays: [0, 0, 16, 15] },
    { month: '2024-02', spanDays: [0, 0, 0, 23] },
  ]);

  await replaceAdjustments(contractId, [
    { month: '2023-10', adjustment: 500_000 }, { month: '2023-11', adjustment: 800_000 },
    { month: '2023-12', adjustment: 400_000 }, { month: '2024-01', adjustment: -900_000 },
    { month: '2024-02', adjustment: -800_000 },
  ]);

  return { rates: rates.length, contractId };
}

// Allow `npm run seed -w @pes/server`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { rates, contractId } = await seedDatabase();
  console.log(`Seeded ${rates} rate months and contract #${contractId}.`);
  await pool.end();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: PASS — 2 seed tests plus everything earlier

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat(server): add seed script loading the rates chart and Agreement 168"
```

---
## Design Direction

Applies to every web task. Do not substitute a different palette or type system.

**Subject.** A working instrument for a contractor's office: someone prepares a Clause-45 escalation statement that a PWD engineer will audit line by line. The page's job is not to present a number but to let a person *check* one.

**Type — the IBM Plex superfamily, three registers, one skeleton.** Plex was drawn for an engineering company; this is an engineering department's billing tool. `IBM Plex Sans` for the application chrome, `IBM Plex Mono` for every figure (tabular numerals are mandatory — digits must align down a column), `IBM Plex Serif` for the printed report. The seam is deliberate: the operator can always tell whether they are looking at the *instrument* or the *document*.

**Colour — ledger ink, not parchment.** Deliberately not the cream-and-terracotta look that reads as generic "official document".

```css
--paper:      #FBFCFD;  /* cool bond white, not cream */
--ink:        #0F172A;  /* blue-black, the ink of contract stationery */
--ink-muted:  #5A6579;
--rule:       #DCE1E9;  /* hairlines */
--stamp:      #4338CA;  /* indigo endorsement: headings, focus, the payable */
--recovery:   #A02218;  /* negative amounts, i.e. recovery from the contractor */
```

**Signature element — the formula strip.** Each escalation line renders as a typeset equation reading left to right, operands in tabular mono, operators in muted light weight, result flush right:

```
0.75  ×  9.28/100  ×  ₹1,41,30,330  ×  (124.2667 − 126.2000) / 126.2000   =   −₹15,066.38
```

This is the artifact of the subject's world — the source workbook lays each operator out as its own cell — and it is what makes the bill auditable. Everything else on the page stays quiet so this carries the weight.

**Structure — numbered stages that mean something.** The left rail lists the five stages in dependency order (1 Main Data → 2 Rates Chart → 3 Index Average → 4 Base Rate → 5 Calculation). Numbering is justified here because the data genuinely flows in that order; each number fills in once that stage's inputs are complete, so the rail doubles as a readiness indicator.

**Motion.** One purposeful effect: a derived field flashes its background for 120 ms when an edit upstream changes it, so the operator sees what propagated. Nothing else. `prefers-reduced-motion: reduce` disables it.

**Quality floor, unannounced.** Responsive to mobile, visible keyboard focus on every control, all money right-aligned in tabular figures, Indian digit grouping (`1,41,30,330`) via `Intl.NumberFormat('en-IN')`.

---

### Task 12: Web scaffold, design system, API client and login

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`
- Create: `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/styles.css`
- Create: `web/src/format.ts`, `web/src/pages/LoginPage.tsx`, `web/src/components/Shell.tsx`
- Test: `web/test/format.test.ts`

**Interfaces:**
- Consumes: the API from Tasks 7–10
- Produces:
  - `api` object in `api.ts`: `me()`, `login(email, password)`, `logout()`, `createUser(email, password)`, `listRates()`, `putRates(rows)`, `pasteRates(text)`, `listContracts()`, `createContract(agreementNo)`, `getContract(id)`, `putContract(id, patch)`, `putComponents(id, rows)`, `putProgress(id, rows)`, `putPayments(id, rows)`, `getCalculation(id)`
  - `formatRupees(n: number): string`, `formatIndex(n: number | null, dp?: number): string`, `formatMonth(m: string): string` from `format.ts`
  - `Shell` — the left-rail layout with the five numbered stages
  - Route table in `App.tsx`: `/` contracts, `/c/:id` Main Data, `/c/:id/rates`, `/c/:id/index-average`, `/c/:id/base-rate`, `/c/:id/calculation`

- [ ] **Step 1: Create the web workspace**

`web/package.json`:
```json
{
  "name": "@pes/web",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test 'test/**/*.test.ts'"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.0",
    "vite": "^7.0.0"
  }
}
```

`web/vite.config.ts` — proxy the API to the server in development so both sides share an origin:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

`web/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src", "test"]
}
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Price Escalation</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@400;600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the failing test**

`web/test/format.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupees, formatIndex, formatMonth } from '../src/format.ts';

test('formatRupees groups digits the Indian way', () => {
  assert.equal(formatRupees(21_717_359), '2,17,17,359');
  assert.equal(formatRupees(172_604), '1,72,604');
  assert.equal(formatRupees(0), '0');
});

test('formatRupees marks a negative amount with a true minus sign', () => {
  assert.equal(formatRupees(-18_356), '−18,356');
});

test('formatRupees keeps paise when asked', () => {
  assert.equal(formatRupees(-18_356.293, 2), '−18,356.29');
});

test('formatIndex shows a fixed number of decimals and an em dash for nothing', () => {
  assert.equal(formatIndex(92.766666666, 4), '92.7667');
  assert.equal(formatIndex(126.2, 4), '126.2000');
  assert.equal(formatIndex(null), '—');
});

test('formatMonth renders a month key for a person', () => {
  assert.equal(formatMonth('2023-09'), 'Sep 2023');
  assert.equal(formatMonth('2024-01'), 'Jan 2024');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @pes/web`
Expected: FAIL — `Cannot find module '../src/format.ts'`

- [ ] **Step 4: Write the formatters**

`web/src/format.ts`:
```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Indian digit grouping, with a typographic minus rather than a hyphen. */
export function formatRupees(n: number, dp = 0): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  }).format(Math.abs(n));
  return (n < 0 ? '−' : '') + formatted;
}

export function formatIndex(n: number | null, dp = 4): string {
  return n === null ? '—' : n.toFixed(dp);
}

export function formatMonth(m: string): string {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1]} ${y}`;
}
```

- [ ] **Step 5: Write the design system**

`web/src/styles.css` — the tokens from the Design Direction, plus the shared primitives every page uses:
```css
:root {
  --paper: #FBFCFD;
  --ink: #0F172A;
  --ink-muted: #5A6579;
  --rule: #DCE1E9;
  --stamp: #4338CA;
  --recovery: #A02218;

  --sans: 'IBM Plex Sans', system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, monospace;
  --serif: 'IBM Plex Serif', Georgia, serif;

  --step: 8px;
  --measure: 1100px;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 15px/1.5 var(--sans);
  -webkit-font-smoothing: antialiased;
}

:focus-visible {
  outline: 2px solid var(--stamp);
  outline-offset: 2px;
}

/* Every figure is tabular so digits align down a column. */
.num {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.num--negative { color: var(--recovery); }

.stage-rail { display: flex; flex-direction: column; gap: calc(var(--step) / 2); }
.stage {
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: var(--step);
  align-items: baseline;
  padding: var(--step);
  border-radius: 6px;
  color: var(--ink-muted);
  text-decoration: none;
}
.stage[aria-current='page'] { background: color-mix(in srgb, var(--stamp) 8%, transparent); color: var(--ink); }
.stage__number {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-muted);
  border: 1px solid var(--rule);
  border-radius: 999px;
  text-align: center;
  padding: 1px 0;
}
/* A stage whose inputs are complete fills its marker in. */
.stage--ready .stage__number { background: var(--stamp); border-color: var(--stamp); color: #fff; }

table.grid { width: 100%; border-collapse: collapse; font-size: 14px; }
table.grid th, table.grid td {
  border-bottom: 1px solid var(--rule);
  padding: 6px 10px;
  text-align: left;
}
table.grid thead th {
  position: sticky; top: 0;
  background: var(--paper);
  font-size: 12px; font-weight: 600;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--ink-muted);
}
.scroller { overflow-x: auto; }

input, select {
  font: inherit;
  padding: 5px 8px;
  border: 1px solid var(--rule);
  border-radius: 4px;
  background: #fff;
  color: inherit;
}
input.num { font-family: var(--mono); }

.notice { border-left: 3px solid var(--recovery); padding: var(--step); background: #fff; }
.notice--ok { border-left-color: var(--stamp); }

/* The one animation: a derived cell flashes when an upstream edit reaches it. */
@keyframes settle { from { background: color-mix(in srgb, var(--stamp) 18%, transparent); } to { background: transparent; } }
.settled { animation: settle 120ms ease-out; }
@media (prefers-reduced-motion: reduce) { .settled { animation: none; } }
```

- [ ] **Step 6: Write the API client**

`web/src/api.ts`:
```ts
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  return body as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const send = (path: string, method: string, body: unknown) =>
  call(path, { method, body: JSON.stringify(body) });

export const api = {
  me: () => call('/api/auth/me'),
  login: (email: string, password: string) => send('/api/auth/login', 'POST', { email, password }),
  logout: () => call('/api/auth/logout', { method: 'POST' }),
  createUser: (email: string, password: string) => send('/api/users', 'POST', { email, password }),

  listRates: () => call('/api/rates'),
  putRates: (rows: unknown[]) => send('/api/rates', 'PUT', rows),
  pasteRates: (text: string) => send('/api/rates/paste', 'POST', { text }),

  listContracts: () => call('/api/contracts'),
  createContract: (agreementNo: string) => send('/api/contracts', 'POST', { agreementNo }),
  getContract: (id: number) => call(`/api/contracts/${id}`),
  putContract: (id: number, patch: unknown) => send(`/api/contracts/${id}`, 'PUT', patch),
  putComponents: (id: number, rows: unknown[]) => send(`/api/contracts/${id}/components`, 'PUT', rows),
  putProgress: (id: number, rows: unknown[]) => send(`/api/contracts/${id}/progress`, 'PUT', rows),
  putPayments: (id: number, rows: unknown[]) => send(`/api/contracts/${id}/payments`, 'PUT', rows),
  getCalculation: (id: number) => call(`/api/contracts/${id}/calculation`),
};
```

- [ ] **Step 7: Write the login page, shell and routing**

`web/src/pages/LoginPage.tsx` — email and password, with the first-run case handled: if `POST /api/users` succeeds anonymously, the site had no accounts and this person is now the admin.
```tsx
import { useState } from 'react';
import { api, ApiError } from '../api.ts';

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '15vh auto', padding: 16 }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, marginBottom: 4 }}>Price Escalation</h1>
      <p style={{ color: 'var(--ink-muted)', marginTop: 0 }}>Clause-45 billing</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="notice">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
```

`web/src/components/Shell.tsx` — the numbered stage rail. A stage is `ready` when its own inputs are complete, which is what makes the numbering informative rather than decorative:
```tsx
import { NavLink, Outlet, useParams } from 'react-router-dom';

export interface StageReadiness {
  mainData: boolean;
  rates: boolean;
  indexAverage: boolean;
  baseRate: boolean;
  calculation: boolean;
}

const STAGES = [
  { to: '', label: 'Main Data', key: 'mainData' },
  { to: 'rates', label: 'Rates Chart', key: 'rates' },
  { to: 'index-average', label: 'Index Average', key: 'indexAverage' },
  { to: 'base-rate', label: 'Base Rate', key: 'baseRate' },
  { to: 'calculation', label: 'Calculation', key: 'calculation' },
] as const;

export function Shell({ readiness }: { readiness: StageReadiness }) {
  const { id } = useParams();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', minHeight: '100vh' }}>
      <nav style={{ borderRight: '1px solid var(--rule)', padding: 16 }}>
        <div className="stage-rail">
          {STAGES.map((s, i) => (
            <NavLink
              key={s.key}
              end={s.to === ''}
              to={`/c/${id}${s.to ? `/${s.to}` : ''}`}
              className={({ isActive }) =>
                `stage${readiness[s.key] ? ' stage--ready' : ''}${isActive ? ' stage--active' : ''}`}
            >
              <span className="stage__number">{i + 1}</span>
              <span>{s.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main style={{ padding: 24, maxWidth: 'var(--measure)' }}><Outlet /></main>
    </div>
  );
}
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

`web/src/App.tsx` — checks the session on mount, shows `LoginPage` when signed out, otherwise the router with the six routes listed in **Interfaces**. Pages from Tasks 13–16 mount into `Shell`'s `<Outlet />`; until those tasks land, stub each route with a heading so routing can be verified.

- [ ] **Step 8: Run the tests and the dev server**

Run: `npm test -w @pes/web`
Expected: PASS — 5 format tests

Run the server (`npm run dev -w @pes/server`) and the web app (`npm run dev -w @pes/web`), open the printed URL, create the first account, and confirm you land on the contracts route signed in as admin.

- [ ] **Step 9: Commit**

```bash
git add web/ package-lock.json
git commit -m "feat(web): add app scaffold, design tokens, API client and sign-in"
```

---

### Task 13: Contracts list and Main Data page

**Files:**
- Create: `web/src/pages/ContractsPage.tsx`, `web/src/pages/MainDataPage.tsx`
- Create: `web/src/components/SpanwiseGrid.tsx`, `web/src/components/ComponentTable.tsx`
- Modify: `web/src/App.tsx` — mount the two pages
- Test: `web/test/readiness.test.ts`

**Interfaces:**
- Consumes: Task 12 — `api`, `formatRupees`, `formatMonth`, `Shell`, `StageReadiness`
- Produces:
  - `ContractsPage` — list, create, open, delete
  - `MainDataPage` — the particulars form, `ComponentTable`, `SpanwiseGrid`
  - `computeReadiness(bundle, rates, calculation): StageReadiness` in `web/src/readiness.ts`

- [ ] **Step 1: Write the failing test**

`web/test/readiness.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReadiness } from '../src/readiness.ts';

const complete = {
  contract: {
    agreementNo: '168 of 2023-24', workDoneAmount: 21_717_359,
    bidDate: '2023-09-12', commencement: '2023-09-24', actualCompletion: '2024-02-23',
  },
  components: [{ percent: 100 }],
  progress: [{ month: '2023-09' }],
};

test('main data is ready only once dates, amount and percentages are all in', () => {
  assert.equal(computeReadiness(complete, [], null).mainData, true);
  assert.equal(computeReadiness({ ...complete, components: [{ percent: 90 }] }, [], null).mainData, false);
  assert.equal(computeReadiness({ ...complete, contract: { ...complete.contract, commencement: '' } }, [], null).mainData, false);
});

test('a stage is not ready while the calculation still reports a problem', () => {
  const withProblem = { problems: [{ code: 'missing_rates' }], payable: 0 };
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], withProblem).calculation, false);
  const clean = { problems: [], payable: 172_604 };
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], clean).calculation, true);
});

test('the rates stage is not ready while the chart is empty', () => {
  assert.equal(computeReadiness(complete, [], null).rates, false);
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], null).rates, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @pes/web`
Expected: FAIL — `Cannot find module '../src/readiness.ts'`

- [ ] **Step 3: Write the readiness rule**

`web/src/readiness.ts`:
```ts
import type { StageReadiness } from './components/Shell.tsx';

interface ReadinessBundle {
  contract: { agreementNo: string; workDoneAmount: number; bidDate: string; commencement: string; actualCompletion: string };
  components: Array<{ percent: number }>;
  progress: Array<{ month: string }>;
}
interface ReadinessCalculation { problems: Array<{ code: string }>; payable: number }

/** Drives the numbered rail: a stage fills in once its own inputs are complete. */
export function computeReadiness(
  bundle: ReadinessBundle,
  rates: Array<{ month: string }>,
  calculation: ReadinessCalculation | null,
): StageReadiness {
  const percentTotal = bundle.components.reduce((a, c) => a + c.percent, 0);
  const mainData = Boolean(
    bundle.contract.agreementNo && bundle.contract.bidDate &&
    bundle.contract.commencement && bundle.contract.actualCompletion &&
    bundle.contract.workDoneAmount > 0 && Math.abs(percentTotal - 100) < 1e-9,
  );
  const ratesReady = rates.length > 0;
  const derived = Boolean(calculation && calculation.problems.length === 0);

  return {
    mainData,
    rates: ratesReady,
    indexAverage: derived,
    baseRate: derived,
    calculation: derived,
  };
}
```

- [ ] **Step 4: Write the contracts page**

`web/src/pages/ContractsPage.tsx` — a table of every contract (agreement number, contractor, work name) with a "New contract" form taking only the agreement number, since everything else is filled in on Main Data. Each row links to `/c/:id`. Deleting asks for confirmation naming the agreement. Empty state is an invitation, not an apology: *"No contracts yet. Add an agreement number to start one."*

- [ ] **Step 5: Write the component percentage table**

`web/src/components/ComponentTable.tsx` — six fixed rows in `COMPONENT_KEYS` order. Columns: Component, Share %, Factor, Base rule, Base override. The total row shows the running sum of percentages and turns to `--recovery` when it is not 100, with the message *"Shares total 98.5%. They must total 100%."* Saving is debounced by 500 ms into `api.putComponents`.

- [ ] **Step 6: Write the spanwise grid**

`web/src/components/SpanwiseGrid.tsx` — one row per month between commencement and actual completion, four editable day columns (Span 1–4), then read-only Monthly amount and Quarterly total. Above the grid, a summary strip of the four spans: days, value, per-day rate, end date. Each span column header shows its date range so the operator knows which months may carry days for it. Read-only cells get the `settled` class for 120 ms whenever their value changes. Column totals per span show `38 / 38` style progress against `spans.days[i]`, turning `--recovery` if a span is over-allocated.

- [ ] **Step 7: Write the Main Data page**

`web/src/pages/MainDataPage.tsx` — loads the contract bundle, the rates and the calculation; renders the particulars form (agreement no., contractor, work name, WO no. & date, WO amount, work done amount, the four dates, bitumen offset days, already-paid), then `ComponentTable`, then `SpanwiseGrid`. Every field saves debounced, then refetches the calculation so downstream figures and the stage rail stay true. Derived read-outs — work period in days, the four span dates — sit beside the date fields.

- [ ] **Step 8: Verify in the browser**

Run both dev servers, open the seeded Agreement 168, and confirm: work period reads 152 days; the four spans read 38 days each; the monthly amounts match 428,632 / 2,214,599 / 4,214,882 / 6,000,849 / 5,572,217 / 3,286,180; the component total reads 100%; stage 1 in the rail is filled.

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat(web): add contracts list and Main Data entry with spanwise grid"
```

---

### Task 14: Rates Chart page

**Files:**
- Create: `web/src/pages/RatesChartPage.tsx`, `web/src/components/PasteBox.tsx`
- Modify: `web/src/App.tsx` — mount the page
- Test: manual, in the browser (the parser itself is already tested server-side in Task 8)

**Interfaces:**
- Consumes: Task 12 — `api.listRates`, `api.putRates`, `api.pasteRates`, `formatMonth`
- Produces: `RatesChartPage`, `PasteBox`

- [ ] **Step 1: Write the paste box**

`web/src/components/PasteBox.tsx` — a `<textarea>` labelled *"Paste rows copied from Excel"*, with the expected column order shown beneath it as a hint: `Month · Labour · Material · Cement · Steel · POL · Bitumen VG-10 · Bitumen (2nd series)`. On submit it calls `api.pasteRates` and reports the outcome plainly: *"Added 12 months."* Any parse errors list beneath, each naming the offending text, and the good rows still save — a bad line never discards the rest.

- [ ] **Step 2: Write the rates page**

`web/src/pages/RatesChartPage.tsx` — a full-width editable grid, one row per month, sticky header, wrapped in `.scroller`. A row of blank inputs at the bottom adds a month. Edits save debounced into `api.putRates`. Months required by the current contract but missing from the chart are highlighted and listed above the grid: *"This contract needs Mar 2024, which the chart does not have yet."* — the exact months come from the calculation's `missing_rates` problem, so the operator never has to work out which month is absent.

Above the grid, one line of orientation: *"Shared across every contract. Published index figures — fill a month once."*

- [ ] **Step 3: Verify in the browser**

Confirm the seeded chart shows 39 months in order; edit a value and confirm the Calculation page's payable changes; paste two tab-separated rows and confirm they appear; paste a line with a bad month and confirm the good rows still save and the bad line is named.

- [ ] **Step 4: Commit**

```bash
git add web/
git commit -m "feat(web): add rates chart grid with Excel paste"
```

---

### Task 15: Index Average and Base Rate pages

**Files:**
- Create: `web/src/pages/IndexAveragePage.tsx`, `web/src/pages/BaseRatePage.tsx`
- Create: `web/src/components/ScheduleTable.tsx`
- Modify: `web/src/App.tsx` — mount the two pages
- Test: manual, in the browser

**Interfaces:**
- Consumes: Task 12 — `api.getCalculation`, `api.putComponents`, `api.putPayments`, `formatIndex`, `formatRupees`, `formatMonth`
- Produces: `IndexAveragePage`, `BaseRatePage`, `ScheduleTable`

- [ ] **Step 1: Write the Index Average page**

`web/src/pages/IndexAveragePage.tsx` — entirely read-only, and says so: *"Derived from the rates chart. Nothing here is entered by hand."* One block per quarter under consideration, each showing its three months and their six index values, then an Average row set in `--stamp`. The base quarter carries a small label reading *"Base quarter"* so it is obvious why the first quarter's escalation nets to zero.

- [ ] **Step 2: Write the schedule table**

`web/src/components/ScheduleTable.tsx` — one row per month: Month, Computed (read-only, from `schedule.rows[].computed`), Adjustment (editable), Payment (read-only sum). Below, the quarter subtotals and a grand total. When the total differs from the work done amount, a `.notice` states both figures and the difference — a warning, never a block. Adjustments save debounced into `api.putPayments`.

The Computed column carries a one-line explanation on first render: *"Computed from the days entered on Main Data, allocated so the months total the work done amount exactly."*

- [ ] **Step 3: Write the Base Rate page**

`web/src/pages/BaseRatePage.tsx` — the contract header, then a base-index table with one row per component showing: Component, Share %, the rule in plain words (*"Average of Jul–Sep 2023"*, *"Sep 2023, the bid month"*, *"Aug 2023, 28 days before the bid"*), the source months, the resolved value, and an override input. An overridden row is marked *"Overridden"* and shows the rule-derived value it replaced, so nothing is silently lost. Then `ScheduleTable`.

- [ ] **Step 4: Verify in the browser**

On the seeded contract confirm: base quarter is Jul–Sep 2023; base rates read 126.2000 / 99.4000 / 98.6000 / 92.7667 / 90.8000 / 38,882; POL's rule reads as the bid month; bitumen's as 28 days before the bid; the schedule totals 2,17,17,359 with quarter subtotals 4,28,632 / 1,41,30,330 / 71,58,397. Type an override for POL and confirm the Calculation page's payable moves.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat(web): add index average and base rate pages with payment schedule"
```

---

### Task 16: The calculation report

**Files:**
- Create: `web/src/pages/CalculationPage.tsx`, `web/src/components/FormulaStrip.tsx`, `web/src/print.css`
- Modify: `web/src/App.tsx` — mount the page
- Test: manual, in the browser and in print preview

**Interfaces:**
- Consumes: Task 12 — `api.getCalculation`, `formatRupees`, `formatIndex`, `formatMonth`
- Produces: `CalculationPage`, `FormulaStrip`

This is the signature screen. Everything else in the app is an input surface; this is the document.

- [ ] **Step 1: Write the formula strip**

`web/src/components/FormulaStrip.tsx` — renders one `EscalationLine` as a typeset equation, operands in `--mono` tabular figures and operators in `--ink-muted` at a lighter weight, result flush right and coloured `--recovery` when negative:

```tsx
import { formatIndex, formatMonth, formatRupees } from '../format.ts';

export interface EscalationLine {
  component: string; period: string; periodKind: 'quarter' | 'month';
  factor: number; percent: number; value: number;
  currentIndex: number | null; baseIndex: number | null; amount: number;
}

const Op = ({ children }: { children: React.ReactNode }) => (
  <span style={{ color: 'var(--ink-muted)', fontWeight: 400, padding: '0 6px' }}>{children}</span>
);

export function FormulaStrip({ line }: { line: EscalationLine }) {
  const label = line.periodKind === 'month' ? formatMonth(line.period) : line.period.replace('-', ' ');
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 1fr auto',
      gap: 12, alignItems: 'baseline',
      padding: '8px 0', borderBottom: '1px solid var(--rule)',
      fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', fontSize: 13,
    }}>
      <span style={{ color: 'var(--ink-muted)' }}>{label}</span>
      <span className="scroller" style={{ whiteSpace: 'nowrap' }}>
        {line.factor}
        <Op>×</Op>{line.percent}/100
        <Op>×</Op>₹{formatRupees(line.value)}
        <Op>×</Op>({formatIndex(line.currentIndex)}<Op>−</Op>{formatIndex(line.baseIndex)})
        <Op>/</Op>{formatIndex(line.baseIndex)}
      </span>
      <span className={`num${line.amount < 0 ? ' num--negative' : ''}`} style={{ fontWeight: 600 }}>
        {formatRupees(line.amount, 2)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write the report page**

`web/src/pages/CalculationPage.tsx` — set in `--serif` at A4 measure, visually distinct from the app around it. In order:

1. A heading naming the clause and the contract, then the particulars block (agreement no., contractor, work name, WO no. & date, the four dates, work amount).
2. Six component sections, each with its share, factor and base index stated once, then a `FormulaStrip` per period, then that component's total.
3. The grand total, less already paid, then the payable in `--stamp` at display size — with the amount also written in words underneath, the way the workbook's "Say in Rs." line does.
4. A contractor signature block.

If the calculation carries problems, they appear at the top as `.notice` items and the payable is labelled *provisional*.

- [ ] **Step 3: Write the print stylesheet**

`web/src/print.css` — imported by the report page only:
```css
@media print {
  nav, button, .no-print { display: none !important; }
  body { background: #fff; }
  main { max-width: none !important; padding: 0 !important; }
  .report { font-family: var(--serif); color: #000; }
  .report section { break-inside: avoid; }
  @page { size: A4; margin: 18mm 16mm; }
}
```

- [ ] **Step 4: Verify in the browser and in print preview**

On the seeded contract confirm the six component totals read −18,356.29 / 24,516.94 / 0.00 / −4,386.11 / −6,959.29 / 1,77,788.75 and the payable reads **₹1,72,604**. Confirm Labour's first quarter shows equal current and base indices with a zero result. Open print preview and confirm the rail and buttons are gone, each component section stays whole across a page break, and figures stay aligned.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat(web): add the calculation report with auditable formula strips"
```

---

### Task 17: Production build and deployment

**Files:**
- Modify: `server/src/app.ts` — serve the built web bundle
- Modify: `package.json` — the root build script
- Create: `render.yaml`, `README.md`
- Test: `server/test/static.test.ts`

**Interfaces:**
- Consumes: everything
- Produces: a single Render web service serving both the API and the app

- [ ] **Step 1: Write the failing test**

`server/test/static.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { pool } from '../src/db.ts';

const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const addr = server.address();
const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

test.after(async () => { server.close(); await pool.end(); });

test('an unknown API route returns JSON, never the app shell', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') ?? '', /json/);
});

test('a client route falls through to the app shell so deep links work', async () => {
  const res = await fetch(`${base}/c/1/calculation`);
  // 200 with the shell when a build exists, 404 when it does not — never a crash.
  assert.ok([200, 404].includes(res.status));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test -w @pes/server`
Expected: FAIL — `/api/nope` currently falls through to the 500 handler rather than returning a JSON 404

- [ ] **Step 3: Serve the bundle**

Add to `server/src/app.ts`, after all API routers and before the error handler:
```ts
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ... inside createApp(), after app.use('/api/contracts', contractsRouter):

  // An unmatched /api path is a client error, not a missing page.
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'No such endpoint' }); });

  const webDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    // Deep links are client-routed, so every non-API path gets the shell.
    app.get(/.*/, (_req, res) => { res.sendFile(join(webDist, 'index.html')); });
  }
```

- [ ] **Step 4: Wire the root build**

Update the root `package.json` scripts:
```json
{
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build -w @pes/engine && npm run build -w @pes/web && npm run build -w @pes/server",
    "start": "npm run start -w @pes/server",
    "seed": "npm run seed -w @pes/server"
  }
}
```

- [ ] **Step 5: Write render.yaml**

```yaml
services:
  - type: web
    name: pes-calculator
    runtime: node
    plan: free
    buildCommand: npm ci && npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_VERSION
        value: "24"
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false        # paste the Neon pooled connection string
      - key: SESSION_SECRET
        generateValue: true
```

- [ ] **Step 6: Run the tests and a full local production build**

Run: `DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=test-secret npm test`
Expected: PASS — every workspace

Run: `npm run build && DATABASE_URL=$DEV_DATABASE_URL SESSION_SECRET=$(openssl rand -hex 32) NODE_ENV=production npm start`
Expected: migrations apply, the server listens, and the app loads at `http://localhost:3000` with the API on the same origin.

- [ ] **Step 7: Write the README**

`README.md` covering: what the tool does and which workbook it replaces; local setup (Neon dev branch, `.env`, `npm install`, `npm run seed`, the two dev servers); the test commands; and deployment, step by step —

1. Push the repository to GitHub.
2. Create a Neon project; copy the **pooled** connection string.
3. On Render, create a Blueprint from `render.yaml`, or a Web Service pointing at the repo.
4. Set `DATABASE_URL` to the Neon string. `SESSION_SECRET` generates itself.
5. Deploy. Migrations run at startup.
6. Open the site and create the first account — it becomes the admin.
7. Optionally run `npm run seed` against production to load the rates chart and Agreement 168.

Include a note that the free Render plan sleeps when idle, so the first request after a pause takes a few seconds.

- [ ] **Step 8: Commit**

```bash
git add server/ package.json render.yaml README.md
git commit -m "feat: serve the web bundle from the API server and add Render deployment"
```

---

## Self-Review

**Spec coverage.** Every section of the design spec maps to a task: §2 analysis → the fixture and golden test (Tasks 3, 5); §3.1 spans → Task 2; §3.2 base rules → Task 3; §3.3 quarters → Task 3; §3.4 formula → Task 4; §3.5 schedule and largest-remainder rounding → Task 2, surfaced in Task 15; §4 architecture → Tasks 1–4, 6, 12; §5 schema → Task 6; §6 API → Tasks 7–10; §7 screens → Tasks 12–16; §8 validation → Task 4 problems, surfaced in Tasks 13–16; §9 auth → Task 7; §10 testing → Task 5 plus per-task tests; §11 deployment → Task 17. §12 out-of-scope items appear in no task, as intended.

**Type consistency.** `ComponentKey`, `BaseRule`, `Month`, `Quarter`, `IsoDate`, `RateRow`, `ComponentConfig`, `ContractInput`, `ProgressRow` are defined once in Task 1 and imported everywhere after. `SpanTable`, `PaymentSchedule` and `ScheduleRow` come from Task 2; `ResolvedBase` and `MeanResult` from Task 3; `EscalationLine`, `Problem`, `CalculationResult` from Task 4. The server re-exports none of them — it imports from `@pes/engine`. `bitumenG`/`bitumenH` are camelCase in the engine and `bitumen_g`/`bitumen_h` in SQL, converted only in `repo/rates.ts`.

**Two traps called out where they bite.** `JSON.stringify` renders a `Map` as `{}`, so Task 10 routes every result through `serialiseResult`. `pg` returns `NUMERIC` as a string and `DATE` as a local-midnight `Date`, so Task 6 sets both type parsers at the pool.
