# Phase 6 — Non-working days always labeled: test results

- Date: 2026-11-09
- Driver: Playwright `_electron` (`npm run test:e2e`, runs `vite build` first) and Vitest (`npm test`)
- Data: `sample_data/HRMO (3).xls`, isolated per launch through `tmpDir()` / `DTR_DATA_DIR`
- Branch: `phase-6-non-working-days`

## Results

- Unit: 90/90 pass.
- E2E: 10/10 pass (full suite). Phase 6 spec rerun after the undertime-on-delete assertion: 2/2.

## US-6 (`phase6.spec.js` test 1, `phase2.spec.js` test 1)

| Condition | Assertion | Result |
|---|---|---|
| A holiday shows its label even with punches | JOANNE 7/01 Special Non-Working Holiday: label shown, `7:34` gone | pass |
| 0 credit on a holiday | JOANNE July 6 days → 5 days (3120 → 2640 min, hand-derived) | pass |
| No undertime on a holiday | JOANNE undertime stays 4h (7/09 AM only) | pass |
| Weekends labeled | July 4/5 `SATURDAY`/`SUNDAY` | pass |
| Adding a holiday on a past date changes the row right away | label shows after adding, no relaunch | pass |
| Deleting a holiday shows the punches again | `7:34` and 6 days back | pass |
| After deleting, the day computes as a workday (clarified 2026-11-09) | RONIE 7/01: blank undertime under the label, then `8:00` and 4h undertime (missing A.M. departure) after delete | pass |
| Rejects: a holiday or weekend row shows times or adds credit | RELITA 7/03 now `REGULAR HOLIDAY`, `5:00` not shown (phase2 spec, updated per US-6 Changed 2026-11-09) | pass |
| Weekend with punches (no sample data has any) | unit: synthetic 7/04 punch → `SATURDAY`, 0 credit | pass |

## US-7 (`phase6.spec.js` test 2)

| Condition | Assertion | Result |
|---|---|---|
| Workday adjustment still works | RONIE 7/01 work from home: 2 → 3 days | pass |
| A holiday hides an earlier adjustment | 7/01 label, 3 → 2 days (1680 → 1200 min) | pass |
| Clicking a holiday or weekend opens no dialog and shows a message | July 1 and July 4 messages, dialog count 0 | pass |
| Rejects: an adjustment saved on a non-working day | direct `window.api.adjustDay` on 2026-07-04 → `2026-07-04 is a non-working day` | pass |
| Hidden adjustment kept | delete holiday → 7/01 `12:00`, 3 days | pass |

## Mutation checks

| Mutation | Red |
|---|---|
| `dtr.js` restored from `main` (old label rule) | 5 unit tests. E2E: phase2 US-6, phase6 US-6, phase6 US-7 |
| `adjustDay` weekend check removed | 2 unit tests |
| `adjustDay` holiday check removed | 1 unit test |
| UI `openAdjust` bypassed (`setAdjusting`) | phase6 US-7, line 92 |
| Store guard removed (UI guard kept) | phase6 US-7, line 103 (`Received "saved"`) |
| Day-1 undertime zeroed | phase6 US-6, line 66 (RONIE 4h after delete) |

## Test scope as run

```
Feature: Phase 6, US-6, US-7
Feature tests: unit (dtr.test.js, store.test.js), E2E phase6.spec.js
Regression E2E: all specs (full run)
System E2E: none, spec.md lists no critical workflows
Full E2E run: yes, business-rule change and computeDtr is in the Shipped as of Phases 0, 2, 3
```

No DONE phase skipped.

## Changed tests and why

- `dtr.test.js` "only official hours are credited": synthetic days moved from July 1–7 to 7 workdays (1–3, 6–9), since July 4/5 now give no credit. Expected 7 days unchanged (US-2).
- `dtr.test.js` holiday/weekend tests and `phase2.spec.js` RELITA 7/03: expected values follow US-6 Changed 2026-11-09.

## Left behind

- `.gitignore`: `test-results` anchored to `/test-results/` so `docs/test-results/` is tracked.
- No temp folders: global teardown removed `%TEMP%\dtr-e2e`.
