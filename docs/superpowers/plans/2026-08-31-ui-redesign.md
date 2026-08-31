# Ledger UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the web layer's visual system around a warm-paper ledger idiom, fix the four data-entry defects found while reading the code, and give the printed three-sheet set real page furniture.

**Architecture:** Retheme in place. `web/src/styles.css` is already token-driven with no literal colours outside its palette blocks — the tokens simply hold the wrong values and the file has no spacing or type scale. So: rewrite the token layer, add the scales, then sweep the 92 inline `style={{ ... }}` objects out of the TSX into real classes. Extract only the primitives that genuinely repeat. Component structure and the six-stage route table are unchanged.

**Tech Stack:** React 19, react-router-dom 7, Vite 7, TypeScript 5.9, plain CSS with custom properties. Tests are `node --test` against `.ts` sources via Node 24 type stripping. No CSS framework, no component library, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-ui-redesign-design.md`

## Global Constraints

- **No new dependencies.** Nothing is added to `web/package.json`.
- **The engine, server, API and database are untouched.** Only files under `web/src/` change.
- **No literal colour outside the palette blocks** at the top of `styles.css`. A hex code anywhere else — TSX included — is a defect.
- **Two rule weights only:** `--rule` (hairline, between rows) and `--rule-strong` (structural, under section and table heads). Any third weight, any `border-radius` above 2px, and any `box-shadow` is a defect.
- **Colour carries state, never emphasis.** Emphasis is weight and rule. The only colour tokens with meaning are `--ok` (settled), `--warn` (provisional), `--recovery` (negative).
- **Agreement 168 of 2023-24 must still produce a payable of ₹1,72,604.** No task may alter a figure.
- **The three-state System/Light/Dark theme survives.** `web/src/theme.ts` is not modified by any task.
- **Every task ends green:** `npm test` from the repo root and `npm run build -w @pes/web` both pass before the commit.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WXC5pTd96dzZqrpmU8HGUs
  ```

## A note on testing, read this before Task 1

The 43 existing web tests are **logic-only** — `format`, `readiness`, `months`, `password`, `paste`, `problems`. None render DOM. A green run says nothing about whether the interface works.

This plan therefore does two different things, and you must not confuse them:

- **Tasks 1 and 7 extract pure functions and test them properly.** Real TDD: failing test first.
- **Tasks 2–6 and 8 are visual.** There is nothing honest to unit-test. Each carries an explicit **manual verification** step instead. Do not invent a test that asserts a class name is present — it passes forever and catches nothing. Actually look at the screen.

Task 9 is the verification pass that decides whether this work is done.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `web/src/grid.ts` | Cell-to-cell keyboard navigation: two pure functions and the `useGridKeys` hook |
| `web/test/grid.test.ts` | Tests for the pure functions in `grid.ts` |
| `web/src/sheets.ts` | Pure helpers for printed page furniture: sheet numbering, provisional notice, today's date |
| `web/test/sheets.test.ts` | Tests for `sheets.ts` |
| `web/src/components/RunningHead.tsx` | The on-screen running head: contract identity, save state, errors |
| `web/src/components/SheetFurniture.tsx` | Running head and foot rendered inside each printed `.sheet` |

**Rewritten**

`web/src/styles.css`, `web/src/print.css`.

**Modified** — inline styles removed, new classes adopted: `App.tsx`, `ContractLayout.tsx`, all nine files under `pages/`, and `Shell.tsx`, `ProblemList.tsx`, `ComponentTable.tsx`, `SpanwiseGrid.tsx`, `ScheduleTable.tsx`, `BaseRateSummary.tsx`, `IndexAverageTables.tsx`, `BillPaper.tsx`, `FormulaStrip.tsx`, `PasteBox.tsx`, `Spinner.tsx`, `ThemeToggle.tsx`, `PrintButton.tsx`.

**Never touched:** `engine/`, `server/`, and in `web/src/`: `api.ts`, `format.ts`, `months.ts`, `password.ts`, `paste.ts`, `problems.ts`, `readiness.ts`, `theme.ts`. No existing test file is edited.

---

## Task 1: Grid keyboard navigation, extracted and repaired

The operator's named pain point. `useGridKeys` already exists in `RatesChartPage.tsx:47-79` and is used by that page alone; the spanwise grid has no keyboard navigation at all.

**While extracting it, there is a latent bug to fix.** The hook reads `e.currentTarget.selectionStart` on `<input type="number">`. Per the HTML spec, `selectionStart` applies only to `text`, `search`, `url`, `tel` and `password` inputs — on a `number` input Chrome returns `null` and Firefox throws `InvalidStateError`. So `atStart` is `null === 0` → `false`, and left/right arrows almost certainly **never** move between cells today; only Up, Down and Enter work. Step 1 verifies this before changing anything.

