# Phase 9 — Early Departure Filed as Clock In: Test Results

- **Date:** 2026-11-10
- **Driver:** Playwright `_electron` (E2E), Vitest (unit)
- **Branch:** `phase-9-early-departure`
- **Result:** 141/141 unit, 20/20 E2E (full run)

## Test scope as run

```
Feature: Phase 9, US-13 (changed)
Feature tests: unit for parseRows (lone Clock In) and computeDtr (RENATO, REYGAN); E2E phase9.spec.js US-13
Regression E2E: all specs (full run)
System E2E: none
Full E2E run: yes, the diff changes a business rule in import, named in the Shipped as of phases 0 and 8
```

## US-13 (Changed 2026-11-10), `sample_data/GSO_.xls`

| Condition | Test | Result |
|---|---|---|
| RENATO (519) 10/06 `night guard 2` Clock In 05:57 is stored as the departure | Unit: parsed `{ in: '', out: '05:57' }`. E2E: Adjust dialog shows A.M. arrival blank, departure `05:57` | pass |
| 10/05 → 10/06 credits 777 (420 + 357), 3 min early, no 13h undertime | Unit credit 777, 10/05 undertime 0, 10/06 `{ amIn: '', amOut: '5:57', undertime: 3 }`. E2E cells `4:04`, `5:57`, `3`, 10/05 Hours blank | pass |
| REYGAN (903) 10/09 17:06 → 10/10 Clock In 05:58 | Unit credit 772, undertime 6 and 2 | pass |
| Day employees untouched | Unit: RONIE 7/01 A.M. keeps `{ in: '08:00', out: '' }` and 4h undertime. All HRMO specs green | pass |
| `NIGHT_shift.xls` unchanged | phase8 unit and E2E green (`9 days`) | pass |
| Import count | E2E `GSO_.xls: 2851 added, 0 updated, 0 skipped` | pass |

October totals after the fix: RENATO 11 days (was 9), undertime 98h 3m (was 111h). REYGAN 4 days (was 3), undertime 39h 18m (was 52h 10m).

## Mutation checks

| Mutation | Red |
|---|---|
| Parser swap disabled | 3 unit, 1 E2E |

## Code review

The first version moved the punch only inside `computeDtr`. Review found that the Adjust dialog and `adjustDay` still saw 05:57 as the A.M. arrival, so a dialog fix could print both `5:57` and `6:00`. The fix moved to `parseRows`, so the stored punch is the departure everywhere. The E2E now checks the dialog.

Not fixed, noted as a limit: a guard who switches from the night shift to a day shift the next morning and forgets to clock out would have that morning's lone Clock In read as a departure. No such schedule is in the sample files. A lone Clock In whose night start is in a different file (the 1st of a month) is not moved.

Already-imported data keeps the old values until `GSO_.xls` is imported again (re-import updates rows and keeps adjustments).

## Left behind

- Nothing in `%APPDATA%\employees-dtr-analyzer\`. Temp folders under `%TEMP%\dtr-e2e\` are deleted by global teardown.
