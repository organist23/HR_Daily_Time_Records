# Phase 5b — Backup and Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin saves all data to one backup file and restores it later. Restore checks the file fully before touching anything, asks for confirmation, and first copies the current data file into the data folder.

**Architecture:**
- Backup file: JSON `{ format: 'dtr-analyzer-backup', version: 1, savedAt, data }`, where `data` is the whole store (offices with settings and archive flags, employees, punches, adjustments, holidays).
- `store.js`:
  - `makeBackup(data, savedAt)` returns the file text.
  - `readBackup(text)` parses and validates every record and returns `{ data, savedAt }`. It throws `Invalid backup: …` on anything wrong.
- `main.js`:
  - `backup`: save dialog (default `DTR-backup-YYYY-MM-DD.json` in Documents). Writes only to the picked path. Returns `{ path }`, or `null` on cancel.
  - `restore-pick`: open dialog. Reads the file only if it is at most 50 MB, then `readBackup`. Keeps the result in main as `pendingRestore`, so the renderer never sends data back. Returns a summary: counts, `savedAt`, and the name of the copy it will make (`dtr-data-before-restore-YYYYMMDD-HHMMSS.json`). Throws the validation error.
  - `restore-apply`: requires `pendingRestore`. Copies the current `dtr-data.json` byte for byte to the copy name in the data folder (skipped when there is no file), saves the restored data, clears `loadError`, and returns `{ data, copy }`.
  - `restore-cancel`: clears `pendingRestore`.
- UI: topbar `Backup` and `Restore` buttons.
  - Restore confirmation uses `ConfirmDialog` (new `busyLabel` prop) and names the counts and the copy.
  - Status messages report the result.
  - Restore stays enabled when the data file failed to load, so a restore can recover it.

**Spec:** `spec.md` US-12 (Changed 2026-11-09: automatic copy before restore). Trust boundaries: backup restore (untrusted file), file system writes.

## Global Constraints

- Validation (any failure → `Invalid backup: <what> (<key>)`, nothing changed):
  - `format === 'dtr-analyzer-backup'`, `version === 1`, `data.version === 1`. Each of the 5 maps is a plain object.
  - Offices: key has no `|`, `name === key`, `graceMinutes` an integer 0–60, optional `inCharge` a string of at most 100, optional `archived === true`.
  - Employees: key `office|acNo`, the office exists, non-empty string `acNo`, string `name`, optional `archived === true`.
  - Punches: key `office|acNo|date|session`, the employee exists, ISO date, `AM|PM`, `onDuty`/`offDuty` HH:MM, `in`/`out` HH:MM or `''`, and the record fields match the key.
  - Adjustments: same key rules, `in`/`out` HH:MM or `''`, `onDuty`/`offDuty` HH:MM, string `reason`, string `at`.
  - Holidays: ISO date key, `date === key`, `name` 1–100 characters, `type` in `HOLIDAY_TYPES`.
- Files larger than 50 MB are refused before reading.
- Messages:
  - `Backup saved: DTR-backup-2026-11-09.json`
  - Confirm: `Replace all current data with the backup saved <savedAt>? It has 1 office, 11 employees, 154 punches, 1 adjusted day, 1 holiday. The current data will first be copied to <copy> in the data folder.`
  - Done: `Restored the backup. Previous data copied to <copy>.`
  - Error: `Could not restore: Invalid backup: …`

## Review Focus

1. A corrupt or invalid file changes nothing: no copy is written and the data is unchanged.
2. Cancelling the confirmation writes nothing.
3. The renderer cannot supply the data to restore. Only main's validated `pendingRestore` is applied.
4. The copy is the exact previous file, so a wrong restore can be undone by restoring the copy.

---

### Task 1: `makeBackup` / `readBackup`

**Files:** `src/lib/store.js`, `test/store.test.js`.

- [ ] Tests (red):
  - Round trip of HRMO data with a holiday, an adjustment, an archived employee, and in-charge settings.
  - Not JSON. Wrong format. Wrong version.
  - Each map rejected for bad shape: an office with bad grace, an employee whose office is missing, a punch whose key and fields mismatch, a punch with a bad time, an adjustment for an unknown employee, a holiday with a bad type.
  - A `__proto__` key in a map is rejected as an invalid key, not merged.
- [ ] Implement, green, mutation check.

### Task 2: IPC

**Files:** `electron/main.js`, `electron/preload.cjs`.

### Task 3: UI

**Files:** `src/App.jsx`, `src/ConfirmDialog.jsx` (`busyLabel`).

### Task 4: E2E

**Files:** `test/e2e/phase5b.spec.js` (new).

- [ ] `US-12`:
  - Import HRMO. Add a holiday on 7/03, a 7/01 work-from-home fix for RONIE, archive #2025204, and set the in-charge name.
  - Backup through a mocked save dialog. The file exists and its counts are 1 office, 11 employees, 154 punches.
  - Archive office HRMO and delete it in Archived (all data gone). Restore through a mocked open dialog.
  - Cancel once: no copy file, nothing restored.
  - Confirm: the copy exists in the data folder and equals the pre-restore file. HRMO shows 10 employees (#2025204 still archived). RONIE July 1–15 shows 3 days. The 7/03 holiday is listed. The in-charge name is back. A relaunch keeps it.
  - Invalid file (an edited backup with a bad punch time) and a truncated file: the error is shown, there is no copy, and the data is unchanged.
- [ ] Mutation check on each new assertion.

## Test scope

```
Feature: Phase 5b, US-12
Feature tests: unit (makeBackup/readBackup), E2E for US-12 (phase5b.spec.js)
Regression E2E: decided by Regression selection. App.jsx topbar (Phases 0, 4, 5a) and ConfirmDialog (Phase 5a) are touched
System E2E: none, spec.md lists no critical workflows
Full E2E run: yes, App.jsx is in the Shipped as of 2+ phases
```
