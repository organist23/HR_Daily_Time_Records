# Phase 2 — Holidays and Weekends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin manages holidays (add, edit, delete, calendar view). The DTR labels holiday and weekend rows that have no time entries.

**Architecture:**
- Holidays are stored in `data.holidays`, keyed by ISO date, so one date can hold only one holiday. They apply to all offices.
- Pure functions `setHoliday` and `deleteHoliday` live in `store.js`. Main exposes them through `save-holiday` and `delete-holiday`, using the existing clone, save, then commit pattern.
- `computeDtr` takes `holidays` and adds `row.label`. `DtrForm` draws a label as one cell across the 4 time columns.
- A "Holidays" view (month calendar plus that month's list) replaces the DTR preview while it is open.

**Spec:** `spec.md` US-6. Inherits the Phase 0 and Phase 1 conventions in `roadmap.md`.

## Global Constraints

- Types, exactly: `Regular Holiday`, `Special Non-Working Holiday`, `Local Holiday`, `Work Suspension`. The DTR label is the type in uppercase (`REGULAR HOLIDAY`).
- A holiday name is trimmed, 1 to 100 characters. The date is a valid ISO `YYYY-MM-DD`.
- A label shows only on a day inside the period and the month, and only when it has no time entries (all 4 cells empty). A holiday takes precedence over a weekend.
- Labeled days add 0 credit and 0 undertime. Days with time entries compute as before (work from home on a holiday counts).

## Review Focus

1. **Editing a holiday to a date that already has one.** Expect it rejected, with both holidays unchanged. Unit test.
2. **Moving a holiday to a new date.** Expect the old date freed. Unit test.
3. **A weekend or holiday with a single punch.** Expect times shown, no label. Unit test (synthetic Saturday punch).
4. **The office batch print.** Expect labels on every page. Covered because the batch uses the same `computeDtr` arguments (`holidays` passed in both places). E2E checks the single preview.
5. **Old data files without `holidays`.** Expect them treated as `{}`. Unit test (`setHoliday` on Phase 1 data).

---

### Task 1: Holiday store functions

**Files:** `src/lib/store.js`, `test/store.test.js`.

**Produces:**
- `HOLIDAY_TYPES` (array).
- `setHoliday(data, { date, name, type }, originalDate?: string): void`. Throws on:
  - an invalid date (`Invalid date`)
  - an empty or too-long name
  - an unknown type
  - a different holiday already on `date` (`A holiday already exists on 2026-07-03`)

  When `originalDate` differs from `date`, the old key is removed.
- `deleteHoliday(data, date): void`.

- [ ] Tests (red), implement, green, mutation check (drop the duplicate check), commit.

### Task 2: Labels in the computed DTR and on the form

**Files:** `src/lib/dtr.js`, `src/DtrForm.jsx`, `src/dtr-form.css`, `src/App.jsx` (pass `data.holidays ?? {}` in both `computeDtr` calls), `test/dtr.test.js`.

**Produces:** `computeDtr({ ..., holidays = {} })`, where each row gains `label: ''|'SATURDAY'|'SUNDAY'|<TYPE UPPERCASE>`.

- [ ] Tests (hand-derived, July 2026: Saturdays are 4, 11, 18, 25 and Sundays are 5, 12, 19, 26):
  - RELITA July 1–15 with no holidays: row 4 `SATURDAY`, row 5 `SUNDAY`, row 3 no label. Credited is still 3120.
  - Holiday `2026-07-03` Regular:
    - MARY ANN EGTAPEN (783), absent on 7/03: row 3 label `REGULAR HOLIDAY`, undertime 0.
    - RELITA, who has punches on 7/03: row 3 has no label and keeps `pmOut '5:00'`.
  - A synthetic Saturday punch: times shown, no label.
  - Row 31 in September and rows outside the period: no label.
- [ ] Implement. `DtrForm`: a row with a label renders `<td colSpan={4} className="label-cell">`. Then green, mutation check (label even when times exist), commit.

### Task 3: Holidays view (calendar, add, edit, delete)

**Files:**
- Create `src/HolidaysView.jsx` and `src/HolidayDialog.jsx`.
- Modify `electron/main.js` (`save-holiday`, `delete-holiday`), `electron/preload.cjs`, `src/App.jsx` (a top-bar "Holidays" toggle), `src/app.css`.
- Test `test/e2e/phase2.spec.js`.

**UI:**
- The top-bar button "Holidays" toggles to "DTR preview".
- The calendar has Month and Year controls, a Sun–Sat grid, and one button per day (`aria-label` like `July 3, 2026`, showing the holiday name and type).
- Clicking a day opens the dialog: add when the day is empty, edit when it has a holiday.
- The dialog `Holiday — Add` / `Holiday — Edit` has Date, Name, Type (select), Save, Cancel, and Delete (edit only). Escape cancels, and errors show inline (`role="alert"`).
- Below the grid, a list shows that month's holidays.
- Empty state: "No holidays this month."

- [ ] E2E (red):
  - Import HRMO and add `2026-07-03` "Test Holiday", Regular. The calendar day shows it.
  - Adding a second holiday on 7/03 gives an error.
  - In the DTR, MARY ANN row 3 shows `REGULAR HOLIDAY`, RELITA row 3 shows its times, and row 4 shows `SATURDAY`.
  - Edit the type to Special Non-Working: the label changes.
  - Relaunch: the holiday is still there.
  - Delete: MARY ANN row 3 is blank.
- [ ] Implement, green, mutation check (skip saving in `save-holiday`), commit.
