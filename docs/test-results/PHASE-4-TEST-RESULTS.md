# Phase 4 — Find and check: test results

- Date: 2026-11-09
- Driver: Playwright `_electron` (`npm run test:e2e`, runs `vite build` first) and Vitest (`npm test`)
- Data: `sample_data/HRMO (3).xls`, imported as `HRMO` and `HRMO1`, isolated per launch through `tmpDir()` / `DTR_DATA_DIR`
- Branch: `phase-4-find-and-check`
- Scope: US-8, US-10. US-9 (date check) was built, then withdrawn by the user before merge on 2026-11-09. Its code and tests were removed on this branch.

## Results

- Unit: 90/90 pass (no new unit tests: US-8 and US-10 are UI-only).
- E2E: 12/12 pass (full suite, after the US-9 removal).

## US-8 (`phase4.spec.js` test 1)

| Condition | Assertion | Result |
|---|---|---|
| Office filter limits the list | `HRMO1` → 11 of 22, no `HRMO` group | pass |
| Live, case-insensitive search by name | `LaZaRo` → 2 (one per office), `sharmaine` → 4 | pass |
| Search by AC-No | `20252` → 2, `#2025204`. `#14` (as shown in the list) → 2 RELITA | pass |
| No match | `zzz` → 0, `No employees match.` | pass |
| Clicking a result opens its DTR | HRMO + `lazaro` → 1, DTR name `JOHN RYAN A. LAZARO` | pass |
| Rejects: archived employees in the default list | not testable, archive ships in Phase 5, which owns this check | n/a |

## US-10 (`phase4.spec.js` test 2)

| Condition | Assertion | Result |
|---|---|---|
| Shows the PC date and time | clock installed at 2026-11-09 10:00:00 → `Monday, November 9, 2026 at 10:00:00 AM` | pass |
| Rejects: clock stops updating | +2s → `10:00:02 AM`, +60s → `10:01:02 AM` | pass |

## Mutation checks (taken before the US-9 removal, same assertions)

| Mutation | Red |
|---|---|
| Search ignores AC-No | US-8, `20252` count |
| Search case-sensitive | US-8, `LaZaRo` count |
| Sidebar office filter ignored | US-8, `HRMO1` count |
| `#` not stripped from search | US-8, `#14` count |
| Clock never ticks | US-10, `10:00:02` |

## Test scope as run

```
Feature: Phase 4, US-8, US-10
Feature tests: E2E phase4.spec.js
Regression E2E: all specs. App.jsx sidebar and topbar are in the Shipped as of Phases 0, 1, 3, and every spec uses the sidebar and topbar selectors
System E2E: none, spec.md lists no critical workflows
Full E2E run: yes, App.jsx is in the Shipped as of 2+ phases
```

No DONE phase skipped.

## Review (code review, 2026-11-09)

- Fixed: search ignores a leading `#`. Clock ticks on second boundaries (`setTimeout`), not a free-running interval.
- The other review fixes applied to the date check, which is removed.

## Left behind

- Nothing. Global teardown removed `%TEMP%\dtr-e2e`.