**Files:**
- Create: `web/src/grid.ts`
- Create: `web/test/grid.test.ts`
- Modify: `web/src/pages/RatesChartPage.tsx` (delete lines 1-79's hook, import instead)
- Modify: `web/src/components/SpanwiseGrid.tsx`, `web/src/components/ComponentTable.tsx`, `web/src/components/ScheduleTable.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `caretEdges(value: string, start: number | null, end: number | null): { atStart: boolean; atEnd: boolean }`
  - `nextCell(key: string, r: number, c: number, edges: { atStart: boolean; atEnd: boolean }, hasCaret: boolean): { r: number; c: number } | null`
  - `useGridKeys(rowCount: number, colCount: number): { grid: RefObject<HTMLTableSectionElement | null>; onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => void }`

- [ ] **Step 1: Confirm the caret bug before changing anything**

Start the dev server (`npm run dev:web` with `npm run dev:server` alongside), open the Rates Chart, click into a Labour cell, and press the Left arrow with the caret at the start of the value.

Expected today: focus stays in the cell. If focus *does* move to the Month column, the bug does not reproduce in your browser — record that in the commit message and keep the fix anyway, because it is correct in every browser.

- [ ] **Step 2: Write the failing test**

Create `web/test/grid.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { caretEdges, nextCell } from '../src/grid.ts';

// caretEdges — a number input exposes no caret, and must not be read as
// "caret parked in the middle", which is what silently disabled left/right.
test('caretEdges reads a real caret at the start of the value', () => {
  assert.deepEqual(caretEdges('1346', 0, 0), { atStart: true, atEnd: false });
});

test('caretEdges reads a real caret at the end of the value', () => {
  assert.deepEqual(caretEdges('1346', 4, 4), { atStart: false, atEnd: true });
});

test('caretEdges reads a caret in the middle as neither edge', () => {
  assert.deepEqual(caretEdges('1346', 2, 2), { atStart: false, atEnd: false });
});

test('caretEdges treats a control with no caret as sitting at both edges', () => {
  // input type=number: Chrome returns null, Firefox throws and the hook
  // passes null. Either way both arrows must move between cells.
  assert.deepEqual(caretEdges('1346', null, null), { atStart: true, atEnd: true });
});

test('caretEdges treats an empty value as both edges at once', () => {
  assert.deepEqual(caretEdges('', 0, 0), { atStart: true, atEnd: true });
});

// nextCell
const BOTH = { atStart: true, atEnd: true };
const MIDDLE = { atStart: false, atEnd: false };

test('nextCell moves down on ArrowDown', () => {
  assert.deepEqual(nextCell('ArrowDown', 2, 3, MIDDLE, true), { r: 3, c: 3 });
});

test('nextCell moves down on Enter, so a column can be filled without reaching for the mouse', () => {
  assert.deepEqual(nextCell('Enter', 2, 3, MIDDLE, true), { r: 3, c: 3 });
});

test('nextCell moves up on ArrowUp', () => {
  assert.deepEqual(nextCell('ArrowUp', 2, 3, MIDDLE, true), { r: 1, c: 3 });
});

test('nextCell moves left only once the caret has reached the start', () => {
  assert.equal(nextCell('ArrowLeft', 2, 3, MIDDLE, true), null);
  assert.deepEqual(nextCell('ArrowLeft', 2, 3, BOTH, true), { r: 2, c: 2 });
});

test('nextCell moves right only once the caret has reached the end', () => {
  assert.equal(nextCell('ArrowRight', 2, 3, MIDDLE, true), null);
  assert.deepEqual(nextCell('ArrowRight', 2, 3, BOTH, true), { r: 2, c: 4 });
});

test('nextCell leaves the vertical arrows to a select, which uses them to pick an option', () => {
  assert.equal(nextCell('ArrowDown', 2, 3, BOTH, false), null);
  assert.equal(nextCell('ArrowUp', 2, 3, BOTH, false), null);
});

test('nextCell still moves a select horizontally, and still leaves it on Enter', () => {
  assert.deepEqual(nextCell('ArrowRight', 2, 3, BOTH, false), { r: 2, c: 4 });
  assert.deepEqual(nextCell('Enter', 2, 3, BOTH, false), { r: 3, c: 3 });
});

test('nextCell ignores keys that are not navigation', () => {
  assert.equal(nextCell('a', 2, 3, BOTH, true), null);
  assert.equal(nextCell('Tab', 2, 3, BOTH, true), null);
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npm test -w @pes/web`
Expected: FAIL — `Cannot find module '../src/grid.ts'`.

- [ ] **Step 4: Write `web/src/grid.ts`**

```ts
import { useRef, type KeyboardEvent, type RefObject } from 'react';

export interface CaretEdges {
  atStart: boolean;
  atEnd: boolean;
}

/**
 * Where the caret sits inside a control, as the grid needs to know it.
 *
 * `selectionStart` applies only to text, search, url, tel and password inputs.
 * On `type="number"` Chrome hands back null and Firefox throws, so the caller
 * passes null for both. Null means "this control has no caret to move through",
 * and the grid must then treat every horizontal press as a move between cells —
 * reading null as a caret parked mid-value is what silently disabled left and
 * right on the rates chart.
 */
export function caretEdges(value: string, start: number | null, end: number | null): CaretEdges {
  if (start === null || end === null) return { atStart: true, atEnd: true };
  return { atStart: start === 0, atEnd: end === value.length };
}

export interface CellMove {
  r: number;
  c: number;
}

/**
 * The cell a key press should move focus to, or null to let the key do its
 * ordinary work. Bounds are the caller's business — see `useGridKeys`.
 *
 * `hasCaret` is false for a <select>, which owns the vertical arrows: they are
 * how it picks an option, and stealing them would break the control.
 */
export function nextCell(
  key: string,
  r: number,
  c: number,
  edges: CaretEdges,
  hasCaret: boolean,
): CellMove | null {
  if (key === 'Enter') return { r: r + 1, c };
  if (hasCaret && key === 'ArrowDown') return { r: r + 1, c };
  if (hasCaret && key === 'ArrowUp') return { r: r - 1, c };
  if (key === 'ArrowLeft' && edges.atStart) return { r, c: c - 1 };
  if (key === 'ArrowRight' && edges.atEnd) return { r, c: c + 1 };
  return null;
}

type Cell = HTMLInputElement | HTMLSelectElement;

/**
 * Arrow keys and Enter move between cells, because this is a grid of figures
 * and every other grid of figures behaves this way. Without it, entering a
 * month of published indices means seven reaches for the mouse, or a tab route
 * that runs off the end of the row into the delete button.
 *
 * Mark each control with `data-r` and `data-c` and hand it this `onKeyDown`;
 * put the `grid` ref on the <tbody>.
 */
export function useGridKeys(rowCount: number, colCount: number): {
  grid: RefObject<HTMLTableSectionElement | null>;
  onKeyDown: (e: KeyboardEvent<Cell>) => void;
} {
  const grid = useRef<HTMLTableSectionElement>(null);

  const focusCell = (r: number, c: number): boolean => {
    if (r < 0 || r >= rowCount || c < 0 || c >= colCount) return false;
    const el = grid.current?.querySelector<Cell>(`[data-r="${r}"][data-c="${c}"]`);
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<Cell>) => {
    const el = e.currentTarget;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;

    const isInput = el instanceof HTMLInputElement;
    let edges: CaretEdges = { atStart: true, atEnd: true };
    if (isInput) {
      // Firefox throws outright rather than returning null for a number input.
      try {
        edges = caretEdges(el.value, el.selectionStart, el.selectionEnd);
      } catch {
        edges = { atStart: true, atEnd: true };
      }
    }

    const move = nextCell(e.key, r, c, edges, isInput);
    if (move && focusCell(move.r, move.c)) e.preventDefault();
  };

  return { grid, onKeyDown };
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm test -w @pes/web`
Expected: PASS, 43 existing + 14 new.

- [ ] **Step 6: Point `RatesChartPage` at the extracted hook**

In `web/src/pages/RatesChartPage.tsx`: delete the whole local `useGridKeys` function and its doc comment (currently lines 41-79), delete `useRef` and the `KeyboardEvent` type from the React import if they become unused, and add:

```ts
import { useGridKeys } from '../grid.ts';
```

The call site (`const { grid, onKeyDown } = useGridKeys(rows.length, COLUMNS.length);`) and every `data-r` / `data-c` / `onKeyDown` attribute stay exactly as they are.

- [ ] **Step 7: Add keyboard navigation to `SpanwiseGrid` — the named pain point**

In `web/src/components/SpanwiseGrid.tsx`, import the hook and call it with the month rows and the four span columns:

```ts
import { useGridKeys } from '../grid.ts';
```

Inside the component, after `const months = monthsBetween(...)`:

```ts
const { grid, onKeyDown } = useGridKeys(months.length, 4);
```

Put the ref on the months table's `<tbody ref={grid}>`, and give the day inputs their coordinates. The existing `months.map((month) => ...)` becomes `months.map((month, r) => ...)`, and each input gains three attributes:

```tsx
<input className="cell" type="number" min="0" max="31"
       data-r={r} data-c={i} onKeyDown={onKeyDown}
       value={days[i] || ''}
       placeholder="0"
       onChange={(e) => setDay(month, i, Number(e.target.value))} />
```

Leave the spans summary table above it alone — it is read-only.

- [ ] **Step 8: Add keyboard navigation to `ComponentTable` and `ScheduleTable`**

`ComponentTable` has three editable columns and one of them is a `<select>`, which is why `nextCell` takes `hasCaret`. Column order: 0 = Share %, 1 = Factor, 2 = Base index from (select), 3 = Override.

```ts
const { grid, onKeyDown } = useGridKeys(COMPONENT_KEYS.length, 4);
```

Put `ref={grid}` on its `<tbody>`, change `COMPONENT_KEYS.map((key) => ...)` to `COMPONENT_KEYS.map((key, r) => ...)`, and add `data-r={r} data-c={0..3} onKeyDown={onKeyDown}` to the share input, the factor input, the `<select className="cell">` and the override input in that order.

`ScheduleTable` has a single editable column:

```ts
const { grid, onKeyDown } = useGridKeys(calculation.schedule.rows.length, 1);
```

`ref={grid}` on its `<tbody>`, `calculation.schedule.rows.map((r, i) => ...)`, and `data-r={i} data-c={0} onKeyDown={onKeyDown}` on the adjustment input. Note the existing row variable is already named `r` — rename it to `row` when you add the index, and update the three references inside (`r.month`, `r.computed`, `r.payment`).

- [ ] **Step 9: Verify by hand, with the mouse pushed away**

Run the app. On Main Data, with a contract that has commencement and actual completion set so the months grid renders, enter a full column of days using **only** the keyboard: type, Enter, type, Enter. Then check that Left and Right cross between span columns, and that Up returns.

On Base Rate, tab into the "Base index from" select and confirm Up and Down still open and move through its options rather than jumping rows.

- [ ] **Step 10: Run the full suite and build**

Run: `npm test && npm run build -w @pes/web`
Expected: both pass.

- [ ] **Step 11: Commit**

```bash
git add web/src/grid.ts web/test/grid.test.ts web/src/pages/RatesChartPage.tsx \
        web/src/components/SpanwiseGrid.tsx web/src/components/ComponentTable.tsx \
        web/src/components/ScheduleTable.tsx
git commit -m "feat(web): keyboard navigation in every grid, and a caret fix

useGridKeys was trapped in RatesChartPage while the spanwise grid — the one
the operator actually fights — had none. Extracted to grid.ts and applied to
all four editable grids.

Repairs a latent bug on the way out: the hook read selectionStart on
input[type=number], which the HTML spec does not define for that type. Chrome
returns null and Firefox throws, so atStart was false and the left and right
arrows never moved between cells. A control with no caret now reads as
sitting at both edges, which is what a grid of figures wants.

Selects keep their vertical arrows — that is how they pick an option."
```

---

## Task 2: The token layer and the scales

The foundation every later task builds on. Nothing else changes in this task, so the app will look half-converted at the end of it — that is expected and is why Task 3 follows immediately.

**Files:**
- Modify: `web/src/styles.css` (the palette blocks at the top, plus base type)

**Interfaces:**
- Consumes: nothing.
- Produces: the token names every later task uses — `--paper`, `--surface`, `--sunk`, `--stripe`, `--hover`, `--ink`, `--ink-muted`, `--ink-faint`, `--rule`, `--rule-strong`, `--accent`, `--on-accent`, `--ok`, `--ok-wash`, `--warn`, `--warn-wash`, `--recovery`, `--recovery-wash`, `--s1`…`--s8`, `--t-micro`, `--t-small`, `--t-body`, `--t-base`, `--t-h2`, `--t-h1`, `--sans`, `--mono`, `--serif`, `--measure`.

- [ ] **Step 1: Replace the three palette blocks**

In `web/src/styles.css`, the `:root` block, the `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }` block and the `:root[data-theme='dark']` block keep their exact structure and their explanatory comments. Only values change, plus the `--stamp` → `--accent` rename.

Light (`:root`):

```css
  --paper: #FBFAF7;
  --surface: #FBFAF7;
  --sunk: #F3F1EA;
  --stripe: #F7F5EE;
  --hover: #F0EDE4;
  --ink: #1B1A17;
  --ink-muted: #6B6555;
  --ink-faint: #A8A091;
  --rule: #EAE6DB;
  --rule-strong: #1B1A17;

  --accent: #1B1A17;
  --on-accent: #FBFAF7;

  --ok: #1F5C3D;
  --ok-wash: #E6EFE7;
  --warn: #7A4E10;
  --warn-wash: #F6EDD9;
  --recovery: #8E2A1E;
  --recovery-wash: #F6E6E2;
```

Dark — identical values in **both** the media-query block and the `[data-theme='dark']` block:

```css
  --paper: #1A1815;
  --surface: #1A1815;
  --sunk: #211F1B;
  --stripe: #1E1C19;
  --hover: #252220;
  --ink: #EDE9DF;
  --ink-muted: #A9A192;
  --ink-faint: #7D766A;
  --rule: #2E2A24;
  --rule-strong: #EDE9DF;

  --accent: #EDE9DF;
  --on-accent: #1A1815;

  --ok: #7FBE9B;
  --ok-wash: #16241C;
  --warn: #D7A45C;
  --warn-wash: #2A2114;
  --recovery: #E08A7E;
  --recovery-wash: #2B1714;
```

`--surface` is deliberately equal to `--paper`: the ledger draws no cards. `--rule-strong` is deliberately equal to `--ink`: a structural rule is ink.

Replace the `--stamp` comment with one that says what `--accent` now means:

```css
/* --accent is ink. Emphasis in a ledger is weight and rule, not hue, so the
   accent is the darkest thing available and colour is left free to mean
   something: --ok settled, --warn provisional, --recovery negative. */
```

- [ ] **Step 2: Add the scales to the `:root` block**

Immediately after the font-family tokens, before `--measure`:

```css
  /* Spacing. Every margin and padding in the app resolves to one of these.
     Their absence is why the rhythm drifted page to page. */
  --s1: 4px;  --s2: 8px;  --s3: 12px; --s4: 16px;
  --s5: 24px; --s6: 32px; --s7: 48px; --s8: 64px;

  /* Type. Table figures deliberately do not shrink: the complaint was that
     the app is cramped and hard to read, and buying whitespace by shrinking
     the numbers answers the wrong half of it. Room comes from row height
     and gutters instead. */
  --t-micro: 10px;
  --t-small: 12px;
  --t-body: 14px;
  --t-base: 15.5px;
  --t-h2: 18px;
  --t-h1: 26px;
```

And widen the measure:

```css
  --measure: 1240px;
```

- [ ] **Step 3: Rename every `--stamp` reference in the stylesheet**

There are 27 occurrences of `stamp` in `styles.css` and 1 in `print.css`. Replace `var(--stamp)` with `var(--accent)`, `var(--on-stamp)` with `var(--on-accent)`.

`--stamp-wash` has no replacement — it was a tinted background for the current stage and for row emphasis. Every rule using it is rewritten in Task 3; for now, temporarily point `.stage[aria-current='page']` at `var(--sunk)` so nothing renders invisible mid-plan.

- [ ] **Step 4: Update the base type**

```css
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: var(--t-base)/1.55 var(--sans);
  -webkit-font-smoothing: antialiased;
}
```

And the title:

```css
.title {
  font-family: var(--serif);
  font-size: var(--t-h1);
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.15;
  margin: 0;
}
```

- [ ] **Step 5: Build, then look at it in both themes**

Run: `npm run build -w @pes/web`

Then run the app and open any contract stage. Cycle the theme toggle through System, Light and Dark. Expected: warm paper in light, warm charcoal in dark, buttons now solid ink. The page will look partly converted — panels still have borders and radii, spacing is still improvised. That is correct at this point.

Check specifically that **no element has become invisible** — ink-on-ink or paper-on-paper. If one has, it is reading a token you renamed.

- [ ] **Step 6: Commit**

```bash
git add web/src/styles.css web/src/print.css
git commit -m "feat(web): the ledger token layer, and the scales that were missing

Warm paper and warm charcoal, replacing the blue-grey dark theme that read as
a different product from the light one. Two rule weights: hairline between
rows, ink under structure.

--stamp becomes --accent and is ink itself. Colour is now free to mean state
and nothing else.

Adds the spacing and type scales whose absence let vertical rhythm drift page
to page — 92 inline style objects across the TSX are about to resolve to them."
```

---

## Task 3: The running head, the shell and the rail

**Files:**
- Create: `web/src/components/RunningHead.tsx`
- Modify: `web/src/components/Shell.tsx`, `web/src/ContractLayout.tsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: tokens and scales from Task 2.
- Produces: `<RunningHead identity={string} sub={string} saving={boolean} error={string | null} payable={string | null} problemCount={number} />` — used by Task 4 for the contracts, login and profile pages with `payable={null}` and `problemCount={0}`.

- [ ] **Step 1: Write the running head component**

Create `web/src/components/RunningHead.tsx`:

```tsx
/**
 * A bound book puts the chapter on every page. This does the same for the
 * contract: nothing else on screen names it, and the rail that used to is the
 * first thing a narrow window takes away.
 *
 * Save state and errors live here rather than inline on each page, so they
 * stop shifting the layout when they appear — the row reserves its height
 * whether or not there is anything to say.
 */
export function RunningHead({
  identity, sub, saving, error, payable, problemCount,
}: {
  identity: string;
  sub?: string;
  saving?: boolean;
  error?: string | null;
  payable?: string | null;
  problemCount?: number;
}) {
  return (
    <div className="running-head">
      <div className="running-head__id">
        <span className="running-head__name">{identity}</span>
        {sub && <span className="running-head__sub">{sub}</span>}
      </div>

      {/* Carried here only on a narrow screen, where the rail is out of sight. */}
      {payable && (
        <span className="running-head__payable">
          {payable}
          {problemCount ? <span className="running-head__flag">{problemCount}</span> : null}
        </span>
      )}

      <span className={`running-head__state${error ? ' running-head__state--error' : ''}`}>
        {error ?? (saving ? 'Saving…' : 'All changes saved')}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Style it**

Add to `web/src/styles.css`, in a new `/* ---- running head ---- */` section:

```css
.running-head {
  display: flex; align-items: baseline; gap: var(--s3);
  padding-bottom: var(--s2); margin-bottom: var(--s5);
  border-bottom: 1px solid var(--rule-strong);
  font-family: var(--sans); font-size: var(--t-small);
  /* Reserved, so an error appearing does not shift the page under the cursor. */
  min-height: 26px;
}
.running-head__id { display: flex; align-items: baseline; gap: var(--s2); min-width: 0; }
.running-head__name { font-weight: 600; color: var(--ink); white-space: nowrap; }
.running-head__sub {
  color: var(--ink-muted); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.running-head__state { margin-left: auto; color: var(--ink-faint); white-space: nowrap; }
.running-head__state--error { color: var(--recovery); }
/* The payable rides here only where the rail is not on screen. */
.running-head__payable { display: none; }
.running-head__flag {
  display: inline-block; margin-left: var(--s1); padding: 0 6px;
  border-radius: 999px; background: var(--warn-wash); color: var(--warn);
  font-weight: 600;
}
```

- [ ] **Step 3: Restyle the shell and the rail**

Replace the `/* ---- shell ---- */` and `/* ---- stage rail ---- */` sections. The ledger rail has no rounded pills and no tinted current row — the current stage is a solid ink block, as in the approved mockup.

```css
.shell { display: grid; grid-template-columns: 244px 1fr; min-height: 100vh; }
.shell__nav {
  border-right: 1px solid var(--rule);
  background: var(--surface);
  padding: var(--s5) var(--s4);
  display: flex; flex-direction: column; gap: var(--s5);
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
}
/* min-width:0 or the 1fr track refuses to shrink below its widest table,
   and a wide grid drags the whole page sideways instead of scrolling itself. */
.shell__main { padding: var(--s6) var(--s6) var(--s8); max-width: var(--measure); min-width: 0; }

.rail-back { font-size: var(--t-small); text-decoration: none; color: var(--ink-muted); }
.rail-back:hover { color: var(--ink); text-decoration: underline; }
.rail-title { font-family: var(--serif); font-size: var(--t-h2); line-height: 1.3; }
.rail-sub { font-size: var(--t-small); color: var(--ink-faint); margin-top: 2px; }

/* The payable: a structural rule above it, no card. */
.rail-total { border-top: 2px solid var(--rule-strong); padding-top: var(--s3); }
.rail-total__label {
  font-size: var(--t-micro); font-weight: 600; letter-spacing: 0.13em;
  text-transform: uppercase; color: var(--ok);
}
.rail-total__value {
  font-family: var(--serif); font-size: 25px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: var(--ink);
  margin-top: var(--s1); letter-spacing: -0.02em;
}
.rail-total__note { font-size: var(--t-small); color: var(--ink-muted); margin-top: 3px; }
.rail-total--pending .rail-total__label { color: var(--warn); }
.rail-total--empty .rail-total__label,
.rail-total--empty .rail-total__value { color: var(--ink-faint); }

.rail-foot { display: grid; gap: var(--s2); margin-top: auto; }

/* ---- stage rail: an index, not a menu ---- */
.stage-rail { display: flex; flex-direction: column; }
.stage {
  display: grid; grid-template-columns: 20px 1fr; gap: var(--s3);
  align-items: center; padding: var(--s2) 0;
  border-bottom: 1px solid var(--rule);
  color: var(--ink-muted); text-decoration: none; font-size: var(--t-body);
}
.stage:last-child { border-bottom: none; }
.stage:hover { color: var(--ink); }
.stage[aria-current='page'] {
  background: var(--accent); color: var(--on-accent); font-weight: 600;
  padding-left: var(--s2); padding-right: var(--s2);
  margin: 0 calc(var(--s2) * -1); border-bottom-color: transparent;
}
.stage__number {
  font-family: var(--mono); font-size: var(--t-micro);
  font-variant-numeric: tabular-nums; text-align: center;
  color: var(--ink-faint);
}
.stage[aria-current='page'] .stage__number { color: var(--on-accent); opacity: 0.6; }
/* A stage whose inputs are complete fills its marker in. */
.stage--ready .stage__number {
  background: var(--accent); color: var(--on-accent);
  border-radius: 2px; line-height: 16px;
}
.stage--blocked .stage__number { color: var(--warn); font-weight: 700; }
```

Delete the old `.rail-total` border/radius rules and the `.stage__number` circle rules they replace.

- [ ] **Step 4: Mount the running head**

In `web/src/components/Shell.tsx`, add the props the head needs and render it at the top of `<main>`. Change the `Props` interface to add `saving?: boolean` and `error?: string | null`, then:

```tsx
import { RunningHead } from './RunningHead.tsx';
```

```tsx
      <main className="shell__main">
        <RunningHead
          identity={agreementNo || 'Untitled contract'}
          sub={contractor}
          saving={saving}
          error={error}
          payable={calculation ? `₹${formatRupees(calculation.payable)}` : null}
          problemCount={calculation?.problems.length ?? 0}
        />
        {children}
      </main>
```

Also remove the two inline styles in this file: `style={{ marginTop: 12 }}` on `.rail-title` becomes a class rule `.rail-title { margin-top: var(--s3); }`, and `style={{ gap: 8 }}` on the sign-out row becomes `className="row row--tight"` with `.row--tight { gap: var(--s2); }`.

`ContractLayout.tsx` passes nothing new yet — the pages own their savers. Leave `saving` and `error` undefined here; Task 5 wires them through.

- [ ] **Step 5: Mobile — the head goes sticky and the problems come back**

In the `@media (max-width: 820px)` block, replace the rail rules:

```css
  .shell { grid-template-columns: 1fr; }
  .shell__nav {
    position: static; height: auto;
    border-right: none; border-bottom: 1px solid var(--rule);
    padding: var(--s3) var(--s4); gap: var(--s3);
  }
  .shell__main { padding: var(--s5) var(--s4) var(--s7); }

  /* The head carries the identity and the payable once the rail scrolls away. */
  .running-head {
    position: sticky; top: 0; z-index: 4;
    background: var(--paper); padding-top: var(--s2);
  }
  .running-head__payable {
    display: inline; margin-left: auto; font-family: var(--mono);
    font-variant-numeric: tabular-nums; font-weight: 600; color: var(--ink);
  }
  .running-head__state { display: none; }

  .rail-sub { display: none; }
  .rail-total { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s1) var(--s3); }
  .rail-total__value { font-size: var(--t-h2); margin-top: 0; }
  .rail-total__note { margin: 0 0 0 auto; }

  .stage-rail { flex-direction: row; overflow-x: auto; }
  .stage { white-space: nowrap; border-bottom: none; padding: var(--s2) var(--s3); }
  .rail-foot { grid-auto-flow: column; justify-content: start; align-items: center; gap: var(--s4); margin-top: 0; }
```

**Delete `.problems { display: none; }` entirely.** Add instead:

```css
  /* Reachable rather than deleted — this is the list that explains why a bill
     is provisional, and hiding it on a phone removed the best thing here. */
  .problems { max-height: 40vh; overflow-y: auto; }
```

- [ ] **Step 6: Verify by hand**

Run the app. Check on a contract stage:
- The running head names the agreement on every one of the six stages.
- The current stage is a solid ink block; ready stages have a filled number; a blocked stage's number is amber.
- Narrow the window below 820px: the head sticks to the top and shows the payable; the problems list is present and scrolls.
- Both themes.

- [ ] **Step 7: Build and commit**

```bash
npm test && npm run build -w @pes/web
git add web/src/components/RunningHead.tsx web/src/components/Shell.tsx web/src/styles.css
git commit -m "feat(web): a running head, and a rail that reads as an index

Nothing on screen named the contract except one line in a sidebar that a
narrow window takes away. The head carries it on every stage, goes sticky on
a phone, and takes over save state and errors so those stop shifting the page
when they appear.

The rail loses its pills and tinted rows: the current stage is a solid ink
block, and stage state is carried by the number's treatment.

Restores the problem list on mobile. It was display:none under 820px — the
one feature that explains why a bill is provisional, switched off on the
device most likely to be standing in front of the work."
```

---

## Task 4: One application — contracts, login and profile

These three pages are currently a different product from the contract stages: bare `<main>` elements with inline `maxWidth` and padding. 19 inline style objects between them.

**Files:**
- Modify: `web/src/pages/ContractsPage.tsx`, `web/src/pages/LoginPage.tsx`, `web/src/pages/ProfilePage.tsx`, `web/src/App.tsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: `RunningHead` from Task 3; tokens and scales from Task 2.
- Produces: the `.page`, `.page--narrow` and `.page-head` classes, used by no later task but relied on for consistency.

- [ ] **Step 1: Add the page classes**

In `web/src/styles.css`:

```css
/* ---- standalone pages ---------------------------------------------------- */
/* The contracts list, sign-in and account pages. They sit outside the contract
   shell but must not look like a different application. */
.page { max-width: var(--measure); margin: 0 auto; padding: var(--s6) var(--s5) var(--s8); }
.page--narrow { max-width: 380px; padding-top: 12vh; }
.page-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: var(--s4); margin-bottom: var(--s5);
}
```

- [ ] **Step 2: Convert `ContractsPage`**

Replace the opening `<main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 80px' }}>` with `<main className="page">`, and the header row's `<div className="row" style={{ justifyContent: 'space-between', marginBottom: 22 }}>` with `<div className="page-head">`.

Then remove the remaining six inline styles by adding these rules and the matching class names:

```css
.form-bar { display: flex; gap: var(--s4); align-items: flex-end; flex-wrap: wrap; margin-bottom: var(--s4); }
.form-bar .field { flex: 1; min-width: 220px; }
.cell-link { font-weight: 500; }
td.work { max-width: 320px; }
td.actions { text-align: right; }
```

- `<form onSubmit={create} className="panel row" style={{ marginBottom: 18 }}>` → `className="panel form-bar"`, and drop the `style` from its `<label>` and its submit `<button>`.
- `<Link ... style={{ fontWeight: 500 }}>` → `className="cell-link"`.
- `<td style={{ maxWidth: 320 }}>` → `<td className="work">`.
- `<td style={{ textAlign: 'right' }}>` → `<td className="actions">`.

- [ ] **Step 3: Give it a running head**

Above the `page-head`, so the list matches the stages:

```tsx
<RunningHead identity="Price Escalation" sub="Clause-45 billing" />
```

and delete the now-duplicated `<p className="subtitle">Clause-45 billing</p>`.

- [ ] **Step 4: Convert `LoginPage` and `ProfilePage`**

`LoginPage`: `<main style={{ maxWidth: 350, margin: '15vh auto', padding: 20 }}>` → `<main className="page page--narrow">`. The form's `style={{ display: 'grid', gap: 14, marginTop: 26 }}` → `className="panel stack-form"` with:

```css
.stack-form { display: grid; gap: var(--s4); margin-top: var(--s5); }
```

The trailing `<p className="hint" style={{ marginTop: 18 }}>` → `className="hint hint--spaced"` with `.hint--spaced { margin-top: var(--s5); }`.

`ProfilePage`: apply the same treatment — `<main className="page page--narrow">`, a `RunningHead identity="Your account"`, and every inline style replaced by a scale-based class. Read the file and convert all eight.

- [ ] **Step 5: Convert the last inline style in `App.tsx`**

`<main style={{ padding: 24 }}>` on the not-found route → `<main className="page page--narrow">`.

- [ ] **Step 6: Verify and confirm the count is falling**

Run the app and check the contracts list, the sign-in page (sign out to reach it), the create-account toggle, the account page, and a bad URL like `/nope`. Both themes.

Run: `grep -o 'style={{' -r web/src | wc -l`
Expected: 73 or fewer, down from 92.

- [ ] **Step 7: Build and commit**

```bash
npm test && npm run build -w @pes/web
git add web/src/pages/ContractsPage.tsx web/src/pages/LoginPage.tsx \
        web/src/pages/ProfilePage.tsx web/src/App.tsx web/src/styles.css
git commit -m "feat(web): the standalone pages join the same application

The contracts list, sign-in and account pages were bare mains with inline
maxWidth and padding — they did not look related to the contract stages.
They now share the paper, the running head and the table treatment, and the
list reads as the ledger's index page."
```

---

## Task 5: Purge the inline styles from the stages and the bill

The bulk of the sweep: `BillPaper.tsx` alone carries 19 inline style objects.

**Files:**
- Modify: `web/src/pages/MainDataPage.tsx`, `RatesChartPage.tsx`, `IndexAveragePage.tsx`, `BaseRatePage.tsx`, `CalculationPage.tsx`, `PrintPage.tsx`
- Modify: `web/src/components/BillPaper.tsx`, `IndexAverageTables.tsx`, `BaseRateSummary.tsx`, `ScheduleTable.tsx`, `SpanwiseGrid.tsx`, `ComponentTable.tsx`, `PasteBox.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: the `.report` class vocabulary Tasks 7 and 8 style for print.

- [ ] **Step 1: Add the class vocabulary these files need**

```css
/* ---- rhythm -------------------------------------------------------------- */
.section { margin-top: var(--s6); }
.panel + .panel { margin-top: var(--s4); }
.stack-sm { margin-top: var(--s3); }
.stack-md { margin-top: var(--s5); }

/* ---- the report ---------------------------------------------------------- */
.report { font-family: var(--serif); }
.report .paper { background: var(--surface); padding: 0; }
.report h2 { font-family: var(--serif); font-size: var(--t-h2); font-weight: 600; margin: 0; }
.report .component { padding: var(--s5) 0; border-bottom: 1px solid var(--rule); }
.report .component:last-of-type { border-bottom: none; }
.report .meta { font-family: var(--sans); font-size: var(--t-small); color: var(--ink-muted); }
.report .label {
  font-family: var(--sans); font-size: var(--t-micro); letter-spacing: 0.13em;
  text-transform: uppercase; color: var(--ink-faint);
}

.bill-head { border-bottom: 2px solid var(--rule-strong); padding-bottom: var(--s4); margin-bottom: var(--s1); }
.bill-head h2 { font-size: 20px; }
.bill-head .meta { margin: var(--s1) 0 var(--s5); }
/* Fixed three columns, so the particulars land in the same place on every
   bill. An auto-fit grid reflowed them differently as the window changed. */
.bill-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s3) var(--s5); font-size: var(--t-body); }
.bill-fields .wide { grid-column: 1 / -1; }

