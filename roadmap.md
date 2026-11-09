# Roadmap

## Part one — Import to printed DTR

### Phase 0 — Import and preview ✅ DONE (merged `cdbe3a1`, 2026-11-08)

Proves the core loop: Excel file → stored locally → computed DTR shown on screen, in Electron + React.
Covers US-1, US-2, US-3.

- Admin imports HRMO (3).xls (and other files) and tags each with an office
- Clicking an employee shows their computed single-copy DTR for a month or half-month

**Done when:** importing `sample_data/HRMO (3).xls` lists 11 employees under HRMO, the data survives a restart, and the July 1–15, 2026 DTRs show the US-2 example values. — **Verified** on 2026-11-08 with Playwright `_electron` and Vitest: 27/27 unit, 3/3 E2E. Checked import, re-import, bad and missing-column files, persistence, the US-2 hand-derived values, and the single A4 form for full month and both halves. Results: `PHASE-0-TEST-RESULTS.md`.

Shipped as:
- `src/lib/parse.js`: `readSheetRows`, `parseRows`.
- `src/lib/store.js`: `emptyData`, `resolveOffice`, `mergeImport`, `loadData`, `saveData`.
- `src/lib/dtr.js`: `computeDtr`, `periodRange`, `periodLabel`, `formatTime`, `MONTHS`.
- `electron/main.js`: IPC `load-data`, `pick-excel-files`, `import-files`.
- `electron/preload.cjs`: `window.api`.
- React UI: `src/App.jsx`, `src/ImportDialog.jsx`, `src/DtrForm.jsx`.

Deliberately not built, and why: print/PDF (Phase 1), in-charge settings (Phase 1), holidays and weekend labels (Phase 2), time adjustments (Phase 3), search and filters (Phase 4), archive and backup (Phase 5).

Conventions later phases inherit:
- The renderer never touches `fs` or `xlsx`. All file access goes through main-process IPC, and main reads only paths the admin picked in a dialog.
- Data changes are made on a `structuredClone` and committed to memory only after `saveData` succeeds.
- Record keys are `office|acNo[|date|session]`, and office names cannot contain `|`.
- Layout is one DTR per A4 page, with no instructions page (confirmed 2026-11-08).
- E2E tests follow `.claude/skills/e2e-testing/SKILL.md`, with hand-derived expected values and a mutation check for each assertion.

### Phase 1 — Print, PDF, office settings ✅ DONE (merged `dcc1cac`, 2026-11-08)

Covers US-4, US-5.

- Print and export a one-page A4 PDF for one employee or a whole office
- Per-office in-charge name and grace minutes, with a per-print override for the in-charge name

**Done when:** an exported PDF is one A4 page that matches the preview and shows the office's in-charge name. — **Verified** on 2026-11-08 with Playwright `_electron` and Vitest: 44/44 unit, 5/5 E2E. Checked:
- PDF page count and A4 size (1 page per employee, 11 for HRMO), with the PDF rendered and viewed
- print options, no app UI in print
- cancelled and failed saves
- in-charge and grace settings persisting, and the one-print override not saving

Results: `PHASE-1-TEST-RESULTS.md`.

Shipped as:
- `src/lib/store.js`: `updateOffice`.
- `src/lib/dtr.js`: `officialHours`.
- `electron/main.js`: IPC `update-office`, `print`, `export-pdf`.
- React UI: `src/OfficeDialog.jsx`, plus print and export actions and the `.print-batch` office render in `src/App.jsx`.
- Print CSS in `src/app.css` and `src/dtr-form.css`.

Deliberately not built, and why: holidays (Phase 2), adjustments (Phase 3).

Conventions later phases inherit:
- Anything that must print goes inside a `.page` box. Print CSS hides all other UI.
- Multi-page jobs render into `.print-batch` and then call `print` or `export-pdf` once.
- Main writes only to paths from its own dialogs.
- Status messages go through `onNotice([{ ok, text }])`. IPC errors are shown with `ipcError(e)`.
- E2E temp folders come only from `tmpDir()`, which global teardown deletes.

### Phase 2 — Holidays and weekends ✅ DONE (merged `98fae7f`, 2026-11-08)

Covers US-6.

- Holiday add/edit/delete with type and a calendar view
- Holiday and weekend labels across the DTR rows

**Done when:** adding a Regular Holiday on 7/03/2026 shows its label on employees with no punches that day, and Saturdays/Sundays show their labels. — **Verified** on 2026-11-08 with Playwright `_electron` and Vitest: 64/64 unit, 7/7 E2E. Checked:
- add, edit, delete and relaunch
- duplicate dates rejected
- labels on MARY ANN 7/03 and July 4/5, with RELITA's 7/03 times kept
- the calendar and DTR screenshots

Results: `PHASE-2-TEST-RESULTS.md`.

Shipped as:
- `src/lib/store.js`: `setHoliday`, `deleteHoliday`.
- `src/lib/dtr.js`: `HOLIDAY_TYPES`, `daysIn`, and `computeDtr({ holidays })` with `row.label`.
- `electron/main.js`: IPC `save-holiday`, `delete-holiday`, plus the `mutate` helper.
- React UI: `src/HolidaysView.jsx`, `src/HolidayDialog.jsx`, `src/useDialogKeys.js`.

