# Phase 3 — Time adjustments: test results

- **Date:** 2026-11-09
- **Branch / commit:** `feature/phase-3-adjustments` @ `6b62131`
- **Drivers:** Vitest (`npm test`), Playwright `_electron` (`npm run test:e2e`)
- **Totals:** unit 86/86 pass, E2E 8/8 pass (Phases 0–2 still green)

## US-7 Adjust times — PASS

| Assertion | Result | Where |
|---|---|---|
| Set or clear any of the 4 cells for any date, including a day with no device rows (7/13) | pass | e2e, unit |
| Reason and date stored. Undertime and days recompute (RONIE July 1–15: 2 → 3 days, 20h → 16h undertime) | pass | e2e, unit (hand-derived) |
| Device punch kept, and Revert to device times restores it (row 1 back to `8:00`, undertime 4) | pass | e2e, unit |
| Adjusted cells tinted in the app and not on print (print media background transparent) | pass | e2e |
| Rejects invalid times (`25:00`, `8:00`, non-strings) and departure ≤ arrival | pass | e2e, unit |
| Rejects an A.M. departure later than the P.M. arrival, and a missing reason | pass | e2e, unit |
| Re-import keeps adjustments (`0 added, 154 updated` and the row still adjusted) | pass | e2e, unit |
| Still there after relaunch | pass | e2e |
| An untouched session keeps its own reason and timestamp | pass | unit |

## Mutation checks (each went red, then restored)

- Departure-order check removed → 2 unit tests fail.
- Every overlaid cell flagged as adjusted → 2 unit tests fail.
- Print rule for adjusted cells removed → e2e print background assertion fails.
- Untouched session rewritten on save → unit test fails.

## Reviews

- code-review (medium): 9 findings. 8 fixed in `6b62131`. Skipped: an adjustment that later matches a re-imported device value is kept. Admin corrections always win over later imports, as US-7 requires.
- security-review: no findings at confidence ≥ 8.

## Left behind

- Nothing. Global teardown deletes the temp folders.
