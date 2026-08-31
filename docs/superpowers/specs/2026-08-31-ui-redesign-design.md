# UI Redesign — The Ledger

**Date:** 2026-08-31
**Status:** Approved for planning
**Scope:** `web/` only. The engine, the server, the API and the database are untouched.

## 1. Problem

The application works and its calculations are verified, but the interface reads as
unfinished. Asked what was wrong, the operator named all four available complaints at
once: it looks plain, it is cramped and hard to read, data entry is slow, and it is hard
to navigate.

Reading the code confirms specific causes rather than a general lack of polish:

- **No spacing scale.** There are **92** inline `style={{ ... }}` objects across the TSX —
  `BillPaper.tsx` alone carries 19, `RatesChartPage.tsx` and `SpanwiseGrid.tsx` 9 each.
  Vertical rhythm is improvised per page, which is the single largest contributor to
  "looks unfinished".
- **Two visual identities.** `ContractsPage` is a bare `<main>` with `maxWidth: 1000` and
  inline padding; every contract stage is a sidebar shell. They do not look related.
- **Uniform density.** Everything is a `.panel`. Nothing but a serif heading signals
  hierarchy, so nothing on a page looks more important than anything else.
- **One grid has keyboard navigation; the others do not.** `useGridKeys` lives inside
  `RatesChartPage.tsx` and is used by that page alone. The spanwise grid — the operator's
  named pain point — has none.
- **Mobile is a subtraction.** `.problems { display: none }` under 820px switches off the
  feature that explains why a bill is provisional.
- **The printed set has real defects**, catalogued in §7.

What the existing code gets right, and which this redesign keeps: a disciplined token
layer with no literal colours outside it, a three-state System/Light/Dark theme, the
`.formula-block` matrix that makes an escalation line auditable, and the print machinery
that pins the palette to white and breaks the set onto three A4 sheets.

## 2. Direction

**The Ledger.** Warm paper, serif figures, hairline rules, no boxes and no shadows.
Structure comes from rules and alignment, the way a bound account book does it. Chosen
from three mocked directions; the alternatives were a cool-grey card-based "console" and a
navy-chromed "institutional" layout.

Two consequences follow, and both are load-bearing:

1. **Colour is reserved for meaning.** The indigo accent is retired. Emphasis is carried by
   weight and rule. Colour appears only for state: settled, provisional, recovery.
2. **Screen and paper converge.** The app's actual output is three sheets that get filed.
   In this direction the screen and the printed sheet are the same object, so there is no
   translation step where surprises hide.

The six-stage split (Main Data → Rates Chart → Index Average → Base Rate → Calculation →
Print bill) is confirmed as correct and is retained. The navigation is restyled, not
restructured.

## 3. The token layer

Replaces the values in `web/src/styles.css`. The structure of that file — light block,
`prefers-color-scheme` block guarded by `:root:not([data-theme='light'])`, and an explicit
`[data-theme='dark']` block — is correct and is kept as is.

### 3.1 Ground and ink

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#FBFAF7` | `#1A1815` | The page |
| `--surface` | `#FBFAF7` | `#1A1815` | Same as paper — the ledger draws no cards |
| `--sunk` | `#F3F1EA` | `#211F1B` | Banded rows, computed surfaces |
| `--stripe` | `#F7F5EE` | `#1E1C19` | Zebra stripe, opaque (sticky first column) |
| `--hover` | `#F0EDE4` | `#252220` | Row hover |
| `--ink` | `#1B1A17` | `#EDE9DF` | Figures and body |
| `--ink-muted` | `#6B6555` | `#A9A192` | Labels, subtitles |
| `--ink-faint` | `#A8A091` | `#7D766A` | Placeholders, disabled |
| `--rule` | `#EAE6DB` | `#2E2A24` | Hairline, between rows |
| `--rule-strong` | `#1B1A17` | `#EDE9DF` | Structural, under section and table heads |

The dark palette is deliberately **warm** charcoal, not the blue-grey in the current file.
A cool dark under a warm light theme reads as two different products.

**Two rule weights, and only two.** Hairline marks repetition; structural marks structure.
Nothing else draws a box. This is the rule that makes the design read as a ledger, and it
is the one most likely to erode — a reviewer should treat any third rule weight, any
`border-radius` above 2px, and any `box-shadow` as a defect.

### 3.2 Accent and state

`--stamp` is renamed `--accent` and becomes ink itself (`--ink` in both themes), with
`--on-accent` its inverse. Buttons become solid ink blocks with paper-coloured text; links
are ink with an underline; the focus ring is ink. `--stamp-wash` is dropped — the current
stage in the rail is marked by a solid ink block, as mocked.

