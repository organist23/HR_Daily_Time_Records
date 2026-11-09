# Phase 4 — Find and Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Changed 2026-11-09: US-9 (date check, Task 1, Task 3) was withdrawn by the user before merge and removed. Phase 4 ships US-8 and US-10.

**Goal:** The admin filters the employee list by office and by name or AC-No as they type, checks one date across employees with a status per person, and always sees the current date and time.

**Architecture:**
- US-8: sidebar gets an Office select (`All offices` + each office) and a search input. `groups` in `App.jsx` is filtered in a `useMemo`. No new file.
- US-9: `checkDate(data, date)` in `src/lib/dtr.js` returns one row per employee `{ key, office, acNo, name, amIn, amOut, pmIn, pmOut, status }`, sorted by office then name. Times come from adjustments over device punches (`adjustments[key] ?? punches[key]`, same as `effectivePunches`). New `src/DateCheckView.jsx` (same pattern as `HolidaysView`) shows a date input, an office select, and a table. A topbar button `Date check` toggles to it, labeled `DTR preview` while open, like `Holidays`.
- US-10: a `Clock` element in the topbar, updated every second with `setInterval`, cleared on unmount.

**Spec:** `spec.md` US-8, US-9, US-10. Inherits conventions from Phases 0–3 and 6.

## Global Constraints

- Status, in order:
  1. `offDayLabel(date, holidays)` not empty: the status is that label (e.g. `SPECIAL NON-WORKING HOLIDAY`, `SATURDAY`) and the times are blank (Phase 6 convention).
  2. All 4 times set: `Present`.
  3. None set: `Absent`. This includes employees with no rows that day.
  4. Otherwise: `Incomplete`.
- Times are displayed with `formatTime` (12h, no AM/PM), as on the DTR.
- Search: trimmed, case-insensitive substring of name or AC-No. Empty search shows everyone. No match shows `No employees match.`
- Clock text: `toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })`, inside `<time aria-label="Current date and time">`.
- US-8 "Archived employees" reject: archive does not exist until Phase 5, which owns that check.

## Hand-derived values (sample_data/HRMO (3).xls, 7/03/2026)

- Present (3): JOANNE M ESTRADA, RONIE LOUISE BERMUDEZ, MARIE JOY DUGAYSAN (all 4 punches).
- Incomplete (2): RELITA BARAYA (PM arrival missing), JOHN RYAN A. LAZARO (AM 8:08 only).
- Absent (6): MARY ANN EGTAPEN, JENNYVE TANGO, SHAENA CATBAGAN, REZABEL M. CAGA, sharmaine banao, SHARMAINE BANAO.
- Search `lazaro` → 1 (#611). `sharmaine` → 2 (#925, #2025204). `20252` → 1 (#2025204).

## Review Focus

1. **A date with no rows for anyone** (e.g. 7/13/2026, a Monday): all 11 are Absent, none omitted.
2. **An adjusted day:** the check shows adjusted times, not device times.
3. **The clock interval is cleared** on unmount.

---

### Task 1: `checkDate`

**Files:** `src/lib/dtr.js`, `test/dtr.test.js`.

- [ ] Tests (red):
  - HRMO 7/03: the statuses above, 11 rows. RELITA `{ amIn: '7:54', amOut: '12:00', pmIn: '', pmOut: '5:00', status: 'Incomplete' }`.
  - 7/13: 11 rows, all `Absent`.
  - 7/04: all `SATURDAY`, blank times.
  - 7/03 as a Regular Holiday: JOANNE `REGULAR HOLIDAY`, times blank.
  - RONIE 7/01 adjusted to 8:00/12:00/13:00/17:00 → `Present`, `pmOut: '5:00'`.
- [ ] Implement, green, mutation check (drop the adjustment overlay, swap the Incomplete/Absent rule).

### Task 2: US-8 sidebar filter

**Files:** `src/App.jsx`, `src/app.css` (only if spacing needs it).

- [ ] Office select (`aria-label="Office filter"`) and search input (`aria-label="Search name or AC-No"`) at the top of the sidebar. Filter `groups`. Empty result → `No employees match.`

### Task 3: US-9 view

**Files:** `src/DateCheckView.jsx` (new), `src/App.jsx`, `src/app.css` (print hide list gets `.date-check`).

- [ ] `<section className="date-check" aria-label="Date check">` with `Date` input (default today), `Office` select, and a table with Name, AC-No, the 4 times, Status. No employees → `No records yet.`
- [ ] Clicking a name opens that employee's DTR preview.

### Task 4: US-10 clock

**Files:** `src/App.jsx`.

- [ ] `Clock` component in the topbar.

### Task 5: E2E

**Files:** `test/e2e/phase4.spec.js` (new). HRMO imported twice, as `HRMO` and `HRMO1`, for the office filter.

- [ ] `US-8`: office filter `HRMO1` shows only that group (11). Search `LaZaRo` → 1 under each office, `sharmaine` → 2 per office, `20252` → 1, `zzz` → `No employees match.`. Clicking the LAZARO result opens his DTR.
- [ ] `US-9`: Date check, 7/03/2026, office HRMO: 11 rows with the hand-derived statuses and RELITA's times. 7/13 → 11 Absent. Add a holiday on 7/03 → status `REGULAR HOLIDAY`.
- [ ] `US-10`: `context().clock.install({ time: 2026-11-09 10:00:00 })`, then reload. Clock shows `Monday, November 9, 2026 at 10:00:00 AM`. `runFor(2000)` → `10:00:02 AM`.
- [ ] Mutation check on each new assertion.

## Test scope

```
Feature: Phase 4, US-8, US-9, US-10
Feature tests: unit (checkDate in dtr.test.js), E2E for US-8, US-9, US-10 (phase4.spec.js)
Regression E2E: selection after the diff. Expected: App.jsx changes (sidebar, topbar) touch selectors used by every spec, so all specs run
System E2E: none, spec.md lists no critical workflows
Full E2E run: decided at step 8 by Regression selection
```
