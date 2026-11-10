# Phase 8 — Night Shift: Test Results

- **Date:** 2026-11-10
- **Driver:** Playwright `_electron` (E2E), Vitest (unit)
- **Branch:** `phase-8-night-shift`
- **Result:** 137/137 unit, 19/19 E2E (full run)

## Test scope as run

```
Feature: Phase 8, US-13 (with US-1, US-2, US-6, US-7 changes)
Feature tests: unit for parseRows, computeDtr night shifts, adjustDay on night rows; E2E phase8.spec.js US-13
Regression E2E: all specs (full run)
System E2E: none (spec.md has no critical workflows)
Full E2E run: yes, the diff changes a business rule (computation) and functions named in the Shipped as of phases 0, 2, 3, and 6
```

## US-13 (EFREN ALCANTARA #479, `sample_data/NIGHT_shift.xls`, grace 0)

| Condition | Test | Result |
|---|---|---|
| Imports all 30 rows, 0 skipped | E2E status `30 added, 0 updated, 0 skipped`. Unit: 30 records, 9/02 P.M. 17:00–23:59 in 17:12, 9/03 A.M. 01:00–06:00 out 06:01 | pass |
| 9/02 P.M. arrival `5:12`, 9/03 A.M. departure `6:01`, 768 min, 12 late | E2E cells. Unit credit 768, 9/02 undertime 12 | pass |
| 9/04 → Saturday 9/05 credits 780, Saturday shows `6:00` not `SATURDAY` | Unit credit 780. E2E 9/05 `6:00`, no label. 9/06 Sunday `5:19` | pass |
| 9/14 without departure: 0 credit, 13h undertime on 9/14 | Unit 780 on 9/14. E2E Hours `13` | pass |
| 9/01 with no 8/31 data: shown, 0 credit. With 8/31: pairs | Unit: 300 undertime (day rule), and 360 credit with a synthetic 8/31 arrival | pass |
| September 1–15 = `9 days` (4,613 min) | Unit `[4613, 9, 1147]`. E2E `9 days`, undertime `19` h `7` m | pass |
| Official hours from the data `1:00-6:00, 5:00-11:59` | Unit and E2E | pass |
| Day-employee DTRs unchanged | All earlier unit and E2E specs unchanged and green | pass |
| Rejects: night row with times on a holiday shows the label | 9/08 Regular Holiday keeps `4:52` and `9 days` (unit and E2E) | pass |
| Rejects: minutes outside the shift hours credited | 16:44 arrival credits 420 (from 17:00). 06:01/06:02 departures credit 360 (to 06:00) | pass |
| Weekend night row with no times shows the label | Unit: synthetic Sat 9/19 and Sun 9/20 | pass |
| Shift over the period edge | Unit: 9/15 → 9/16 credits 420 in 1–15 and 360 in 16–30 | pass |
| US-7: night rows adjustable on weekends and holidays | Unit: Sat 9/05 A.M., Sun 9/06 P.M., holiday 9/08 P.M. accepted. E2E: holiday 9/15 shows the label, opens Adjust, the 06:00 departure saves → 9/14 `0` h `11` m, `11 days`, undertime `6` h `18` m | pass |
| US-7: day employees still refused on weekends and holidays | Existing unit and phase6 E2E unchanged | pass |

## Mutation checks (each went red, then restored)

| Mutation | Red |
|---|---|
| Session by name again (parse) | 5 unit, 1 E2E |
| Session AM/PM swapped | 5 unit |
| Off-day label always wins | 3 unit, 1 E2E |
| No next-day pairing | 6 unit, 1 E2E |
| Missing punch = start part only | 2 unit |
| No late on night shifts | 3 unit |
| Store refuses night rows on off days | 1 unit, 1 E2E |
| UI refuses labeled night rows | 1 E2E (after adding the 9/15 holiday case: the first version stayed green because 9/05 has times and no label) |

## Review fixes (each with a test that went red when the fix was removed)

- Import: a second row for the same AC-No, date, and session in one file is skipped and counted, instead of overwriting the first (a third timetable such as overtime would otherwise replace the Afternoon row).
- A weekend or holiday night start with no arrival but a next-day departure keeps its 13h undertime (it used to keep the label and drop the undertime).
- A day after a night start is a night row even when the device wrote no A.M. row, so the UI allows the adjustment the store accepts.
- `adjustDay` sees a night start that exists only as an adjustment.
- After the fixes: 137/137 unit, 19/19 E2E (full run).

Not fixed, noted as limits (outside the data and spec): a single-row 15:00–23:59 schedule, row order when a device exports a third timetable before the Afternoon row, day-rule P.M. times typed on a guard's weekend, and night shifts ending at `00:00`.

## Notes

- The Hours cell shows `0` for a row with undertime under an hour. That is existing `DtrForm` behavior. The first E2E draft expected blank and was corrected.
- A night shift whose end row is not imported at all (start on the last day of a file) counts only the start part (7h) as undertime. NIGHT_shift.xls has an end row for every start.

## Left behind

- Nothing in `%APPDATA%\employees-dtr-analyzer\`. Temp folders under `%TEMP%\dtr-e2e\` are deleted by global teardown.
