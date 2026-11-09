# Phase 4 — Find and check: test results

- Date: 2026-11-09
- Driver: Playwright `_electron` (`npm run test:e2e`, runs `vite build` first) and Vitest (`npm test`)
- Data: `sample_data/HRMO (3).xls`, imported as `HRMO` and `HRMO1`, isolated per launch through `tmpDir()` / `DTR_DATA_DIR`
- Branch: `phase-4-find-and-check`

## Results

- Unit: 96/96 pass (6 new `checkDate` tests).
- E2E: 13/13 pass (full suite, rerun after the review fixes).
- Screenshot of the date check view with search: checked by eye, layout as intended.

## US-8 (`phase4.spec.js` test 1)

| Condition | Assertion | Result |
|---|---|---|
| Office filter limits the list | `HRMO1` → 11 of 22, no `HRMO` group | pass |
| Live, case-insensitive search by name | `LaZaRo` → 2 (one per office), `sharmaine` → 4 | pass |
| Search by AC-No | `20252` → 2, `#2025204`. `#14` (as shown in the list) → 2 RELITA | pass |
| No match | `zzz` → 0, `No employees match.` | pass |
| Clicking a result opens its DTR | HRMO + `lazaro` → 1, DTR name `JOHN RYAN A. LAZARO` | pass |
| Rejects: archived employees in the default list | not testable, archive ships in Phase 5, which owns this check | n/a |

## US-9 (`phase4.spec.js` test 2, `checkDate` unit tests)

| Condition | Assertion | Result |
|---|---|---|
| 7/03 HRMO statuses (hand-derived) | 11 rows: 3 Present, 2 Incomplete, 6 Absent. RELITA Incomplete, MARY ANN Absent, JOANNE Present | pass |
| 4 times shown | RELITA `7:54`, blank P.M. arrival, `5:00` | pass |
| Office filter | HRMO → 11, all offices → 22 | pass |
| Rejects: no-data employees omitted | 7/13 (no rows) → 22 Absent | pass |
| Holiday label | 7/03 Regular Holiday → 22 `REGULAR HOLIDAY` | pass |
| Weekend label (unit) | 7/04 → all `SATURDAY` | pass |
| Adjusted times used (unit) | RONIE 7/01 adjusted → Present, `5:00` | pass |
| Clicking a name opens its DTR | RELITA. Opening JOANNE and coming back keeps 7/03 and HRMO | pass |

## US-10 (`phase4.spec.js` test 3)

| Condition | Assertion | Result |
|---|---|---|
| Shows the PC date and time | clock installed at 2026-11-09 10:00:00 → `Monday, November 9, 2026 at 10:00:00 AM` | pass |
| Rejects: clock stops updating | +2s → `10:00:02 AM`, +60s → `10:01:02 AM` | pass |

## Mutation checks

Line numbers are from the run they were taken in. The first 6 E2E rows predate the review-fix test lines.

| Mutation | Red |
|---|---|
| `checkDate` ignores adjustments | 1 unit |
| Incomplete/Absent swapped | 2 unit |
| `checkDate` ignores holidays/weekends | 1 unit |
| `checkDate` sort without office | 1 unit |
| Search ignores AC-No | E2E US-8 line 36 |
| Search case-sensitive | E2E US-8 line 32 |
| Sidebar office filter ignored | E2E US-8 line 23 |
| Clock never ticks | E2E US-10 line 117 |
| Date check office filter ignored | E2E US-9 line 65 |
| Absent rows omitted | E2E US-9 line 65 |
| `#` not stripped from search | E2E US-8 line 39 |
| Date check remounts on view change | E2E US-9 line 83 |
| Office sort by localeCompare | 1 unit |

## Test scope as run

```
Feature: Phase 4, US-8, US-9, US-10
Feature tests: unit (checkDate), E2E phase4.spec.js
Regression E2E: all specs. App.jsx sidebar and topbar are in the Shipped as of Phases 0, 1, 3, app.css print rules are Phase 1's, and every spec uses the sidebar and topbar selectors
System E2E: none, spec.md lists no critical workflows
Full E2E run: yes, App.jsx is in the Shipped as of 2+ phases
```

No DONE phase skipped.

## Left behind

- Nothing. Global teardown removed `%TEMP%\dtr-e2e`. The screenshot is in the session scratchpad, not the repo.

## Review fixes (code review, 2026-11-09)

- Date check stays mounted while hidden, so its date and office survive opening a DTR.
- Search ignores a leading `#`.
- `checkDate` orders offices like the sidebar.
- Clock ticks on second boundaries (`setTimeout`), not a free-running interval.
- Date check controls use their own class, because a second `.controls` broke the Phase 1 print check's strict locator.
- Not changed: date check hides weekend/holiday times (Phase 6 label rule), and `checkDate` keeps its own one-line overlay instead of `effectivePunches` (different input shape).
