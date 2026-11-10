# Phase 7 — Grace Default 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New offices get grace 0. On the first start after the update, every existing office is set to grace 0, after a dated copy of the data file is saved. Office settings still edits grace per office.

**Architecture:**
- Data `version` goes from 1 to 2. Version 2 means "grace already reset". `emptyData()` returns version 2.
- `migrateGrace(data)` in `store.js` (pure): version 1 → every office `graceMinutes: 0`, `version: 2`. Returns true when it changed anything.
- `main.js` startup: after `loadData`, if `migrateGrace` would change the data, copy `dtr-data.json` byte for byte to `dtr-data-before-grace-0-<stamp>.json` (same naming and no-overwrite rule as the restore copy), then `saveData`. A failed copy or save sets `loadError`, so the app never runs on half-migrated data.
- Backups: `makeBackup` writes data version 2. `readBackup` accepts data version 1 or 2. A version 1 backup is restored with every office at grace 0 (same rule as the data file), so an old backup cannot bring grace 15 back.
- Fallbacks `?? 15` in `App.jsx` and `OfficeDialog.jsx` become `?? 0`. `mergeImport` creates offices with `graceMinutes: 0`.

**Spec:** `spec.md` US-5 (Changed 2026-11-10), the Late rule, and the US-2 LAZARO example.

## Global Constraints

- Copy name: `dtr-data-before-grace-0-YYYYMMDD-HHMMSS.json` in the data folder. Never overwrite an existing copy (`-2`, `-3`, …).
- No copy and no save when there is no data file (first run) or the data is already version 2.
- `computeDtr` and `session()` are unchanged. Grace still comes from the office.
- Backup file format version stays 1. Only `data.version` changes.

## Hand-derived values (sample_data/HRMO (3).xls)

Every arrival later than on-duty in the sample (from the raw rows):

| AC | Name | Date | Session | In | Late at grace 0 |
|---|---|---|---|---|---|
| 568 | RONIE | 7/02 | AM / PM | 08:01 / 13:02 | 1 + 2 = 3 min |
| 611 | LAZARO | 7/02 | AM | 08:01 | 1 |
| 611 | LAZARO | 7/03 | AM | 08:08 | 8 |
| 611 | LAZARO | 7/06 | AM / PM | 08:08 / 13:06 | 8 + 6 = 14 |
| 611 | LAZARO | 7/08 | AM | 08:18 | 18 (same at 15) |
| 611 | LAZARO | 7/09 | AM / PM | 08:06 / 13:03 | 9 |

- Only RONIE and LAZARO change. RELITA and JOANNE anchors are unchanged.
- LAZARO July 1–15 undertime grows by 1 + 8 + 14 + 9 = 32 min versus grace 15, and credit drops by the same 32 where both punches exist. Days totals are checked per test against these rows, not read off the app.

## Review Focus

1. **Startup migration never loses data.** Copy first, then save. A failed copy leaves the file untouched and the app shows the load error.
2. **Second start does nothing.** Version 2 data makes no copy.
3. **Old backup restore** sets grace 0. A version 2 backup keeps its saved grace (for example 10).

---

### Task 1: `migrateGrace` and version 2

**Files:** `src/lib/store.js`, `test/store.test.js`.

- [ ] Tests (red):
  - `migrateGrace` on version 1 data with HRMO 15 and ACCT 10 → both 0, version 2, returns true. Other office fields (`inCharge`, `archived`) kept.
  - `migrateGrace` on version 2 data with grace 10 → unchanged, returns false.
  - `emptyData().version` is 2. `mergeImport` creates an office with `graceMinutes: 0`.
  - Update existing default expectations `graceMinutes: 15` → `0` (lines 25, 67, 68, 111) and any `version: 1` data expectation.
- [ ] Implement. Green, then a mutation check (skip the office loop, see red).

### Task 2: Backups

**Files:** `src/lib/store.js`, `test/store.test.js`.

- [ ] Tests (red):
  - `makeBackup` output has `data.version === 2`.
  - `readBackup` of a version 1 backup with HRMO grace 15 → HRMO grace 0, data version 2.
  - `readBackup` of a version 2 backup with grace 10 → 10.
  - `readBackup` of data version 3 → `Invalid backup: unsupported version`.
- [ ] Implement. Green, then a mutation check.

### Task 3: Startup migration in main

**Files:** `electron/main.js`.

- [ ] After `loadData`: if `migrateGrace(data)` returned true and the data file exists, copy it with the dated name (reuse the restore copy helper, generalized to take the name prefix), then `saveData`. Errors set `loadError`.
- [ ] Covered by E2E in Task 5 (main has no unit tests in this project).

### Task 4: UI fallbacks

**Files:** `src/App.jsx`, `src/OfficeDialog.jsx`.

- [ ] `?? 15` → `?? 0` (App.jsx:50, OfficeDialog.jsx:7 and 11).

### Task 5: E2E

**Files:** `test/e2e/phase7.spec.js` (new), `test/e2e/phase1.spec.js`, `.claude/skills/e2e-testing/SKILL.md` (anchor table).

- [ ] `phase7.spec.js`, `US-5 grace default 0`:
  - Fresh data folder, import HRMO: Office settings shows Grace minutes `0`. RONIE July 1–15 day 2 undertime `0h 3m`. LAZARO day 6 `0h 14m`.
  - Existing data: write a version 1 `dtr-data.json` into the temp folder (built from an HRMO import with HRMO grace 15), launch. HRMO shows `0`. A `dtr-data-before-grace-0-*.json` copy exists and equals the original bytes. Relaunch: no second copy.
  - Old backup: restore a version 1 backup with grace 15 → Office settings shows `0`.
- [ ] `phase1.spec.js` US-5: default `15` → `0`. RONIE 7/02 at default shows 3 min. Setting 15 shows 0 (was "set 0 shows 3"). Justified by US-5 Changed 2026-11-10.
- [ ] Update the anchor table in the e2e-testing skill: grace 0, LAZARO day 6 = 14m.
- [ ] Mutation check per assertion.

---

## Test scope

```
Feature: Phase 7, US-5 (with the US-2 example)
Feature tests: unit for migrateGrace, makeBackup, readBackup, mergeImport default; E2E for US-5 (phase7.spec.js, phase1.spec.js US-5)
Regression E2E: all specs (full run)
System E2E: none (spec.md has no critical workflows)
Full E2E run: yes, the diff changes a business rule (grace default) and the data schema version
```
