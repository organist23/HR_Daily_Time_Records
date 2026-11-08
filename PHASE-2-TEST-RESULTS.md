# Phase 2 — Holidays and weekends: test results

- **Date:** 2026-11-08
- **Branch / commit:** `feature/phase-2-holidays` @ `5340828`
- **Drivers:** Vitest (`npm test`), Playwright `_electron` (`npm run test:e2e`)
- **Totals:** unit 64/64 pass, E2E 7/7 pass (Phase 0 and 1 still green)

## US-6 Holidays and weekends — PASS

| Assertion | Result | Where |
|---|---|---|
| Add a holiday with date, name and type from the calendar | pass | e2e |
| Edit (type change) and delete | pass | e2e, unit |
| Holidays shown on the calendar and in the month list | pass | e2e (plus a screenshot check) |
| Holiday with no times: type label across A.M./P.M. cells, 0 credit, no undertime | pass | e2e MARY ANN 7/03 `REGULAR HOLIDAY`, unit |
| `SATURDAY` / `SUNDAY` on weekend rows with no times (July 4, 5) | pass | e2e, unit |
| Deleting a holiday makes the row blank again | pass | e2e |
| Still there after relaunch | pass | e2e |
| Rejects a second holiday on the same date (add, or moving onto one) | pass | e2e, unit |
| A label never hides times (RELITA 7/03, a Saturday punch) | pass | e2e, unit |
| No undertime on holidays or weekends, while worked time still counts | pass | unit |
| Opening Holidays keeps the DTR period and the one-print override | pass | e2e |

## Mutation checks (each went red, then restored)

- Duplicate-date check removed → 2 unit tests fail.
- Label shown even with times → 2 unit tests fail.
- `save-holiday` not saved to disk → e2e relaunch assertion fails.
- Preview remounted on view switch → e2e `toBeChecked` fails.

## Reviews

- code-review (medium): 9 findings, all fixed in `5340828`. These include:
  - preview state lost when opening Holidays
  - undertime on holidays and weekends
  - a crash on a malformed holiday entry
  - Escape closing a dialog mid-save
  - deleting a missing holiday reporting success
  - duplicated dialog key handling, moved into the `useDialogKeys` hook
- security-review: no findings at confidence ≥ 8.

## Left behind

- Nothing. Global teardown deletes the temp folders.