Picked up from phase 1: the office print blank-page warning (merged `d500338`). After an office print or PDF it lists employees with no time records.

Conventions later phases inherit:
- Every data change in main goes through `mutate(change)` (clone, change, save, commit).
- Holidays and weekends never charge undertime, and their label shows only when the day has no times.
- Dialogs use `useDialogKeys(firstRef, onCancel, busy)`.
- The DTR preview stays mounted while hidden, so E2E tests scope duplicate labels (Month, Year) to the visible view.

### Phase 3 — Time adjustments ✅ DONE (merged `86974a3`, 2026-11-09)

Covers US-7.

- Add, edit, clear, and revert any AM/PM time with a reason

**Done when:** a work-from-home entry on a holiday shows the times, recomputes the days total, and survives a re-import. — **Verified** on 2026-11-09 with Playwright `_electron` and Vitest: 86/86 unit, 8/8 E2E. Checked:
- the RONIE 7/01 work-from-home fix (2 → 3 days)
- a 7/13 no-row day
- validation errors
- re-import, relaunch and revert
- no marks in print
- the unit test for adjusted times on a holiday

Results: `PHASE-3-TEST-RESULTS.md`.

Shipped as:
- `src/lib/store.js`: `adjustDay`, `revertDay`.
- `src/lib/dtr.js`: `effectivePunches`, and `row.adjusted` from `computeDtr`.
- `electron/main.js`: IPC `adjust-day`, `revert-day` (timestamp from main's clock).
- React UI: `src/AdjustDialog.jsx`, and clickable day numbers in `src/DtrForm.jsx` (app view only).

Conventions later phases inherit:
- Device punches are never edited. Everything shown or printed comes from `effectivePunches(device, adjustments, office, acNo)`.
- Admin adjustments always win over later imports.
- Anything that must not print gets a screen-only style plus a `@media print` reset, checked with `emulateMedia({ media: 'print' })` and then reset with `{ media: null }`.

### Phase 6 — Non-working days always labeled ✅ DONE (merged `a75a8e6`, 2026-11-09)

Reopens Phase 2: US-6 changed (labels always win, 0 credit on holidays and weekends).
Reopens Phase 3: US-7 changed (adjustments limited to workdays).
Supersedes Phase 2 convention: "their label shows only when the day has no times" → the label always shows on holidays and weekends, admin decision 2026-11-09.

- `computeDtr` shows the label and skips credit and undertime on holidays and weekends, even with punches or adjustments
- Clicking a holiday or weekend day number shows a non-working-day message instead of the adjust dialog, and main rejects `adjust-day` on those dates
- Existing adjustments on those days stay stored and show again if the holiday is deleted

**Done when:** with a Special Non-Working Holiday on 7/01/2026, JOANNE M ESTRADA's July 1 row shows `SPECIAL NON-WORKING HOLIDAY` and her days total drops by that day's credit. RELITA 7/03 holiday shows the label. July 4/5 show `SATURDAY`/`SUNDAY` even with punches. Adjusting a weekend or holiday is refused. Test scope includes regression selection for US-2 totals and US-7 workday adjustments. — **Verified** on 2026-11-09 with Playwright `_electron` and Vitest: 90/90 unit, 10/10 E2E (full run). Checked:
- JOANNE 7/01 holiday: label, 6 → 5 days, then back after delete
- RONIE 7/01: workday undertime (4h) returns after the holiday is deleted
- RELITA 7/03 label replaces punches
- UI and main both refuse adjusting July 1 (holiday) and July 4 (Saturday)
- a hidden adjustment comes back after the holiday is deleted

Results: `docs/test-results/PHASE-6-TEST-RESULTS.md`.

Shipped as:
- `src/lib/dtr.js`: `offDayLabel`, and `computeDtr` with the label always winning.
- `src/lib/store.js`: `adjustDay` refuses non-working days.
- React UI: `openAdjust` in `src/App.jsx` (non-working-day notice).

Deliberately not built, and why: moving or deleting existing holiday/weekend adjustments (data stays, user decision), Phase 4 features.

Conventions later phases inherit:
- Whether a day is a workday comes only from `offDayLabel(date, holidays)`. Use it in the UI, store, and computation, never a separate weekday check.
- Holiday and weekend rows have no times, no credit, and no undertime. Deleting a holiday makes that day a workday again.
- `docs/test-results/` is tracked. `.gitignore` ignores only the root `/test-results/`.

### Phase 4 — Find and check NEXT

Paused 2026-11-09: Phase 6 built first by user decision. Not started, so no branch. Becomes NEXT when Phase 6 is DONE.

Covers US-8, US-9, US-10.

- Office filter and live name/AC-No search
- Date lookup of who worked
- Live date and time display

**Done when:** searching "lazaro" under HRMO opens his DTR, and the 7/03/2026 lookup shows the US-9 statuses.

### Phase 5 — Archive, delete, backup LATER

Covers US-11, US-12.

- Archive/restore and delete for employees, imports, and offices
- Backup to one file and restore from it

**Done when:** a backup restored after deleting all data brings back every office, employee, adjustment, and holiday.
