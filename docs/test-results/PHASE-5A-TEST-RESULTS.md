# Phase 5a — Archive and delete: test results

- Date: 2026-11-09
- Driver: Playwright `_electron` (`npm run test:e2e`, runs `vite build` first) and Vitest (`npm test`)
- Data: `sample_data/HRMO (3).xls`, imported as `HRMO` and `HRMO1` (22 employees, 14 punch rows each), isolated per launch through `tmpDir()` / `DTR_DATA_DIR`
- Branch: `phase-5a-archive-delete`
- Scope: US-11 (Changed 2026-11-09 twice: delete-import dropped, archiving an office hides its employees; delete only from the Archived view)

## Results

- Unit: 96/96 pass (6 new archive/delete store tests).
- E2E: 13/13 pass (full suite).

## US-11 (`phase5a.spec.js`, store unit tests)

| Condition | Assertion | Result |
|---|---|---|
| Archiving an employee hides them from the sidebar | #2025204 in HRMO: HRMO 11 → 10, all 22 → 21. The preview closes | pass |
| Archived employee left out of office print/PDF | HRMO 1–15 office PDF = 10 pages, no blank-employee warning (#2025204 was the only blank one) | pass |
| Re-import keeps the archive | re-import into HRMO: `0 added, 154 updated`, HRMO still 10. Unit: employee and office flags kept | pass |
| Archived view lists and restores | `SHARMAINE BANAO (#2025204)` listed. Restore → 22, `No archived employees.` | pass |
| Archiving an office hides it and its employees | HRMO1 heading gone, filter options `All offices, HRMO`, 11 listed | pass |
| Office filter resets when its office is archived | filter on HRMO1 → value `''` after archive | pass |
| Importing into an archived office says so | `… (office HRMO1). Office HRMO1 is archived, see Archived.`, list still 11 | pass |
| Restoring the office brings everyone back | `HRMO1 (11 employees)` → Restore → 22 | pass |
| Unsaved Office settings edits block Archive office | grace 10 → `Archive office` disabled | pass |
| Delete employee from Archived, with confirmation | `… This removes 14 punches and 0 adjusted days. This cannot be undone.` Confirm → HRMO1 10, HRMO 11 | pass |
| Delete office from Archived, with confirmation | `Delete office HRMO1? This removes 10 employees, 140 punches, 0 adjusted days, and its settings. Holidays stay. …` Confirm → 11 left | pass |
| Deletes persist | relaunch: 11 employees, no HRMO1 | pass |
| Delete removes only that employee's data (unit) | AC 140, AC `14\|2`, and office HR keep their punches. Office delete keeps holidays and the other office | pass |
| Rejects: delete without confirmation, or Cancel changes anything | Cancel and Escape on employee delete keep them listed. Cancel on office delete keeps it | pass |
| Rejects: delete button on the DTR screen or in Office settings | `Delete employee` count 0, no `Delete…` in Office settings | pass |
| Rejects: archived employees in the default list (also US-8) | covered by the sidebar counts above | pass |
| Main refuses bad targets | `setArchived(null)` → `Unknown office: undefined`. Unit: unknown employee/office throw | pass |

## Mutation checks

| Mutation | Red |
|---|---|
| `mergeImport` drops existing fields | 1 unit, E2E re-import count |
| Office-delete prefix without the `\|` separator | 2 unit |
| `deleteEmployee` keeps adjustments | 1 unit |
| `deleteEmployee` by bare prefix (old code) | 1 unit (`14\|2`) |
| Sidebar shows archived employees | E2E HRMO count after archive |
| Office print includes archived employees | E2E 10-page PDF |
| Sidebar shows archived offices | E2E HRMO1 heading |
| Delete runs without confirmation | E2E count after Cancel |
| Cancel deletes | E2E count after Cancel |
| Preview stays open after archive | E2E `Select an employee…` |
| No office filter reset | E2E list count after archive |
| No archived-import notice | E2E import status |
| Unsaved edits ignored | E2E `toBeDisabled` |
| IPC handler destructures `null` | E2E `Unknown office: undefined` |
| Delete employee button back on the DTR screen | E2E line 97 |

The delete-flow mutations were run before delete moved to the Archived view. The same confirm dialog and Cancel path are used there.

## Test scope as run

```
Feature: Phase 5a, US-11
Feature tests: unit (store.test.js), E2E phase5a.spec.js
Regression E2E: all specs. mergeImport (Phase 0), App.jsx sidebar and officePages (Phases 0, 1, 4), OfficeDialog (Phase 1)
System E2E: none, spec.md lists no critical workflows
Full E2E run: yes, mergeImport and App.jsx are in the Shipped as of 2+ phases, and records gained an optional `archived` field
```

No DONE phase skipped.

## Reviews

- Code review: 8 findings, all fixed.
- Security review: no findings.

## Left behind

- Nothing. Global teardown removed `%TEMP%\dtr-e2e`.
- Outside this phase: holiday Delete (Phase 2) runs without a confirmation. Reported to the admin for a separate Amend.
