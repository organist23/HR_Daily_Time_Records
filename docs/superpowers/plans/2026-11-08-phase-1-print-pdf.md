# Phase 1 — Print, PDF, Office Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print or export a one-page A4 PDF per employee or per office, with a per-office in-charge name and grace minutes, and a one-print override for the in-charge name.

**Architecture:** Main gains three IPC handlers:
- `update-office`: validates via `store.updateOffice`, uses clone, save, then commit.
- `print`: calls `webContents.print`.
- `export-pdf`: calls `showSaveDialog`, then `printToPDF`, then writes to the chosen path only.

Print CSS hides all app UI and prints only `.page` elements. An office batch renders extra pages in a `.print-batch` container that is hidden on screen. While that container exists, it replaces the single preview page in print.

**Tech Stack:** unchanged (Electron, React, Vite, Vitest, Playwright `_electron`).

**Spec:** `spec.md` US-4, US-5. Inherits the Phase 0 conventions in `roadmap.md`.

## Global Constraints

- One DTR per A4 portrait page, no instructions page. `@page { size: A4; margin: 0 }`. `.page` is exactly 210mm × 297mm with the existing inner padding.
- Main writes only to the path returned by its own `showSaveDialog`. The renderer sends a suggested file name, and main uses `path.basename` of it.
- Office data: `{ name, graceMinutes, inCharge }`. A missing `inCharge` reads as `''`.
- Grace is an integer from 0 to 60. The in-charge name is trimmed and at most 100 characters.

## Review Focus

1. **The save dialog is cancelled.** Expect nothing to be written and no error shown. Pinned in Task 3 E2E.
2. **The PDF target is locked or read-only** (open in a PDF viewer). Expect an error message in the status bar and no crash. Pinned in Task 3 E2E (target is a directory path).
3. **Old data files without `inCharge`.** Expect the preview to show a blank line. Pinned in Task 1 unit test (`updateOffice` on Phase 0 data).
4. **A batch export is clicked twice quickly.** Expect one export. Buttons are disabled while busy, pinned in Task 3 E2E (button disabled during export).
5. **A one-print override leaking into the saved default.** Pinned in Task 2 E2E (relaunch shows the saved name).

---

### Task 1: `updateOffice` and `officialHours`

**Files:** Modify `src/lib/store.js`, `src/lib/dtr.js`. Test `test/store.test.js`, `test/dtr.test.js`.

**Interfaces (produces):**
- `updateOffice(data, office: string, { inCharge: string, graceMinutes: number|string }): void`.
  - Throws `Unknown office` if `!Object.hasOwn(data.offices, office)`.
  - Throws `Grace minutes must be a whole number from 0 to 60`.
  - Throws `In-charge name is too long`.
  - Stores the trimmed `inCharge` and the numeric `graceMinutes`.
- `officialHours(punches: Punch[], year, month): string`. Moved out of `App.jsx`, with the same behavior: `'8:00-12:00, 1:00-5:00'`, using the shown month's punches first and falling back to any punch.

- [ ] Write failing tests:
  - Grace `'0'` → `0`.
  - Grace `-1`, `61`, `'abc'`, `1.5` each throw, and the data is unchanged.
  - The in-charge name is trimmed.
  - An unknown office throws.
  - `officialHours` of HRMO July → `'8:00-12:00, 1:00-5:00'`.
  - An empty month falls back to other punches.
  - No punches → `''`.
- [ ] Run (expect red), implement, run (expect green), do a mutation check (drop the range check), commit.

### Task 2: Office settings and in-charge on the form (US-5)

**Files:**
- Create `src/OfficeDialog.jsx`.
- Modify `electron/main.js` (`update-office`), `electron/preload.cjs` (`updateOffice`), `src/App.jsx`, `src/DtrForm.jsx` (prop `inCharge`, printed above "In Charge").
- Test `test/e2e/phase1.spec.js`.

**UI:**
- An "Office settings" button in the preview controls opens a dialog titled `Office settings — <office>`. It has the fields `In-charge name` and `Grace minutes`, plus Save and Cancel. Escape cancels, and a validation error shows inline.
- An `In charge (this print)` text input in the controls defaults to the office's saved name. Editing it changes only the preview and print.

- [ ] Write the failing E2E test:
  - Import HRMO and set `MARIVIC P. SARINAS` with grace `0`. The form shows `MARIVIC P. SARINAS` above `In Charge`. RONIE July 1–15 row 2 minutes = `3` (8:01 and 1:02 with no grace).
  - Override `JUAN DELA CRUZ`: the form shows it. Relaunch: the settings dialog shows `MARIVIC P. SARINAS` and grace `0`.
  - Grace `-5`: an error is shown and the dialog stays open. After Cancel, the saved grace is unchanged.
- [ ] Implement, get green, do a mutation check (save the override as the default), commit.

### Task 3: Print and export PDF (US-4)

**Files:** Modify `electron/main.js` (`print`, `export-pdf`), `electron/preload.cjs`, `src/App.jsx`, `src/app.css`, `src/dtr-form.css`. Test `test/e2e/phase1.spec.js`.

**Interfaces:**
- `print(): Promise<{ ok: boolean, error?: string }>`: `webContents.print({ printBackground: true, pageSize: 'A4', landscape: false }, cb)`.
- `exportPdf(suggestedName: string): Promise<{ path: string } | null>`. Returns `null` when the dialog is cancelled. Uses `printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })`.
- Controls: `Print`, `Export PDF`, `Print office`, `Export office PDF`. All are disabled and show "Working…" while busy.
- File names: `DTR - <NAME> - <period>.pdf` and `DTR - <OFFICE> - <period>.pdf`, where the period is `periodLabel` without the "For the ... of " prefix. Characters `\/:*?"<>|` are removed.
- Results go in the existing `role="status"` bar (`Saved <file>` or the error).

- [ ] Write the failing E2E test. `showSaveDialog` and `webContents.print` are mocked in main (OS boundary).
  - Export PDF for RONIE: the file exists, has 1 page (`/Type /Page` count), and its MediaBox is 595×842 (±1).
  - Export office PDF: 11 pages.
  - Print: the mock receives `pageSize: 'A4'`.
  - Cancelled save: no file, and the status shows nothing new.
  - Save to a directory path: an error is shown.
  - `page.emulateMedia({ media: 'print' })`: `.topbar`, `.sidebar`, `.controls`, `.results` are hidden and exactly 1 `.page` is visible.
- [ ] Implement, get green, do a mutation check (remove the print CSS that hides the sidebar, and remove the page break), commit.
