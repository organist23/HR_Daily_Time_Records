# Phase 5a — Archive and Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin archives, restores, and deletes employees and offices. Archived records leave the sidebar, the office filter, and office print. Delete asks for confirmation naming what goes.

**Architecture:**
- Data: optional `archived: true` on `data.employees[key]` and `data.offices[name]`. Missing means active, so existing files need no migration.
- `store.js`: `setArchived(data, { office, acNo, archived })` (employee when `acNo` is given, else the office), `deleteEmployee(data, { office, acNo })`, `deleteOffice(data, office)`. `mergeImport` keeps an existing employee's fields (so `archived` survives a re-import).
- `main.js`: IPC `set-archived`, `delete-employee`, `delete-office`, each through `mutate`. `preload.cjs` exposes them.
- UI:
  - `groups` in `App.jsx` holds only active offices and employees. `employee` is null when the selected one is no longer active, so the preview closes.
  - `officePages` skips archived employees.
  - Preview controls get `Archive employee` and `Delete employee`. `OfficeDialog` gets `Archive office` and `Delete office`.
  - A topbar `Archived` button toggles an Archived view (same pattern as Holidays) listing archived offices and archived employees, each with `Restore` and `Delete`.
  - New `ConfirmDialog.jsx` for deletes (uses `useDialogKeys`).

**Spec:** `spec.md` US-11 (Changed 2026-11-09). Also closes the US-8 reject "Archived employees appear in the default list".

## Global Constraints

- Safeguards (destructive):
  - Confirmation names the item and the consequence.
  - Cancel and Escape change nothing.
  - The confirm button is disabled while running, and a failure is shown in the dialog.
  - Main rejects unknown employees and offices.
- Archive and restore are reversible, so there is no confirmation. They give a status message.
- Delete employee removes `employees[key]`, plus punches and adjustments with prefix `office|acNo|`. Delete office removes `offices[name]`, plus employees, punches, and adjustments with prefix `office|`. Holidays stay.
- Messages:
  - Archive: `Archived SHARMAINE BANAO (#2025204). Restore it from Archived.`
  - Delete employee confirm: `Delete SHARMAINE BANAO (#2025204) from HRMO? This removes 14 punches and 0 adjustments. This cannot be undone.`
  - Delete office confirm: `Delete office HRMO1? This removes 11 employees, 154 punches, 0 adjustments, and its settings. Holidays stay. This cannot be undone.`
- Store errors: `Unknown employee`, `Unknown office: X`.

## Hand-derived values (sample_data/HRMO (3).xls)

- 11 employees, 14 punch rows each, 154 total. Imported as HRMO and HRMO1, that is 22 employees and 308 punches.
- Archive #2025204 in HRMO: HRMO list 10, all offices 21. Office print of HRMO: 10 pages.
- Delete office HRMO1: 11 employees and 154 punches removed. 11 employees and 154 punches left.

## Review Focus

1. A re-import after archiving keeps the archive (`mergeImport`).
2. The office prefix is not a substring match: deleting office `HR` leaves `HRMO` alone, and deleting AC `14` leaves `140`.
3. Archiving the employee on screen closes the preview, and no stale DTR stays visible.

---

### Task 1: Store

**Files:** `src/lib/store.js`, `test/store.test.js`.

- [ ] Tests (red):
  - Archive and restore an employee, and an office.
  - Unknown employee and unknown office throw.
  - A re-import keeps `archived`.
  - `deleteEmployee` removes 14 punches and the employee's adjustment, and leaves `#14` vs `#140` and other offices intact.
  - `deleteOffice('HR')` leaves `HRMO` intact and removes `HR` settings, employees, punches, and adjustments. Holidays stay.
- [ ] Implement, green, mutation check.

### Task 2: IPC

**Files:** `electron/main.js`, `electron/preload.cjs`.

- [ ] `set-archived`, `delete-employee`, `delete-office` via `mutate`, with string-coerced arguments.

### Task 3: UI

**Files:** `src/App.jsx`, `src/OfficeDialog.jsx`, `src/ConfirmDialog.jsx` (new), `src/ArchivedView.jsx` (new), `src/app.css` (print hide `.archived-view`).

- [ ] Active-only `groups`. Preview closes for an inactive selection. `officePages` skips archived employees.
- [ ] Archive and delete actions with messages and confirm dialogs. Archived view with Restore and Delete, empty state `Nothing archived.`

### Task 4: E2E

**Files:** `test/e2e/phase5a.spec.js` (new).

- [ ] `US-11`, with HRMO and HRMO1 imported:
  - Archive SHARMAINE BANAO #2025204 (HRMO). The preview closes, HRMO shows 10, and the Archived view lists them.
  - Office PDF for HRMO has 10 pages (mocked save dialog, as in Phase 1).
  - A re-import keeps them archived. Restore brings them back to 11.
  - Archive office HRMO1: its heading and filter option are gone. Restore brings them back.
  - Delete employee: Cancel keeps them. Confirm removes them, and a relaunch confirms.
  - Delete office HRMO1: the confirm text names 11 employees and 154 punches. Cancel keeps it, Escape keeps it, Confirm removes it, and a relaunch shows only HRMO.
- [ ] Mutation check on each new assertion.

## Test scope

```
Feature: Phase 5a, US-11
Feature tests: unit (store.test.js), E2E for US-11 (phase5a.spec.js)
Regression E2E: decided by Regression selection. mergeImport (Phase 0), officePages and App.jsx sidebar (Phases 0, 1, 4) are touched, so all specs are expected
System E2E: none, spec.md lists no critical workflows
Full E2E run: yes, mergeImport and App.jsx are in the Shipped as of 2+ phases, and the data shape changes (optional field)
```