.bill-total { margin-top: var(--s5); border-top: 2px solid var(--rule-strong); padding-top: var(--s4); }
.bill-total__line { display: flex; justify-content: space-between; gap: var(--s4); padding: 3px 0; }
.bill-total__final {
  display: flex; justify-content: space-between; align-items: baseline; gap: var(--s4);
  border-top: 1px solid var(--rule-strong); margin-top: var(--s3); padding-top: var(--s3);
}
.bill-total__final > span:first-child { font-weight: 600; font-size: var(--t-h2); }
.payable {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: 32px; font-weight: 600; color: var(--ink); letter-spacing: -0.02em;
}
.bill-words { margin: var(--s1) 0 0; text-align: right; font-style: italic; font-size: var(--t-body); }

.sign { margin-top: var(--s8); text-align: right; break-inside: avoid; }
.sign__block { display: inline-block; text-align: center; }
.sign__rule { border-top: 1px solid var(--ink); padding-top: var(--s1); min-width: 250px; }

/* A hand-set figure. Marked rather than coloured: a dagger survives a
   photocopy and a monochrome printer, and an accent does not. */
.overridden { font-style: italic; }
.overridden::after { content: ' †'; font-style: normal; color: var(--ink-muted); }
.footnote { font-family: var(--sans); font-size: var(--t-small); color: var(--ink-muted); margin: var(--s2) 0 0; }

