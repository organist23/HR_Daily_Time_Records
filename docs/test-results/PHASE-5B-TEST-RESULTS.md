# Phase 5b — Backup and restore: test results

- Date: 2026-11-09
- Driver: Playwright `_electron` (`npm run test:e2e`, runs `vite build` first) and Vitest (`npm test`)
- Data: `sample_data/HRMO (3).xls` imported as `HRMO`, isolated per launch through `tmpDir()` / `DTR_DATA_DIR`. Backup files are written to a second `tmpDir()`.
- Branch: `phase-5b-backup-restore`
- Scope: US-12 (Changed 2026-11-09: automatic copy of current data before restore)

## Results

- Unit: 114/114 pass (18 new backup tests).
- E2E: 14/14 pass (full suite).

## US-12 (`phase5b.spec.js`, store unit tests)

| Condition | Assertion | Result |
|---|---|---|
| Backup saves one file with all data to a picked location | mocked save dialog → `Backup saved: backup.json`. The file has 1 office, 11 employees, 154 punches | pass |
| Backup holds offices, employees, punches, adjustments, holidays, settings (unit) | round trip equals the source: 154 punches, 2 adjustment sessions, archived #2025204, in-charge `JUAN DELA CRUZ`, grace 10 | pass |
| Restore asks first and names what comes back | `It has 1 office, 11 employees, 154 punches, 1 adjusted day, 1 holiday.` | pass |
| Confirmation names the copy | `The current data will first be copied to dtr-data-before-restore-YYYYMMDD-HHMMSS.json in the data folder.` | pass |
| Cancel changes nothing | no copy file, `dtr-data.json` unchanged, list still empty | pass |
| Copy first, then restore | 1 copy, byte-for-byte equal to the pre-restore file | pass |
| Restored data is shown | after deleting the office and the holiday: HRMO 10 employees (#2025204 still archived), RONIE 7/01 adjusted `12:00`, 7/03 `REGULAR HOLIDAY`, RONIE 1–15 `2 days`, in-charge `JUAN DELA CRUZ` | pass |
| Restore persists | relaunch: 10 employees | pass |
| A second restore never overwrites an earlier copy | 2 copies, the first unchanged | pass |
| Rejects: invalid file changes data | punch time `25:00` → `Could not restore: Invalid backup: punch (HRMO\|14\|2026-07-01\|AM)`. No dialog, no copy, `dtr-data.json` unchanged | pass |
| Rejects: corrupt file changes data | truncated file → `Invalid backup: not a JSON file`, same checks | pass |
| Validator rules (unit) | not JSON, another JSON, wrong version, non-object map, office grace, `\|` in office, case-duplicate offices, missing office, `\|` in AC-No, punch key/field mismatch, bad time, unknown employee adjustment, reversed adjustment, bad holiday type, `__proto__` key | pass |
| Only known fields are kept (unit) | extra top-level and record fields dropped | pass |
| Adjustments on later holidays are accepted (unit) | Phase 6 keeps them, so restore must too | pass |

## Mutation checks

| Mutation | Red |
|---|---|
| Employee-exists check on day keys removed | 1 unit |
| Holiday type check removed | 1 unit |
| Office grace range removed | 1 unit |
| Punch time check removed | 1 unit, E2E invalid-file status |
| Punch date/key match removed | 1 unit |
| No copy on apply | E2E copy count |
| Copy made at pick time (before confirm) | E2E no copy after Cancel |
| Restore applies without confirmation | E2E no copy after Cancel |
| Copy overwrites an earlier one | E2E 2 copies |

## Test scope as run

```
Feature: Phase 5b, US-12
Feature tests: unit (makeBackup/readBackup), E2E phase5b.spec.js
Regression E2E: all specs. App.jsx topbar (Phases 0, 4, 5a) and ConfirmDialog (Phase 5a)
System E2E: none, spec.md lists no critical workflows
Full E2E run: yes, App.jsx is in the Shipped as of 2+ phases, and this phase completes Part one
```

No DONE phase skipped.

## Reviews

- Code review: 9 findings. 8 fixed:
  - a failed restore can be retried
  - unique copy names, decided at restore time
  - stricter input
  - only known fields are kept
  - a memoized cancel handler
  - one shared adjusted-day counter
  - an updated comment
- Not changed: adjustments on holidays and weekends are accepted, because Phase 6 keeps them.
- Security review: no findings.

## Left behind

- Not covered by E2E: retrying after a failed restore (disk error). There is no outer-boundary way to make the copy or the save fail. The handler keeps `pendingRestore` until both succeed.
- Global teardown removed `%TEMP%\dtr-e2e`.
