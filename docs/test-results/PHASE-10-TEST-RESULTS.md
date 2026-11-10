# Phase 10 — Show or Hide Undertime and Total: Test Results

- **Date:** 2026-11-10
- **Driver:** Playwright `_electron` (E2E), Vitest (unit)
- **Branch:** `phase-10-hide-totals`
- **Result:** 141/141 unit (unchanged), 21/21 E2E (full run)

## Test scope as run

```
Feature: Phase 10, US-14
Feature tests: E2E phase10.spec.js US-14
Regression E2E: all specs (full run)
System E2E: none
Full E2E run: yes, DtrForm is named in the Shipped as of phases 0 and 1, and the default display changes for every spec that reads totals
```

## US-14

| Condition | Test | Result |
|---|---|---|
| Toolbar button `Show undertime and total` / `Hide undertime and total`, not printed | E2E: button visible on screen, hidden under print media | pass |
| Hidden by default: day undertime cells and the Total row's days and undertime are blank, layout kept | E2E: RONIE July 1–15 day 1 Hours and Minutes blank, Total row has no `days`, total cells blank | pass |
| Print and PDF use the screen state | E2E: under print media the same cells are blank. Print office (mocked dialog): 11 pages, 0 with a days total while hidden, 11 while shown | pass |
| Applies to every employee until the app closes, nothing saved | E2E: shown state carries to LAZARO and back to RONIE. Relaunch starts hidden | pass |
| Show brings back the values | E2E: RONIE `2 days`, total Hours `20`, day 1 Hours `4` | pass |
| Rejects: hiding changes a computed value | Showing again gives the same `2 days` and 20h. `computeDtr` unchanged (141 unit tests unchanged) | pass |
| Rejects: arrival or departure hidden | E2E: day 1 A.M. arrival `8:00` in both states | pass |

## Mutation checks (each went red, then restored)

| Mutation | Red |
|---|---|
| `DtrForm` ignores `showTotals` | 1 E2E |
| Office batch `DtrForm` loses the prop | 1 E2E |
| Toggle not disabled during a print job | 1 E2E |
| State kept per employee instead of in `App` | 1 E2E |

## Earlier specs updated (justified by US-14: hidden is the new default)

phase0, phase1, phase3, phase5b, phase6, phase7, phase8, phase9: one `showTotals(page)` call (new helper in `test/e2e/helpers.js`) after the first employee opens in each launch. No expected value changed.

## Code review fixes

- The toggle is disabled while a print or PDF job runs, like the other toolbar buttons, so a job cannot mix states.
- `showTotals(page)` waits for the toolbar and fails loudly if the button is missing, instead of reading a count once.
- Office batch output and the switch to a second employee are now asserted.
- `DtrForm` has an explicit `showTotals = false` default.

## Left behind

- Nothing in `%APPDATA%\employees-dtr-analyzer\`. Temp folders under `%TEMP%\dtr-e2e\` are deleted by global teardown.