/* The derived average of a quarter. A total is marked by a rule and weight. */
table.grid tfoot td { font-weight: 600; border-top: 1px solid var(--rule-strong); background: var(--surface); height: 40px; }
.tag {
  font-family: var(--sans); font-size: var(--t-micro); font-weight: 600;
  letter-spacing: 0.13em; text-transform: uppercase; color: var(--ink-muted);
  margin-left: var(--s2);
}
```

- [ ] **Step 2: Convert `BillPaper.tsx` — all 19**

Work top to bottom:

- `<header style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 16, marginBottom: 4 }}>` → `<header className="bill-head">`, and drop the `style` from its `<h2>` and its `<p className="meta">`.
- `<div className="grid-fields" style={{ fontSize: 14 }}>` → `<div className="bill-fields">`, and the `<div style={{ gridColumn: '1 / -1' }}>` inside it → `<div className="wide">`.
- The work-done `<span className="num" style={{ textAlign: 'left' }}>` → `<span className="num num--left">`, with `.num--left { text-align: left; }`.
- `<div className="formula-block" style={{ marginTop: 10 }}>` → add `stack-sm`.
- The component total `<div className="spread" style={{ paddingTop: 10 }}>` → `className="spread stack-sm"`; its two `style={{ fontWeight: 600 }}` spans → `className="strong"` with `.strong { font-weight: 600; }`.
- The grand-total `<section style={{ marginTop: 26, borderTop: ..., paddingTop: 16 }} className="component">` → `className="component bill-total"`, its two `.spread` rows → `className="bill-total__line"`, the final row → `className="bill-total__final"`, and the words `<p style={{ ... }}>` → `className="bill-words"`.
- The signature `<section style={{ marginTop: 64, textAlign: 'right' }}>` → `className="component sign"`, its inner div → `className="sign__block"`, its ruled div → `className="sign__rule"`, and the label's `style={{ marginTop: 2 }}` → drop it and let `.label` handle spacing.

- [ ] **Step 3: Retire the accent from `BaseRateSummary` and `IndexAverageTables`**

`BaseRateSummary.tsx` — the two `var(--stamp)` usages become the dagger:

```tsx
<td className={`num${base?.overridden ? ' overridden' : ''}`}>
  {formatComponentIndex(base?.value ?? null, key)}
