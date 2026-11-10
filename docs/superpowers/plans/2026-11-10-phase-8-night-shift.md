# Phase 8 — Night Shift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sample_data/NIGHT_shift.xls` imports, and a guard's night shift (P.M. row of day D to A.M. row of day D+1) is credited across midnight, shows its times on weekends and holidays, and can be adjusted there. Day-employee DTRs do not change.

**Architecture:**
- `parseRows`: session from `On duty` (before 12:00 → `AM`, else `PM`), not from the timetable name.
- `dtr.js`: a P.M. punch with `offDuty === '23:59'` is a night start. Its end is the A.M. punch of the next date. `computeDtr` computes each night shift once and puts its credit and undertime on the two rows (start row up to 24:00, end row from 00:00). Rows with a night start or a paired night end set `row.night = true`.
- Off-day rows (weekend or holiday) keep the Phase 6 rule except when `row.night` and the row has times: then the times show and count.
- `adjustDay` (store) allows an off day when that employee has a night start on the date or the day before. `App.jsx` opens the adjust dialog for a labeled row only when it is a night row.

**Spec:** `spec.md` US-13, the Night shift rules, and US-1, US-2, US-6, US-7 (Changed 2026-11-10).

## Global Constraints

- Night start: P.M. punch with `offDuty` `23:59`. Night end: the A.M. punch dated the next day. Shift hours = (24:00 − start `onDuty`) + end `offDuty`.
- Credit and late use the office grace, as day sessions do. Times in the P.M. Departure and A.M. Arrival cells of a night shift are shown but not used.
- Missing arrival or departure (or no end row at all): start row gets the whole shift as undertime, both rows credit 0.
- An A.M. row with no night start the day before is a day session, even if it came from a night timetable (9/01 when 8/31 is not imported: 0 credit, 5h missing-punch undertime).
- Day employees: no change to any value.

## Hand-derived values (sample_data/NIGHT_shift.xls, EFREN ALCANTARA #479, grace 0)

| Row | Raw | Credit | Undertime |
|---|---|---|---|
| 9/01 Tue | A.M. out 06:00, no 8/31 data | 0 | 300 (missing punch, 01:00–06:00) |
| 9/02 → 9/03 | 17:12 → 06:01 | 408 + 360 | 12 on 9/02 |
| 9/04 → 9/05 Sat | 16:44 → 06:00 | 420 + 360 | 0 |
| 9/06 Sun → 9/07 | 17:19 → 06:00 | 401 + 360 | 19 on 9/06 |
| 9/08 → 9/09 | 16:52 → 06:00 | 420 + 360 | 0 |
| 9/10 → 9/11 | 17:30 → 06:02 | 390 + 360 | 30 on 9/10 |
| 9/12 Sat → 9/13 Sun | 17:06 → 06:00 | 414 + 360 | 6 on 9/12 |
| 9/14 → 9/15 | 17:11 → none | 0 | 780 on 9/14 |

Total credit 4,613 → `9 days`. Total undertime 1,147 = 19h 7m. Every weekend row in 1–15 (9/05, 9/06, 9/12, 9/13) has night times, so none shows a label.

With 8/31 data (synthetic: 8/31 P.M. in 17:00): 9/01 credits 360, undertime 0.

## Review Focus

1. HRMO values unchanged (every existing dtr.test.js and E2E anchor).
2. A shift crossing the period edge (15th → 16th) puts each row's credit in its own period.
3. `adjustDay` still refuses weekends and holidays for day employees.

---

### Task 1: `parseRows` by on-duty time

**Files:** `src/lib/parse.js`, `test/parse.test.js`.

- [ ] Tests (red): `NIGHT_shift.xls` → 30 records, 0 skipped. 9/02 PM `{ onDuty: '17:00', offDuty: '23:59', in: '17:12', out: '' }`, 9/03 AM `{ onDuty: '01:00', offDuty: '06:00', in: '', out: '06:01' }`. HRMO still 154 records with the same sessions.
- [ ] Implement, green, mutation check (swap AM/PM threshold).

### Task 2: `computeDtr` night shifts

**Files:** `src/lib/dtr.js`, `test/dtr.test.js`.

- [ ] Tests (red), each value from the table above: per-row credit and undertime, `days` 9, `totalUndertime` 1147, 9/05 row `{ label: '', amOut: '6:00', night: true }`, 9/14 undertime 780, 9/01 undertime 300 and credit 0, 8/31 synthetic pairing, a holiday on 9/08 keeps `pmIn: '4:52'` with credit 420. Synthetic Saturday night row with no times → label `SATURDAY`. All HRMO tests unchanged.
- [ ] Implement, green, mutation checks (drop the off-day exception, drop the next-day pairing).

### Task 3: adjustments on night rows

**Files:** `src/lib/store.js`, `test/store.test.js`, `src/App.jsx`.

- [ ] Tests (red): `adjustDay` on 9/05 (Sat) for EFREN with a night start on 9/04 is accepted. A day employee on a Saturday still throws `is a non-working day`.
- [ ] Implement store check. In `App.jsx` the labeled-row refusal applies only when `!row.night`.
- [ ] Mutation check.

### Task 4: E2E

**Files:** `test/e2e/phase8.spec.js` (new), `sample_data/NIGHT_shift.xls` (commit), `.claude/skills/e2e-testing/SKILL.md` (fixture note and anchors).

- [ ] `US-13`: import `NIGHT_shift.xls` → status `30 added, 0 updated, 0 skipped`. EFREN September 1–15: 9/02 P.M. arrival `5:12`, 9/03 A.M. departure `6:01`, 9/05 shows `6:00` not `SATURDAY`, 9/14 undertime `13` `0`, Total `9 days`, official hours `1:00-6:00, 5:00-11:59`. Add a Regular Holiday on 9/08 → `4:52` still shown. Adjust 9/15 A.M. departure `06:00` (reason) → 9/14 undertime `11` min (17:11 late), total `11 days` (9/14 17:11 → 06:00 credits 409 + 360 = 769, 4,613 + 769 = 5,382, floor(5,382 / 480) = 11).
- [ ] HRMO regression is the full run.
- [ ] Mutation check per assertion.

---

## Test scope

```
Feature: Phase 8, US-13 (with US-1, US-2, US-6, US-7 changes)
Feature tests: unit for parseRows, computeDtr night shifts, adjustDay on night rows; E2E phase8.spec.js US-13
Regression E2E: all specs (full run)
System E2E: none (spec.md has no critical workflows)
Full E2E run: yes, the diff changes a business rule (computation) and functions named in the Shipped as of phases 0, 2, 3, and 6
```
