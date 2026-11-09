# Phase 6 — Non-working Days Always Labeled Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holidays, Saturdays, and Sundays always show their label in the DTR, with 0 credit and no undertime, even when device punches or adjustments exist. Adjusting those days is refused in the UI and in main.

**Architecture:**
- `computeDtr` decides the off label before the sessions. On a labeled day the row's times and `adjusted` are cleared, and the sessions add neither undertime nor credit.
- `adjustDay` in `store.js` throws on a weekend or a date in `data.holidays`. `revertDay` is unchanged, so hidden adjustments stay stored and come back when a holiday is deleted.
- In `Preview` (`App.jsx`), a day click on a labeled row sends a notice instead of opening `AdjustDialog`.

**Spec:** `spec.md` US-6 and US-7 (both Changed 2026-11-09) and the Holidays and weekends computation rule. This phase replaces the Phase 2 convention "label shows only when the day has no times".

## Global Constraints

- Non-working day = weekday 0 or 6 (UTC, as in `computeDtr`), or a date key in `data.holidays`.
- Store error: `2026-07-04 is a non-working day`.
- UI notice (`ok: false`): `July 4, 2026 is a non-working day (SATURDAY). Its times cannot be adjusted.`
- No data migration. Existing adjustments on these days stay.

## Hand-derived values (sample_data/HRMO (3).xls)

- JOANNE (#218), full July: 7/01, 7/02, 7/03, 7/06, 7/07, 7/08 full (6 × 480) plus 7/09 PM (240) = 3120 → 6 days. 7/09 AM is missing its departure → 4h undertime. With 7/01 as a holiday: 2640 → 5 days, undertime still 4h.
- RELITA (#14), July 1–15: 3120, 6 days, 240 undertime (7/03 PM missing its arrival). With 7/03 as a holiday: 2880 → 6 days, undertime 0.
- RONIE (#568), July 1–15, with the 7/01 work-from-home adjustment: 1680 → 3 days, undertime 960. With 7/01 as a holiday: 1200 → 2 days, undertime 960.
- The sample has no weekend punches, so weekend-with-punches cases use synthetic punches in unit tests only.

## Review Focus

1. **A holiday on a day with an adjustment.** Expect the label, 0 credit, and the adjustment still stored. Deleting the holiday brings back the times.
2. **Main refuses `adjust-day` on a weekend or holiday** even when called directly through `window.api`.
3. **The office batch blank-page warning.** It now treats weekend and holiday punches as no records. Acceptable, since those days print as labels.

---

### Task 1: `computeDtr`, labels always win

**Files:** `src/lib/dtr.js`, `test/dtr.test.js`.

- [ ] Rewrite these tests to the new rule (red):
  - `keeps times on a holiday with time entries` → RELITA 7/03 holiday: `{ label: 'REGULAR HOLIDAY', amIn: '', pmOut: '', undertime: 0 }`. July 1–15 credited 2880, days 6, totalUndertime 0.
  - `shows times on a weekend with a punch` → synthetic 7/04 AM punch: `{ label: 'SATURDAY', amIn: '' }`, credited 0.
  - `no undertime on a holiday or weekend, but worked time still counts` → credited 0, both rows undertime 0.
  - `adjusted times on a holiday show instead of the label` → RONIE adjusted 7/01 holiday: `{ label: 'LOCAL HOLIDAY', amOut: '', adjusted: [] }`. Credited 1200, days 2, undertime 960.
  - New: JOANNE full July. Without holidays: 3120, 6 days, 240 undertime. With 7/01 Special Non-Working Holiday: 2640, 5 days, 240 undertime, row 1 label `SPECIAL NON-WORKING HOLIDAY`.
- [ ] Implement: on an off day set `row.label`, blank the four times, `adjusted = []`, and skip both sessions. Remove the "label only when no times" line.
- [ ] Green, then a mutation check: restore the old label condition and see the tests go red.

### Task 2: `adjustDay` refuses non-working days

**Files:** `src/lib/store.js`, `test/store.test.js`.

- [ ] Tests (red):
  - `adjustDay` on `2026-07-04` (Sat) and `2026-07-05` (Sun) throws `2026-07-04 is a non-working day` and stores nothing.
  - With `data.holidays['2026-07-01']` set, adjusting RONIE 7/01 throws and stores nothing.
  - `revertDay` on a day that has an adjustment and later became a holiday still removes it.
- [ ] Implement the check after `Invalid date`. Green, then a mutation check.

### Task 3: UI refuses non-working days

**Files:** `src/App.jsx`.

- [ ] `onDayClick`: if `result.rows[day - 1].label`, call `onNotice([{ ok: false, text }])` with the Global Constraints text. Otherwise `setAdjusting(day)`.
- [ ] Hint line (`App.jsx:194`): "Click a workday number on the form to adjust its times."

### Task 4: E2E

**Files:** `test/e2e/phase6.spec.js` (new), `test/e2e/phase2.spec.js:48-49`.

- [ ] `phase2.spec.js`: RELITA 7/03 now shows `REGULAR HOLIDAY` (label-cell count 1). Justified by US-6 Changed 2026-11-09.
- [ ] `phase6.spec.js` `US-6`:
  - Add a Special Non-Working Holiday on 7/01/2026 (a past date in the data).
  - JOANNE full month: row 1 label `SPECIAL NON-WORKING HOLIDAY`, Total `5 days`, undertime hours `4`.
  - Delete the holiday: row 1 shows `7:34`, Total `6 days`.
- [ ] `phase6.spec.js` `US-7`:
  - RONIE 1–15: adjust 7/01 work-from-home → `3 days`.
  - Add a holiday on 7/01 → label shows, `2 days`.
  - Click `Adjust July 1, 2026` → status shows the non-working message and no dialog opens. Same for `Adjust July 4, 2026`.
  - `window.api.adjustDay` on 2026-07-04 rejects with `non-working day`.
  - Delete the holiday → 7/01 shows the adjusted `12:00` and `3 days` again.
- [ ] Mutation check on each new assertion.

## Test scope

```
Feature: Phase 6, US-6, US-7
Feature tests: unit (dtr.test.js, store.test.js), E2E for US-6, US-7 (phase6.spec.js)
Regression E2E: all specs, computeDtr is in the Shipped as of Phases 0, 2, 3 and this is a business-rule change
System E2E: none, spec.md lists no critical workflows
Full E2E run: yes, business rule change and computeDtr shipped in 2+ phases
```