</td>
```

Delete the separate `<span style={{ color: 'var(--stamp)', ... }}>Overridden</span>` — the dagger says it. Add one footnote under the table:

```tsx
{COMPONENT_KEYS.some((k) => calculation?.bases[k]?.overridden) && (
  <p className="footnote">† Base index set by hand, not taken from the rates chart.</p>
)}
```

Also convert this file's two remaining inline styles: `style={{ marginTop: 28 }}` → `className="section"`, and the `num` span's `textAlign: 'left'` → `className="num num--left"`.

`IndexAverageTables.tsx` — three `var(--stamp)` usages:

```tsx
<th>
  {formatQuarter(q)}
  {q === calculation.baseQuarter && <span className="tag">Base quarter</span>}
</th>
```

and the average row simply drops its colour — `<td>Average</td>` and `<td className="num">` — because `tfoot` now carries the structural rule and the weight that mark a total. Convert its `style={{ marginBottom: 16 }}` to a class too.

- [ ] **Step 4: Convert the remaining files**

Read each and replace every inline style with a scale-based class: `MainDataPage.tsx` (2), `RatesChartPage.tsx` (9), `IndexAveragePage.tsx` (1), `CalculationPage.tsx` (3), `PrintPage.tsx` (1), `ScheduleTable.tsx` (6), `SpanwiseGrid.tsx` (9), `ComponentTable.tsx` (6), `PasteBox.tsx` (6).

Reuse `.section`, `.stack-sm`, `.stack-md`, `.row--tight`, `.num--left` wherever they fit rather than inventing a class per site. The only inline styles allowed to survive are genuinely dynamic ones — `MainDataPage`'s `wide ? { gridColumn: '1 / -1' } : undefined` is computed per call and may stay, though prefer a `wide` class if it reads better.

- [ ] **Step 5: Wire save state into the running head**

Each stage currently renders `<span className="saving">{saver.saving ? 'Saving…' : 'All changes saved'}</span>` in its own header. Now that `RunningHead` owns that, lift it: add `saving` and `error` to `ContractContext` in `ContractLayout.tsx`, have each page report its saver's state up, and delete the per-page `.saving` spans and the trailing `{saver.error && <p className="notice">...</p>}` lines.

Simplest wiring that does not restructure: give `ContractLayout` two pieces of state and expose setters on the context.

```tsx
export interface ContractContext {
  bundle: ContractBundle;
  rates: RateRow[];
  calculation: Calculation | null;
  reload: () => Promise<void>;
  setBundle: (b: ContractBundle) => void;
  /** Reported by whichever stage owns a saver, shown in the running head. */
  reportSave: (saving: boolean, error: string | null) => void;
}
```

In each page with a saver: `useEffect(() => reportSave(saver.saving, saver.error), [saver.saving, saver.error, reportSave]);`. Memoise `reportSave` with `useCallback` in `ContractLayout` so the effect does not loop.

- [ ] **Step 6: Verify — walk every stage**

Run the app on seeded Agreement 168. Visit all six stages in both themes. Check:
- Spacing is even and page-to-page consistent.
- The bill's particulars sit in three fixed columns.
- An overridden base index shows in italic with a dagger, and the footnote appears.
- The Index Average "Average" row reads as a total by rule and weight, with no colour.
- Typing in any grid shows "Saving…" in the running head and no layout shift.

Run: `grep -o 'style={{' -r web/src | wc -l`
Expected: under 10, and every survivor genuinely dynamic.

- [ ] **Step 7: Build and commit**

```bash
npm test && npm run build -w @pes/web
git add web/src
git commit -m "refactor(web): the inline styles resolve to the scale