State colours are retained, retuned warm:

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--ok` / `--ok-wash` | `#1F5C3D` / `#E6EFE7` | `#7FBE9B` / `#16241C` | Settled |
| `--warn` / `--warn-wash` | `#7A4E10` / `#F6EDD9` | `#D7A45C` / `#2A2114` | Provisional |
| `--recovery` / `--recovery-wash` | `#8E2A1E` / `#F6E6E2` | `#E08A7E` / `#2B1714` | Negative / recovery |

Retiring the accent means retiring colour-as-emphasis. `--stamp` is referenced in exactly
five places in the TSX, and each needs a replacement that carries the same meaning without
the colour:

| Where | Today | New |
|---|---|---|
| `BaseRateSummary.tsx:80,83` — overridden base index | `--stamp` text | Italic figure with a dagger (`†`), plus a footnote under the table |
| `IndexAverageTables.tsx:58,66` — the "Average" row | `--stamp` label and figures | Structural rule above the row and semibold weight — it is a total, and the ledger marks totals with a rule |
| `IndexAverageTables.tsx:34` — "Base quarter" tag | `--stamp` inline text | Small-caps sans tag in `--ink-muted` beside the quarter |

The dagger convention is chosen because it is legible in monochrome, survives a
photocopy, and prints correctly without depending on colour reaching the paper.

### 3.3 The scales

Both are new; their absence is the main cause of drifting rhythm.

```
--s1: 4px    --s2: 8px    --s3: 12px   --s4: 16px
--s5: 24px   --s6: 32px   --s7: 48px   --s8: 64px
```

```
--t-micro:  10px   uppercase labels, 0.13em tracking
--t-small:  12px   hints, echoes, metadata
--t-body:   14px   tables          (unchanged)
--t-base:   15.5px body            (was 15px — density complaint)
--t-h2:     18px   section heads
--t-h1:     26px   page titles     (was 30px — the running head takes the weight)
```

Table type deliberately does **not** shrink. The operator's complaint was that the app is
cramped and hard to read; buying whitespace by reducing the figures would answer the wrong
half of it. Room is bought in row height and gutters instead (§4.4).

Every inline margin/padding in the TSX resolves to a scale step or is deleted. No
`style={{ ... }}` object may survive that expresses spacing, width, or colour; the
exceptions are genuinely dynamic values (a computed `gridColumn`, a measured width).

### 3.4 Typography

Unchanged families — IBM Plex Serif for headings and figures of consequence, IBM Plex Sans
for labels and interface, IBM Plex Mono for tabular figures. The preconnect and stylesheet
link in `web/index.html` stay as they are. What changes is the assignment: the serif takes
more work (page titles, the payable, sheet titles), the sans retreats to labels and
controls.

## 4. Layout and navigation

### 4.1 The running head

A slim line at the top of the main column, present on **every** stage, carrying the
agreement number, the contractor, and the save state, with a structural rule beneath it.
The ledger's answer to the identity problem: a bound book puts the chapter on every page.

This solves a real defect — today nothing on screen names the contract except one line in
a sidebar that disappears on narrow screens. On mobile the running head is what goes
sticky, and it carries the payable and the problem count with it.

New component: `web/src/components/RunningHead.tsx`.

### 4.2 One application, not two

`ContractsPage` and `ProfilePage` adopt the same paper, the same running-head pattern (for
them: the application name and the account), and the same table treatment as the contract
stages. The contracts list becomes the ledger's index page.

### 4.3 The rail

Six stages, restyled as an index: numbers in their own column, hairlines between, the
current stage a solid ink block. Stage state is carried by the number's treatment rather
than by colour —

| State | Treatment |
|---|---|
| Ready | Number filled: ink ground, paper digit |
| Current | Whole row a solid ink block |
| Blocked | Number outlined in `--warn`, digit in `--warn` |
| Not reached | Number outlined in `--rule-strong`, digit `--ink-faint` |

The running payable block keeps its position and its logic (`--ok` when settled, `--warn`
when provisional, faint when empty) but loses its border-radius and card border in favour
of a structural rule above it.

### 4.4 Density and measure

| | Now | New |
|---|---|---|
| Table row height | 36px | 40px |
| Table row height, ≤820px | 42px | 44px |
| Body type | 15px | 15.5px |
| Table type | 14px | 14px, with wider gutters |
| `--measure` | 1120px | 1240px |

The rates chart is seven numeric columns and currently scrolls sideways on a laptop; the
wider measure is aimed squarely at that. Breathing room is bought in the gutters rather
than in row height, so a 39-row chart does not become a scrolling chore.

## 5. Data entry

Four fixes, in the priority the operator gave them.

### 5.1 Keyboard navigation everywhere (the named pain point)

`useGridKeys` — arrows between cells, Enter down a column, left/right deferring to the
caret while there is text to move through — is extracted from `RatesChartPage.tsx` to a new
`web/src/grid.ts` and applied unchanged to:

