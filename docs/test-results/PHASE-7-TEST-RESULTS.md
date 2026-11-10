# Phase 7 — Grace Default 0: Test Results

- **Date:** 2026-11-10
- **Driver:** Playwright `_electron` (E2E), Vitest (unit)
- **Branch:** `phase-7-grace-default-0`
- **Result:** 120/120 unit, 17/17 E2E (full run)

## Test scope as run

```
Feature: Phase 7, US-5 (with the US-2 example)
Feature tests: unit for migrateGrace, makeBackup, readBackup, mergeImport default; E2E phase7.spec.js (3 tests) and phase1.spec.js US-5
Regression E2E: all specs (full run)
System E2E: none (spec.md has no critical workflows)
Full E2E run: yes, the diff changes a business rule (grace default) and the data schema version (1 → 2)
```

## US-5 (Changed 2026-11-10)

| Condition | Test | Result |
|---|---|---|
| Each office has an editable in-charge name and grace minutes (default 0) | phase7 `a new office gets grace 0`: Office settings shows `0`. phase1 US-5: default `0`, set to 15, persists after relaunch | pass |
| A new office counts 8:01 as late | RONIE 7/02 = 3 min (8:01 + 1:02), LAZARO 7/06 = 14 min (8:08 + 1:06) | pass |
| After the update, every existing office shows 0, and a copy of the data is saved first | phase7 `existing offices…`: a version 1 file with HRMO 15 → shows `0`. One `dtr-data-before-grace-0-YYYYMMDD-HHMMSS.json` copy, byte-equal to the original. Data file is version 2 | pass |
| The update runs once | Same test: grace set to 15 after the update survives a relaunch, and no second copy is made | pass |
| An old backup cannot bring grace 15 back | phase7 `restoring a backup made before the update`: version 1 backup with HRMO 15 → shows `0` | pass |
| In-charge name, one-print override, grace validation (0 to 60) | phase1 US-5 (unchanged assertions) | pass |

## Unit tests added or changed (test/store.test.js, test/dtr.test.js)

- `migrateGrace`: version 1 → all offices 0, version 2, other fields kept. Version 2 → unchanged. `emptyData().version` = 2.
- `mergeImport` new office → `graceMinutes: 0`. Re-import keeps a grace of 10.
- `makeBackup` writes data version 2. `readBackup` of data version 1 → grace 0. Data version 3 → `Invalid backup: unsupported version`.
- `computeDtr` LAZARO 7/06 at grace 0 → 14 (US-2 example).

## Mutation checks (each went red, then restored)

| Mutation | Red |
|---|---|
| `migrateGrace` keeps office grace | 2 unit |
| `readBackup` skips `migrateGrace` | 1 unit, 1 E2E (old backup) |
| New office default back to 15 | 11 unit, 1 E2E (new office) |
| Startup migration disabled in main | 1 E2E (existing offices) |
| Startup copy skipped | 1 E2E (existing offices) |

## Changed expectations in earlier specs (justified by US-5 Changed 2026-11-10)

- `phase1.spec.js` US-5: default `15` → `0`. RONIE 7/02 at default `3`. Setting 15 gives blank. Relaunch shows `15`.
- `phase5a.spec.js`: the unsaved-edit check reverted grace to `15` (the old default). It now reverts to `0`.

## Fixed along the way

- `phase0.spec.js` `US-1 cancel import with Escape` failed in 2 of 3 full runs on the branch. Root cause: the test pressed Escape before the import dialog mounted its keydown listener (the dialog opens after the async file-pick IPC). Fix: wait for the dialog to be visible first. No assertion changed. 5/5 passes after the fix, then the full run passed.

## Left behind

- Nothing in `%APPDATA%\employees-dtr-analyzer\`. Temp folders under `%TEMP%\dtr-e2e\` are deleted by global teardown.
- The admin's real data file is migrated on the first start of the new build. Its copy is named `dtr-data-before-grace-0-*.json` in the data folder.