92 inline style objects became a class vocabulary on the spacing and type
scales. BillPaper alone carried 19, which is why the bill's rhythm never
matched the stages around it.

Retires the accent from the two places it carried meaning: an overridden base
index is now italic with a dagger and a footnote, and a quarter average is
marked by the rule and weight that mark every other total. Both survive a
photocopy; an indigo figure does not.

Save state and errors move to the running head, which reserves their height
so nothing reflows when they appear."
```

---

## Task 6: The remaining entry fixes

**Files:**
- Modify: `web/src/components/SpanwiseGrid.tsx`, `web/src/components/PasteBox.tsx`, `web/src/pages/RatesChartPage.tsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Make the span totals sticky**

`Days allocated — 118 / 120` is in the spanwise table's `<tfoot>`. On a two-year contract that is thirty rows below where the operator is typing, which is exactly the moment the target matters. Pin it to the bottom of the scroll container:

```css
/* The target you are filling against, kept on screen while you fill it. */
.scroller table.grid tfoot td {
  position: sticky; bottom: 0; z-index: 2;
  background: var(--surface); border-top: 1px solid var(--rule-strong);
}
.scroller table.grid tfoot td:first-child { z-index: 3; }
```

The first-child `z-index` is needed because that cell is *also* sticky-left from the base table rules; without it the corner cell loses to the columns sliding under it.

- [ ] **Step 2: Surface the Excel paste**

`PasteBox` is a `<details>` whose summary reads "Paste rows copied from Excel". This application replaces a workbook, so pasting is the primary path for the rates chart, not a footnote. Convert it to a toolbar button that opens an inline panel.

In `PasteBox.tsx`, replace the `<details className="panel">` wrapper with controlled state:

```tsx
const [open, setOpen] = useState(false);
```

```tsx
  return (
    <div className="panel stack-sm">
      <button className="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Close paste box' : 'Paste rows copied from Excel'}
      </button>
      {open && (
        <form onSubmit={submit} className="stack-md">
          {/* body unchanged */}
        </form>
      )}
    </div>
  );
```

Convert this file's six inline styles at the same time: the textarea's inline font becomes `.paste-area { width: 100%; font-family: var(--mono); font-size: var(--t-body); }`, and the rest resolve to `.stack-sm` / `.stack-md`.

- [ ] **Step 3: Verify**

Run the app. On the Rates Chart:
- The paste action is visible without opening anything, and toggles a panel.
- Paste a tab-separated row and confirm it still adds the month.

On Main Data with a long contract (set commencement 2023-09-24 and actual completion well over a year later so the grid exceeds the scroll height):
- Scroll the months grid; the `Days allocated` row stays pinned to the bottom, and its first cell stays pinned to the left corner without columns showing through.

- [ ] **Step 4: Build and commit**

```bash
npm test && npm run build -w @pes/web
git add web/src/components/SpanwiseGrid.tsx web/src/components/PasteBox.tsx \
        web/src/pages/RatesChartPage.tsx web/src/styles.css
git commit -m "feat(web): sticky span totals, and the Excel paste out where it can be seen

The days-allocated target sat in a footer thirty rows below where a long
contract is typed. It now pins to the bottom of the grid.

The paste box was folded inside a collapsed details element. This app
replaces a workbook — pasting is the main path for the rates chart, so it
becomes a visible action."
```

---

## Task 7: The printed set — page furniture and the six defects

**Files:**
- Create: `web/src/sheets.ts`, `web/test/sheets.test.ts`, `web/src/components/SheetFurniture.tsx`
- Modify: `web/src/pages/PrintPage.tsx`, `web/src/print.css`

**Interfaces:**
- Consumes: `formatDate` from `web/src/format.ts` (existing, unmodified — renders `2026-08-31` as `31-Aug-2026`).
- Produces:
  - `sheetLabel(index: number, total: number): string`
  - `provisionalNotice(problemCount: number): string | null`
  - `todayIso(now?: Date): string`
  - `<SheetFurniture index={number} total={number} agreementNo={string} contractor={string} problemCount={number} />`

- [ ] **Step 1: Write the failing test**