- `SpanwiseGrid` (months × 4 spans) — **the operator's named pain point**
- `ComponentTable` (6 components × share/factor/override)
- `ScheduleTable` (months × adjustment)
- `RatesChartPage`, which keeps its current behaviour

The hook's behaviour is not changed. It is correct; it was simply trapped in one file.

`ComponentTable` mixes `<input>` and `<select>` in one row, so the extracted hook must
match both rather than `input[data-r]` alone.

### 5.2 Span totals visible while typing

`Days allocated — 118 / 120` currently lives in the table footer. On a five-month contract
that is fine; on a two-year contract it is thirty rows below where the operator is typing.
The footer row becomes sticky to the bottom of the grid's scroll container, so the target
being filled against stays on screen. Over-allocation already renders in `--recovery`;
that is retained.

### 5.3 Surface the Excel paste

This application replaces a workbook, so pasting rows *is* the primary path for the rates
chart — yet `PasteBox` is folded inside a collapsed `<details>` that most operators never
open. It becomes a visible action in the chart's toolbar, opening an inline panel.

### 5.4 Stop hiding problems on mobile

`.problems { display: none }` under 820px is deleted. The problem list is the feature that
explains why a bill is provisional and links to the stage that owns each problem; switching
it off on a phone removes the app's best affordance. It becomes a count in the sticky
running head that expands on tap.

### 5.5 Save state and errors

`saver.saving` is currently rendered as 12px grey text in a page corner, and errors as
`.notice` paragraphs inserted inline, which shift the layout when they appear. Both move
into the running head, which reserves space for them so nothing reflows.

## 6. What is explicitly preserved

Enumerated because a redesign is exactly where hard-won behaviour gets lost:

- The three-state System/Light/Dark theme and `web/src/theme.ts` in full, including the
  guarded `localStorage` access.
- Opaque zebra striping and the sticky first column — a translucent stripe lets the
  scrolling columns show through the sticky cell.
- The `table.grid th.r` / `td.r` specificity fix, and the `td:has(> input.cell)` padding
  removal that aligns editable columns with their headings.
- The 16px input floor under 820px, which stops iOS zooming on focus.
- `settled` flash on derived cells, and its `prefers-reduced-motion` suppression.
- Inline row-level confirmation for destructive actions instead of `confirm()`.
- `month--needed` marking on rates rows this bill depends on, and `cell--missing` on gaps.
- The `?focus=` deep link from a problem to the rates rows it names.

## 7. The printed set

Print moves from "preserved" to "redesigned" at the operator's request.

### 7.1 Defects in what prints today

| # | Defect | Evidence |
|---|---|---|
| 1 | No page numbers, no date of preparation | `@page { margin: 0 }` suppresses the browser strip, and nothing replaces it |
| 2 | Sticky positioning leaks into print | `thead th` and `td:first-child` are `position: sticky`; `print.css` never resets them |
| 3 | Table rows can be cut by a page break | `break-inside: avoid` is set on `.report .component` only, not on `tr` |
| 4 | The formula block may run off the sheet | 15-column grid at 12.5px mono; print sets `overflow: visible`, so excess width now clips instead of scrolling |
| 5 | A provisional bill looks like a final one | The only difference is the label text in `BillPaper.tsx` |
| 6 | Screen chrome prints | Index Average sheets print as bordered, rounded `.panel` boxes |

### 7.2 Page furniture

