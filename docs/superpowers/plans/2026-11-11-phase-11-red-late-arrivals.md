# Phase 11 — Red Late Arrivals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Day-shift A.M. and P.M. arrivals later than on-duty + office grace show in red on screen, print, PDF, and office batches.

**Architecture:**
- `computeDtr` adds `row.late`, a list of the arrival cells (`amIn`, `pmIn`) that are late. Late = arrival − on-duty > grace (`isLate`, which `session` and `nightShift` also use). It is set from the arrival alone, so a late arrival with no departure is still red. Night-shift sessions never add to it. Undertime math is unchanged.
- `DtrForm`'s `cls` adds `late` when `r.late` includes the cell, next to `adjusted`.
- `dtr-form.css`: `.dtr-form .grid td.late { color: #d00; }`. Text color prints without `printBackground`, so no print rule is needed. The print rule that clears the `adjusted` tint does not touch color.
- No change to the store, IPC, saved data, or `showTotals`.

**Spec:** `spec.md` US-15.

## Hand-derived values (HRMO (3).xls, LAZARO 611, July 2026)

- 7/08 A.M. in 08:18, on-duty 08:00 → 18 > 0 and > 15: red at any grace up to 17.
- 7/06 A.M. in 08:08, P.M. in 13:06 → 8 and 6: red at grace 0, black at grace 15.
- Departures of the same days: black.
- RONIE 568 7/01 A.M. in 08:00 → 0: black.
- EFREN 479 (`NIGHT_shift.xls`) 9/02 P.M. in 17:12 → 12 min late, but night shift: black.

## Tasks

### Task 1: unit tests first (red)

**Files:** `test/dtr.test.js`.

- [ ] LAZARO grace 0: row 8 `late` = `['amIn']`, row 6 `late` = `['amIn', 'pmIn']`. Grace 15: row 6 `late` = `[]`, row 8 = `['amIn']`.
- [ ] RONIE row 1 `late` = `[]`. EFREN 9/02 `late` = `[]` at grace 0.
- [ ] Undertime and days for LAZARO unchanged (existing tests stay green).

### Task 2: compute + render

**Files:** `src/lib/dtr.js`, `src/DtrForm.jsx`, `src/dtr-form.css`.

- [ ] `row.late` in `computeDtr`. `late` class in `cls`. Red rule in CSS. Unit green. Mutation check (drop grace from the late test, mark night rows).

### Task 3: E2E (red first by removing the CSS rule)

**Files:** `test/e2e/phase11.spec.js`.

- [ ] US-15: import HRMO, open LAZARO 1–15. Computed color of 7/08 A.M. arrival is `rgb(221, 0, 0)`. 7/06 A.M. and P.M. arrivals red. Departures and RONIE 7/01 `8:00` are `rgb(0, 0, 0)`.
- [ ] Same under `emulateMedia({ media: 'print' })`, with totals hidden (default) and shown.
- [ ] Export PDF (mocked save): the inflated page streams contain the red fill color `0.866667 0 0 rg` (#d00). An on-time-only DTR (RELITA) has none.
- [ ] Print office (mocked `webContents.print`): the `.print-batch` LAZARO page has red cells.
- [ ] Adjust 7/02 A.M. arrival to 08:30: the cell has both `adjusted` (yellow tint) and red text.
- [ ] Set HRMO grace to 15: 7/06 arrivals black, 7/08 still red.
- [ ] Import `NIGHT_shift.xls`, EFREN Sept 1–15: no cell is red.

## Test scope

```
Feature: Phase 11, US-15
Feature tests: unit dtr.test.js (row.late), E2E phase11.spec.js US-15
Regression E2E: all specs (full run)
System E2E: none
Full E2E run: yes, computeDtr and DtrForm are in the Shipped as of several phases, and Phase 11 completes Part five
```