Create `web/test/sheets.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionalNotice, sheetLabel, todayIso } from '../src/sheets.ts';

test('sheetLabel counts from one, not from zero', () => {
  assert.equal(sheetLabel(0, 3), 'Sheet 1 of 3');
  assert.equal(sheetLabel(2, 3), 'Sheet 3 of 3');
});

test('sheetLabel takes the total it is given, so adding a sheet cannot make it lie', () => {
  assert.equal(sheetLabel(1, 4), 'Sheet 2 of 4');
});

test('provisionalNotice says nothing about a settled bill', () => {
  assert.equal(provisionalNotice(0), null);
});

test('provisionalNotice keeps its grammar for a single item', () => {
  assert.equal(provisionalNotice(1), 'Provisional — 1 item outstanding');
});

test('provisionalNotice pluralises beyond one', () => {
  assert.equal(provisionalNotice(4), 'Provisional — 4 items outstanding');
});

test('todayIso pads the month and day, so formatDate can split it', () => {
  assert.equal(todayIso(new Date(2026, 0, 5)), '2026-01-05');
});

test('todayIso reads the local date, not UTC', () => {
  // 31 August local, whatever the offset — a bill prepared in the evening in
  // Asia/Kolkata must not print tomorrow's date.
  assert.equal(todayIso(new Date(2026, 7, 31, 23, 30)), '2026-08-31');
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -w @pes/web`
Expected: FAIL — `Cannot find module '../src/sheets.ts'`.

- [ ] **Step 3: Write `web/src/sheets.ts`**

```ts
/**
 * Page furniture for the printed set. `@page { margin: 0 }` suppresses the
 * browser's own header strip — deliberately, so Chrome cannot draw a URL
 * across the sheet — and nothing replaced it, so three sheets came off the
 * printer with no page numbers and no date of preparation.
 */

/** 'Sheet 2 of 3'. The total is passed in, never assumed. */
export function sheetLabel(index: number, total: number): string {
  return `Sheet ${index + 1} of ${total}`;
}

/**
 * The line every sheet of a provisional bill carries in its foot, so a page
 * that gets separated from the set still declares itself.
 */
export function provisionalNotice(problemCount: number): string | null {
  if (problemCount <= 0) return null;
  return `Provisional — ${problemCount} item${problemCount === 1 ? '' : 's'} outstanding`;
}

/**
 * Today as the app writes dates, in local time. `toISOString` would be wrong:
 * it converts to UTC, so a bill prepared after half past five in the evening
 * in Asia/Kolkata would print the previous day.
 */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -w @pes/web`
Expected: PASS, 7 new.

- [ ] **Step 5: Write the furniture component**

Create `web/src/components/SheetFurniture.tsx`:

```tsx
import { formatDate } from '../format.ts';
import { provisionalNotice, sheetLabel, todayIso } from '../sheets.ts';

/**
 * Rendered inside each .sheet, once at the top and once at the foot.
 *
 * Known limitation: this is per-sheet, so a sheet that overflows onto a second
 * physical page carries the furniture on its first page only. Chrome does not
 * support @page margin boxes, and a position:fixed element repeats identical
 * content on every page — which would print the wrong sheet number. If a sheet
 * starts overflowing, reduce that sheet's density; do not reach for fixed.
 */
export function SheetFurniture({
  index, total, agreementNo, contractor, problemCount,
}: {
  index: number;
  total: number;
  agreementNo: string;
  contractor: string;
  problemCount: number;
}) {
  const notice = provisionalNotice(problemCount);
  return (
    <>
      <div className="sheet-head">
        <span>
          <strong>{agreementNo || 'Untitled contract'}</strong>
          {contractor && <> · {contractor}</>}
        </span>
        <span>Price escalation · Clause-45</span>
      </div>
      <div className="sheet-foot">
        <span>{notice ?? agreementNo || 'Untitled contract'}</span>
        <span>{sheetLabel(index, total)} · prepared {formatDate(todayIso())}</span>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Mount it on the three sheets**

In `web/src/pages/PrintPage.tsx`, wrap each sheet's content. The total comes from a constant declared beside the sheets so adding a fourth cannot make the numbering lie:

```tsx
const SHEETS = 3;
```

Each section becomes, for example:

```tsx
<section className="sheet">
  <SheetFurniture index={0} total={SHEETS}
                  agreementNo={bundle.contract.agreementNo}
                  contractor={bundle.contract.contractor}
                  problemCount={calculation.problems.length} />
  <div className="sheet__body">
    <h2 className="sheet__title">Index Average</h2>
    <IndexAverageTables />
  </div>
</section>
```

The agreement number moves out of the sheet titles — the running head carries it on every sheet now, so repeating it in the title is noise.

- [ ] **Step 7: Rewrite `print.css`**

Keep the palette pin exactly as it is — dark mode still exists, so a bill printed from it must still come out on white paper, and the `:root:root:root` tripling is still needed because this file is bundled before `styles.css`. Update the token names to match Task 2 (`--stamp` → `--accent`, `--on-stamp` → `--on-accent`) and add the new rules:

```css
/* ---- sheet furniture (screen and paper) ---------------------------------- */
.sheet-head, .sheet-foot {
  display: flex; justify-content: space-between; gap: var(--s4);
  font-family: var(--sans); font-size: var(--t-small); color: var(--ink-muted);
}
.sheet-head { border-bottom: 1px solid var(--rule); padding-bottom: var(--s2); margin-bottom: var(--s4); }
.sheet-foot { border-top: 1px solid var(--rule); padding-top: var(--s2); margin-top: var(--s5); }
.sheet-head strong { color: var(--ink); }
.sheet { display: flex; flex-direction: column; }
.sheet__body { flex: 1; }
```

Inside `@media print`, add to the existing block:

```css
  /* Sticky is a screen affordance. Left in place it hazards a table that
     splits across pages, and it is what stops thead repeating reliably. */
  table.grid thead th,
  table.grid tbody td:first-child,
  table.grid tfoot td,
  table.grid tfoot td:first-child,
  .running-head {
    position: static !important;
  }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }

  /* A row cut in half by a page break is unreadable and unfileable. */
  tr, .sign, .sheet-head, .sheet-foot { break-inside: avoid; }

  /* Screen chrome does not print: the sheets are ruled tables, not cards. */
  .panel { border: none !important; border-radius: 0 !important; background: none !important; padding: 0 !important; }
  .running-head, .no-print { display: none !important; }

  /* Each sheet fills its page so the foot lands at the bottom, not under
     whatever content happened to end. */
  .sheet { min-height: calc(297mm - 32mm); }
```

Note `.running-head` appears in both the `position: static` list and the `display: none` list — the second wins and the first is harmless; keep both so the intent survives a later edit that un-hides it.

- [ ] **Step 8: Measure the formula block against A4 — this is the one that can bite**

`.formula-block` is a 15-column grid at 12.5px monospace, and print sets `overflow: visible`, so anything too wide now runs off the sheet instead of scrolling.

Open the print preview for seeded Agreement 168 and look at the third sheet. With 14mm side margins there is about 182mm of usable width.

If any formula line is clipped at the right edge, reduce the block's print type size — add inside `@media print`:

```css
  .formula-block { font-size: 11px; }
  .f-op { padding: 7px 3px; }
  .f-amount { padding-left: 14px; }
```

and re-check. Record in the commit message what you measured and whether the reduction was needed.

- [ ] **Step 9: Verify the whole set**

Print-preview Agreement 168 and confirm, on paper:
1. Head and foot appear on **all three** sheets.
2. The foot reads `Sheet 1 of 3 · prepared 31-Aug-2026` and so on.
3. No sheet overflows onto a second page. If Index Average does, reduce its density — do not reach for `position: fixed`.
4. No table row is cut by a page break.
5. A table that splits repeats its header.
6. No rounded panel borders anywhere.
7. **The payable reads ₹1,72,604.** This is the gate.

Then switch the app to dark mode and preview again — it must still print black on white.

- [ ] **Step 10: Commit**

```bash
npm test && npm run build -w @pes/web
git add web/src/sheets.ts web/test/sheets.test.ts web/src/components/SheetFurniture.tsx \
        web/src/pages/PrintPage.tsx web/src/print.css
git commit -m "feat(web): page furniture and six fixes for the printed set

@page{margin:0} suppresses Chrome's own header strip, correctly — but nothing
replaced it, so three sheets came off the printer with no page numbers and no
date of preparation. Each sheet now carries a running head and foot.

Also: sticky positioning no longer leaks into print, where it hazarded a
split table and stopped thead repeating; rows and the signature block are
protected from page breaks; and the Index Average sheets print as ruled
tables rather than rounded cards.

