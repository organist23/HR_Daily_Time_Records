# Phase 11 — Red Late Arrivals: Test Results

- **Date:** 2026-11-11
- **Driver:** Playwright `_electron` (E2E), Vitest (unit)
- **Branch:** `phase-11-red-late-arrivals`
- **Result:** 147/147 unit, 22/22 E2E (full run)

## Test scope as run

```
Feature: Phase 11, US-15
Feature tests: unit dtr.test.js (row.late), E2E phase11.spec.js US-15
Regression E2E: all specs (full run)
System E2E: none
Full E2E run: yes, computeDtr and DtrForm are in the Shipped as of several phases, and Phase 11 completes Part five
```

## US-15

| Condition | Test | Result |
|---|---|---|
| Day-shift arrival red when late > 0 with office grace | Unit: LAZARO `late` lists. E2E: LAZARO 7/08 `8:18`, 7/06 `8:08` and `1:06`, 7/03 `8:08` (no departure) are `rgb(221, 0, 0)` | pass |
| Red on screen, print, PDF, office batch | E2E: computed color under screen and print media. Export PDF page streams hold `.8667 0 0 rg`. Print office (mocked dialog): batch cells `8:18`, `8:08`, `1:06` red. PDF rendered with PyMuPDF and checked by eye | pass |
| Red whether totals are shown or hidden | E2E: same colors with totals hidden (default) and shown | pass |
| Adjusted late arrival red with tint | E2E: LAZARO 7/01 adjusted 07:50 → 08:30: class `adjusted`, red text, background `rgb(255, 241, 184)` | pass |
| Grace 0 vs 15 | Unit and E2E: 7/06 arrivals red at 0, black at 15. 7/08 red at both | pass |
| Rejects: departure red | E2E: 7/06 and 7/08 departures black | pass |
| Rejects: on-time arrival red | E2E: RONIE 7/01 `8:00` black. RELITA July 1–15: no red cell, no red operator in its PDF | pass |
| Rejects: night-shift time red | Unit: EFREN Sept 1–15 `late` empty. E2E: EFREN 9/02 `5:12` (12 min late) black, no red cell | pass |
| Rejects: red changes a computed value | Unit: LAZARO 7/06 14 and 7/08 18 unchanged. All earlier unit and E2E values unchanged | pass |

## Mutation checks (each went red, then restored)

| Mutation | Red |
|---|---|
| Late test ignores grace | 1 unit, 1 E2E |
| Night-shift arrivals marked | 1 unit, 1 E2E |
| Late requires a departure | 1 unit |
| CSS red rule removed | 1 E2E |
| PDF regex not matching Chromium's `.8667` (found during the pass) | 1 E2E |

## Earlier tests updated (justified by US-15: each row gains `late`)

`test/dtr.test.js`: two whole-row `toEqual` checks now include `late: []`. No value changed.

## Code review fixes

- `session` and `nightShift` use `isLate`, so the red mark and the undertime share one late rule.
- US-15 wording now says "later than on-duty + office grace, with or without a departure", matching the code (7/03 `8:08` with no departure is red).
- E2E color checks use retrying `toHaveCSS`. The red value comes from one `RED` constant. Full run repeated: 147/147 unit, 22/22 E2E. CSS-removal mutation still goes red.
- Not fixed, outside this phase: a night A.M. row whose night-start P.M. record is not imported keeps a pre-06:00 punch as its Arrival (Phase 9 parser only moves it when the start is in the same file). That arrival shows red. Needs its own fix through the `feature-workflow` Gate.
- Skipped: the PDF operator regex. A changed encoding fails the LAZARO `> 0` check, so the RELITA zero check cannot pass silently.
- `/ponytail-review` not installed in this session. `/security-review` not run: the diff touches no trust boundary.

## DONE phases

None skipped. Full run.

## Left behind

- Nothing in `%APPDATA%\employees-dtr-analyzer\`. Temp folders under `%TEMP%\dtr-e2e\` are deleted by global teardown.