Every sheet gains a **running head** (agreement number and contractor, left; "Price
escalation · Clause-45", right) and a **running foot** (agreement number, left; `Sheet n of
m · prepared 31 August 2026`, right), separated from the body by hairlines.

`m` is derived from the number of `.sheet` elements rendered, not hardcoded to 3, so the
set stays correct if a sheet is ever added. The preparation date is taken at render.

**Known limitation, stated deliberately:** the furniture is rendered per `.sheet`, so a
sheet that overflows onto a second physical page carries head and foot on its first page
only. CSS `@page` margin boxes are not supported in Chrome, and the `position: fixed`
alternative repeats identical content on every page, which would print the wrong sheet
number.

> **Amended 2026-08-31, after printing Agreement 168.** This section assumed three sheets
> meant three pages. They do not. Base Rate just overruns A4, and the Calculation needs two
> pages for six components — the first attempt printed a six-page PDF, three pages of
> content and three blank but for a footer, because a `min-height` forcing each sheet to a
> full page pushed the foot of any over-long sheet onto a page of its own.
>
> **A sheet is a named section of the filed set, not a page.** There is no `min-height`;
> each sheet's foot sits directly under the content it closes, and `Sheet n of 3` names the
> section rather than claiming a page count. Reducing density to force one page per sheet
> was considered and rejected: it would shrink the figures on the densest sheet and would
> break again on any contract with more months than this one.
>
> Measured, not guessed: at the screen's 12.5px the widest formula line of Agreement 168 is
> ~709px against ~688px of usable A4 width at 14mm margins, so it would have run off the
> sheet. The widest lines are bitumen, whose index is a rupee rate per tonne and so carries
> grouping and paise where the other five carry two decimals. Print sets the block to
> 11.5px with tightened operator gutters, bringing it to ~624px.

**A seventh defect, found only by printing.** The Schedule of payment rendered its
Adjustment column as editable `<input>` elements on paper, showing a raw `500000` beside a
grouped `22,14,599.00` in the next column. `BaseRateSummary` already had the right pattern —
it drops its Override column in print — and `ScheduleTable` now follows it. A filed bill
must record the figure, never the means of changing it.

### 7.3 Sheet layout

- Particulars move from an auto-fit `grid-fields` to a fixed three-column block, so the
  fields land in predictable places on every bill.
- The totals block is pinned to the foot of the sheet above the signature rather than
  floating wherever the content ends.
- Panels lose border, radius and background in print; they become ruled tables.
- `thead` is reset to `position: static` and left as `table-header-group`, so headers
  repeat on a table that splits.
- `tr { break-inside: avoid }`.
- The contractor signature block is unchanged in content — the operator confirms a single
  contractor signature is what the department requires — but is protected from orphaning
  onto a page of its own.

### 7.4 Provisional marking — the ruled band

Chosen over a diagonal watermark, because a watermark depends on the browser's "Print
backgrounds" setting being ticked and dithers on a mono laser.

- A band bounded by a structural rule sits under the running head on the **first** sheet:
  `PROVISIONAL` in tracked uppercase, left; `n items outstanding — not for payment`, right.
- The payable is labelled "Provisional amount of this bill" (existing behaviour, retained).
- The running foot of **every** sheet carries `Provisional — n items outstanding`, so a
  page separated from the set still declares itself.

All three are ink on paper. No tint, no background graphic, no browser setting required.

## 8. Files

**New**

| File | Purpose |
|---|---|
| `web/src/grid.ts` | `useGridKeys`, extracted from `RatesChartPage.tsx` |
| `web/src/components/RunningHead.tsx` | Running head for screen |
| `web/src/components/SheetFurniture.tsx` | Running head and foot for print sheets |

**Rewritten**

`web/src/styles.css` (token layer, scales, class vocabulary), `web/src/print.css`.

**Edited** — inline styles removed, new classes and components adopted:

`App.tsx`, `ContractLayout.tsx`, `components/Shell.tsx`, `ProblemList.tsx`,
`ComponentTable.tsx`, `SpanwiseGrid.tsx`, `ScheduleTable.tsx`, `BaseRateSummary.tsx`,
`IndexAverageTables.tsx`, `BillPaper.tsx`, `FormulaStrip.tsx`, `PasteBox.tsx`,
`Spinner.tsx`, `ThemeToggle.tsx`, `PrintButton.tsx`, and all nine files under `pages/`.

**Untouched:** `engine/`, `server/`, `web/src/api.ts`, `format.ts`, `months.ts`,
`password.ts`, `paste.ts`, `problems.ts`, `readiness.ts`, `theme.ts`, and every test.

## 9. Verification

The 43 web tests are logic-only — `format`, `readiness`, `months`, `password`, `paste`,
`problems`. **None render DOM.** A visual redesign therefore cannot break them, and equally
they provide no safety net. This is stated plainly so that a green test run is not mistaken
for evidence that the interface works.

Verification is therefore manual and must actually be performed:

1. `npm test` and `npm run build` after each stage — catches TypeScript and logic
   breakage only.
2. Bring up the Docker Postgres from the README, `npm run seed`, run the application.
3. Walk all six stages plus the contracts list, the login page and the profile page, in
   **light and dark**, at desktop and phone widths. Screenshot each.
4. Verify keyboard navigation by entering a month of days in the spanwise grid using the
   keyboard alone, without touching the mouse.
5. Print-preview the three-sheet set for Agreement 168 and confirm: the payable is
   ₹1,72,604 unchanged, the formula block fits within the A4 text width, no row is cut by
   a page break, and head and foot appear on all three sheets.
6. Print-preview a deliberately provisional bill and confirm the band and the foot notice.

Item 5 is the one that matters most: the calculation is verified against the original
workbook to the paisa, and no part of this redesign may alter a figure.

## 10. Out of scope

- Any change to the engine, the server, the API, or the database schema.
- The six-stage navigation structure (confirmed correct).
- Departmental signature blocks beyond the contractor (confirmed not required).
- Adding DOM or visual-regression tests. Worth doing, but it is its own piece of work and
  bundling it here would double the size of this change.
- Print output for the Rates Chart and Main Data stages. Those carry `PrintButton` today
  and will continue to print acceptably, but the three-sheet filed set is what this
  section designs.