todayIso reads local time — toISOString would print tomorrow's date for a
bill prepared after 17:30 in Asia/Kolkata."
```

---

## Task 8: The provisional ruled band

Today the only thing separating a provisional bill from a final one is the label text in `BillPaper.tsx`. Chosen over a watermark: a watermark depends on the browser's "Print backgrounds" setting being ticked and dithers on a mono laser.

**Files:**
- Modify: `web/src/components/BillPaper.tsx`, `web/src/pages/PrintPage.tsx`, `web/src/print.css`

**Interfaces:**
- Consumes: `provisionalNotice` from Task 7.

- [ ] **Step 1: Style the band**

In `web/src/print.css`, beside the furniture rules:

```css
/* Ink on paper, no tint and no background graphic: a band survives a browser
   with "Print backgrounds" unticked and a photocopier, and a watermark does
   not. */
.provisional-band {
  display: flex; justify-content: space-between; align-items: center; gap: var(--s4);
  border: 2px solid var(--rule-strong);
  padding: var(--s2) var(--s3); margin: 0 0 var(--s4);
  font-family: var(--sans); break-inside: avoid;
}
.provisional-band__word {
  font-weight: 700; font-size: var(--t-small);
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink);
}
.provisional-band__detail { font-size: var(--t-small); color: var(--ink); }
```

- [ ] **Step 2: Render it on the first sheet**

In `PrintPage.tsx`, immediately after the first sheet's `SheetFurniture`:

```tsx
{provisional && (
  <div className="provisional-band">
    <span className="provisional-band__word">Provisional</span>
    <span className="provisional-band__detail">
      {calculation.problems.length} item{calculation.problems.length === 1 ? '' : 's'} outstanding — not for payment
    </span>
  </div>
)}
```

The foot's `Provisional — n items outstanding` on every sheet already comes from `SheetFurniture`, which is the half that matters if a page is separated.

- [ ] **Step 3: Add it to the standalone Calculation stage too**

`CalculationPage` renders `BillPaper` on its own, outside the print set. Render the same band at the top of `BillPaper` when `provisional` is true, so the Calculation stage and the printed sheet agree. Guard against printing it twice on sheet 3 by giving `BillPaper` a prop:

```tsx
export function BillPaper({ showBand = true }: { showBand?: boolean }) {
```

and pass `showBand={false}` from `PrintPage`'s third sheet, where the set's own band on sheet 1 already covers the document.

- [ ] **Step 4: Verify both states**

Make a contract provisional — the simplest way is to clear one month's figures from the rates chart so a `missing_rates` problem appears.

- Print-preview: the band sits under the head on sheet 1, and all three feet read `Provisional — n items outstanding`.
- The payable is labelled "Provisional amount of this bill".
- Untick "Print backgrounds" in the print dialog and preview again — the band must still be fully visible.
- Restore the rates figures and confirm the band and the notices disappear, and the payable returns to ₹1,72,604.

- [ ] **Step 5: Commit**

```bash
npm test && npm run build -w @pes/web
git add web/src/components/BillPaper.tsx web/src/pages/PrintPage.tsx web/src/print.css
git commit -m "feat(web): mark a provisional bill so it cannot be mistaken

One word in a label was the only thing separating a provisional bill from a
final one on paper. A ruled band now sits under the head of the first sheet,
and every sheet's foot carries the count — so a page separated from the set
still declares itself.

Ink on paper rather than a watermark: it survives a browser with print
backgrounds unticked, and it does not dither on a mono laser."
```

---

## Task 9: The verification pass

Not a code task. This is what decides whether the redesign is done, and it must actually be performed rather than asserted.

**Files:** none — findings only. Any defect found becomes a fix commit here.

- [ ] **Step 1: Green the automated suites**

```bash
npm test
npm run build
```

Expected: engine 45, server 53, web 43 + 21 new = 64. Build clean.

Record the real numbers. **A green run proves the logic still works and says nothing about the interface** — do not report it as evidence the redesign is correct.

- [ ] **Step 2: Bring up a real database**

```bash
docker run -d --name pes-pg \
  -e POSTGRES_PASSWORD=pes -e POSTGRES_USER=pes -e POSTGRES_DB=pes \
  -p 55432:5432 postgres:17-alpine
docker exec pes-pg psql -U pes -d pes -c "CREATE DATABASE pes_test;"
npm run seed
npm run dev:server   # and npm run dev:web alongside
```

- [ ] **Step 3: Walk every screen, in both themes, at two widths**

Nine screens: contracts list, sign-in, create-account, account, and the six contract stages. Two themes. Desktop (1440px) and phone (390px). Screenshot each and keep them.

Check on every screen: no element invisible; no horizontal page scroll; no third rule weight; no rounded card; spacing consistent with its neighbours.

- [ ] **Step 4: The keyboard test**

On Main Data, fill a full column of days using only the keyboard. Then Left and Right across the span columns, and Up back to the start. Repeat on the rates chart. On Base Rate, confirm the select still owns its vertical arrows.

- [ ] **Step 5: The figures gate**

On seeded Agreement 168, confirm the payable is **₹1,72,604** on the rail, the Calculation stage and the printed bill. If it is not, stop — something in this redesign moved a figure, and that is a blocking defect, not a polish item.

- [ ] **Step 6: The print gate**

Print-preview the three-sheet set. Confirm the seven checks from Task 7 Step 9, then repeat from dark mode, then repeat for a deliberately provisional bill with "Print backgrounds" unticked.

- [ ] **Step 7: Confirm the sweep is complete**

```bash
grep -o 'style={{' -r web/src | wc -l      # expect under 10, all dynamic
grep -nE '#[0-9A-Fa-f]{3,8}' web/src --include='*.tsx' -r   # expect no matches
grep -c 'stamp' web/src/styles.css web/src/print.css        # expect 0 and 0
```

- [ ] **Step 8: Report honestly**

Write up what was verified, what was not, and anything left broken. If a step was skipped — no Docker available, a printer behaviour untestable — say so plainly rather than implying coverage that does not exist.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "chore(web): verification pass for the ledger redesign

Walked nine screens in both themes at two widths, exercised every grid by
keyboard alone, and print-previewed the three-sheet set from both themes and
in both settled and provisional states.

Agreement 168 still pays ₹1,72,604."
```

---

## Self-Review

Run against the spec:

**Spec coverage.** §3.1 tokens → Task 2. §3.2 accent and state, including all five `--stamp` sites → Tasks 2 and 5. §3.3 scales → Task 2. §3.4 typography → Task 2. §4.1 running head → Task 3. §4.2 one application → Task 4. §4.3 rail → Task 3. §4.4 density and measure → Task 2 (measure) and Task 3 (row height). §5.1 grid keys → Task 1. §5.2 sticky span totals → Task 6. §5.3 paste → Task 6. §5.4 mobile problems → Task 3 Step 5. §5.5 save state and errors → Tasks 3 and 5. §6 preserved behaviour → guarded by Task 9's walk. §7.1 all six print defects → Task 7 (defects 1, 2, 3, 4, 6) and Task 8 (defect 5). §7.2 furniture → Task 7. §7.3 sheet layout → Tasks 5 and 7. §7.4 provisional band → Task 8. §9 verification → Task 9.

No gaps.

**Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N". Every code step carries the actual code. The two files that are read-and-convert rather than shown line-by-line — `ProfilePage.tsx` in Task 4 Step 4 and the nine files in Task 5 Step 4 — name the exact class vocabulary to convert into and the exact count to expect, which is the honest way to specify a mechanical sweep without transcribing 400 lines.

**Type consistency.** `caretEdges` / `nextCell` / `useGridKeys` signatures in Task 1's interface block match the code in Step 4 and the tests in Step 2. `sheetLabel` / `provisionalNotice` / `todayIso` match across Task 7's interface block, tests, implementation and `SheetFurniture`. `reportSave` is declared in Task 5 Step 5 and used only there. `RunningHead`'s props match between Task 3 Step 1 and its two call sites in Tasks 3 and 4. `BillPaper`'s new `showBand` prop is declared and passed in Task 8 Step 3.

**One deliberate deviation from the spec, flagged for the reader:** §5.1 says "the hook's behaviour is not changed. It is correct." Reading it closely showed it is not — `selectionStart` is undefined for `input[type=number]`, so horizontal navigation has almost certainly never worked. Task 1 Step 1 verifies this in a browser before Step 4 changes it. If the spec is right and the bug does not reproduce, the fix is still correct and still lands.
