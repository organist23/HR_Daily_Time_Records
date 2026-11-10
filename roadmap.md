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

### Phase 4 — Find and check ✅ DONE (merged `1b31f95`, 2026-11-09)

Paused 2026-11-09: Phase 6 built first by user decision. Not started, so no branch. Becomes NEXT when Phase 6 is DONE.

Covers US-8, US-10. US-9 withdrawn 2026-11-09 before merge (user decision: the sidebar filter and search are enough).

- Office filter and live name/AC-No search
- Live date and time display

**Done when:** searching "lazaro" under HRMO opens his DTR, and the clock ticks every second. — **Verified** on 2026-11-09 with Playwright `_electron` and Vitest: 90/90 unit, 12/12 E2E (full run). Checked:
- office filter (`HRMO1` 11 of 22)
- case-insensitive name and AC-No search, including `#14`
- the no-match message and opening LAZARO's DTR
- the clock under an installed fake clock: 10:00:00 → 10:00:02 → 10:01:02

Results: `docs/test-results/PHASE-4-TEST-RESULTS.md`.

Shipped as:
- React UI in `src/App.jsx`: the sidebar `Office filter` select and `Search name or AC-No` input (`shown` memo), the `open(key)` helper, and the `Clock` component in the topbar.
- Styles: `.sidebar-filters`, `.top-left`, `.clock` in `src/app.css`.

Deliberately not built, and why: US-9 date check (withdrawn), archived-employee filtering (Phase 5 owns archive).

Conventions later phases inherit:
- The sidebar shows the `shown` groups (filtered). `groups` stays the full list for anything that needs every office.
- Date and time in tests come from `app.context().clock.install(...)` plus `page.reload()`, never the real clock.

### Phase 5a — Archive and delete ✅ DONE (merged `9dc683c`, 2026-11-09)

Split from Phase 5 on 2026-11-09 (too big for one build, user decision).

Covers US-11.

- Archive and restore for employees and offices, with an Archived view
- Delete for archived employees and offices, only from the Archived view, with confirmation naming what goes

**Done when:** archiving duplicate SHARMAINE BANAO (#2025204) hides them from the HRMO list and office print, restoring brings them back, the DTR screen and Office settings have no delete button, and deleting the archived HRMO1 office from Archived removes its employees and their punches after confirmation. — **Verified** on 2026-11-09 with Playwright `_electron` and Vitest: 96/96 unit, 13/13 E2E (full run). Checked:
- archiving #2025204: HRMO 11 → 10, office PDF 10 pages, kept on re-import, restored
- archiving office HRMO1: group and filter option gone, filter reset, archived-import notice, restored
- no delete button on the DTR screen or in Office settings
- deleting from Archived, with Cancel and Escape keeping data: employee (14 punches) and office (10 employees, 140 punches), which persist after relaunch

Results: `docs/test-results/PHASE-5A-TEST-RESULTS.md`.

Shipped as:
- `src/lib/store.js`: `setArchived`, `deleteEmployee`, `deleteOffice`, and `mergeImport` keeping existing employee fields.
- `src/lib/dtr.js`: `isDayKeyOf`.
- `electron/main.js`: IPC `set-archived`, `delete-employee`, `delete-office`.
- React UI: `src/ArchivedView.jsx`, `src/ConfirmDialog.jsx`, `Archive office` in `src/OfficeDialog.jsx`, `Archive employee` and the `records` actions, `isActive`, and the `Archived` topbar view in `src/App.jsx`.

Deliberately not built, and why: backup and restore (Phase 5b), delete-import (dropped from US-11), confirmation on holiday Delete (Phase 2 gap, reported for a separate Amend).

Conventions later phases inherit:
- Records are hidden with an optional `archived: true` on `employees[key]` or `offices[name]`. Use `isActive(data, emp)` for anything that lists or prints employees.
- Delete is offered only in the Archived view, behind `ConfirmDialog`, which names the record and what goes with it.
- An employee's day keys are matched with `isDayKeyOf(key, office, acNo)`, never a bare prefix.

### Phase 5b — Backup and restore ✅ DONE (merged `4519b38`, 2026-11-09)

Covers US-12.

- Backup to one file and restore from it, with an automatic copy of the current data first

**Done when:** a backup restored after deleting all data brings back every office, employee, adjustment, and holiday. — **Verified** on 2026-11-09 with Playwright `_electron` and Vitest: 114/114 unit, 14/14 E2E (full run, Part one complete). Checked:
- backup to a picked file
- delete the office and the holiday, then restore: Cancel writes nothing, Confirm copies the old file byte for byte first
- everything came back: archived employee, adjustment, holiday, and in-charge name, and it persists after relaunch
- a second restore keeps the first copy
- invalid and truncated files change nothing

Results: `docs/test-results/PHASE-5B-TEST-RESULTS.md`.

Shipped as:
- `src/lib/store.js`: `makeBackup`, `readBackup`.
- `src/lib/dtr.js`: `adjustedDayCount`.
- `electron/main.js`: IPC `backup`, `restore-pick`, `restore-cancel`, `restore-apply`.
- React UI: `Backup` and `Restore` in the `src/App.jsx` topbar, and the `busyLabel` prop in `src/ConfirmDialog.jsx`.

Deliberately not built, and why: scheduled or automatic backups (not in US-12), and an E2E for retrying after a disk error (no outer-boundary way to make the write fail).

Conventions later phases inherit:
- A new field in the data must also be added to `readBackup` (both its checks and the rebuilt object), or restore drops it.
- Untrusted files are read only in main, checked fully, and applied only after confirmation. The renderer never sends the data to apply.

## Part two — LGU computation rules

### Phase 7 — Grace default 0 ✅ DONE (merged `c5582fb`, 2026-11-10)

Covers US-5 (changed 2026-11-10), with the US-2 example it changes.
Reopens Phase 0: US-2 example at grace 0. Reopens Phase 1: US-5 grace default 15 → 0.

- New offices default to grace 0
- On first start after the update, every existing office is set to grace 0, after a dated copy of the data is saved
- Office settings still lets the admin set grace per office

**Done when:** a newly imported office shows Grace minutes `0`, HRMO shows `0` after the update, LAZARO 7/06/2026 shows 0h 14m undertime, and RONIE 7/02/2026 shows 0h 3m. — **Verified** on 2026-11-10 with Playwright `_electron` and Vitest: 120/120 unit, 18/18 E2E (full run). Checked:
- new office at grace 0, with RONIE 7/02 at 3m and LAZARO 7/06 at 14m
- a version 1 data file with HRMO at 15 shows 0, and its copy is byte-equal to the original
- the update runs once, and a later grace of 15 survives a relaunch
- an old backup restores at grace 0
- a broken version 1 file shows an error and is left untouched

Results: `docs/test-results/PHASE-7-TEST-RESULTS.md`.

Shipped as:
- `src/lib/store.js`: `migrateGrace`, plus `emptyData` (version 2), the `mergeImport` office default, and `makeBackup`/`readBackup` (data version 1 or 2).
- `electron/main.js`: the startup grace migration, and `copyCurrent` shared with `restore-apply`.
- React UI: grace fallbacks `?? 0` in `src/App.jsx` and `src/OfficeDialog.jsx`.

Deliberately not built, and why: removing the grace setting (admin chose default 0, not removal), morning-only late, daily rate, late deduction, red late arrivals, and T.O./leave marks (pending, not yet amended into the spec).

Conventions later phases inherit:
- Data `version` is 2. A later data change bumps it and migrates in both places old data arrives: the startup block in `main.js` and `readBackup`.
- Startup changes to the data file copy it first with `copyCurrent(copyName(new Date(), '<what>'))`, and only the instance holding the single-instance lock writes.
- A failed startup update sets `loadError` and leaves the file untouched (admin decision 2026-11-10: block rather than run on half-updated data).

### Phase 8 — Night shift ✅ DONE (merged `3d3f70f`, 2026-11-10)

Covers US-13, with the US-1, US-2, US-6, and US-7 changes it makes.
Reopens Phase 0: rows placed by `On duty`, night-shift computation. Reopens Phase 3: adjustments on weekend and holiday night-shift rows. Reopens Phase 6: night-shift rows show times on weekends and holidays.

- `NIGHT_shift.xls` imports all 30 rows
- A night shift is credited across midnight, split between the start-day P.M. row and the next-day A.M. row
- Night-shift rows show their times and count on weekends and holidays
- Day-employee DTRs stay the same

**Done when:** EFREN ALCANTARA September 1–15, 2026 shows `9 days`, 9/02 `5:12` and 9/03 `6:01`, Saturday 9/05 shows `6:00`, and the HRMO July 2026 DTRs match their Phase 7 values. — **Verified** on 2026-11-10 with Playwright `_electron` and Vitest: 137/137 unit, 19/19 E2E (full run). Checked:
- `NIGHT_shift.xls` imports 30 rows, 0 skipped
- EFREN September 1–15: `9 days`, undertime 19h 7m, 9/02 `5:12`, 9/03 `6:01`, Saturday 9/05 `6:00`, 9/14 13h undertime
- holidays on 9/08 and 9/15 keep the guard's times
- the labeled 9/15 holiday opens Adjust, and the 06:00 departure gives `11 days`
- every HRMO anchor unchanged

Results: `docs/test-results/PHASE-8-TEST-RESULTS.md`.

Shipped as:
- `src/lib/parse.js`: `parseRows` (session from `On duty`, a repeated day and session skipped).
- `src/lib/dtr.js`: `isNightStart`, `shiftDate`, `nightShift`, and `computeDtr` with `row.night`.
- `src/lib/store.js`: `adjustDay` (night rows allowed on weekends and holidays).
- React UI: `openAdjust` in `src/App.jsx` (labeled night rows open the dialog).

Deliberately not built, and why: other shift patterns (out of scope), removing grace (admin: not yet), and the pending morning-only late, daily rate, deduction, red late arrival, and T.O./leave marks (not yet amended into the spec).

Conventions later phases inherit:
- A row's session comes from its `On duty` (before 12:00 is A.M.), never from the Timetable name.
- A night shift is a P.M. row with `Off duty` `23:59` plus the next day's A.M. row. Code that reads a day's times must check `row.night` before treating a weekend or holiday as non-working.
- Night credit is split at midnight onto the two rows, so each half-month period counts only its own rows.

## Part three — Night-shift device fixes

### Phase 9 — Early departure filed as Clock In ✅ DONE (merged `dd3ce9d`, 2026-11-10)

Covers US-13 (changed 2026-11-10).
Reopens Phase 8: a lone Clock In on a night shift's A.M. row is the departure.

- RENATO 10/05 → 10/06 05:57 and REYGAN 10/09 → 10/10 05:58 count as complete shifts
- The punch shows in the A.M. Departure cell
- Day-employee DTRs and the `NIGHT_shift.xls` values stay the same

**Done when:** importing `sample_data/GSO_.xls` shows RENATO 10/06 A.M. Departure `5:57`, his 10/05 shift credits 777 min, and EFREN's `NIGHT_shift.xls` September 1–15 is still `9 days`. — **Verified** on 2026-11-10 with Playwright `_electron` and Vitest: 141/141 unit, 20/20 E2E (full run). Checked:
- `GSO_.xls` imports 2,851 rows
- RENATO 10/06 shows `5:57` as the A.M. departure on the form and in the Adjust dialog
- 10/05 → 10/06 credits 777 with 3 min early
- REYGAN 10/09 → 10/10 credits 772
- day employees and `NIGHT_shift.xls` unchanged

Results: `docs/test-results/PHASE-9-TEST-RESULTS.md`.

Shipped as:
- `src/lib/parse.js`: `parseRows` (a lone Clock In on a night A.M. row is stored as the Clock Out).

Deliberately not built, and why: the pending morning-only late, daily rate, deduction, red late arrival, and T.O./leave marks (not yet amended into the spec).

Conventions later phases inherit:
- Device quirks are corrected once in `parseRows`, so every reader (`computeDtr`, the Adjust dialog, `adjustDay`) sees the same punch. Never correct a punch only for display.

## Part four — DTR display

### Phase 10 — Show or hide undertime and total ✅ DONE (merged `329dcef`, 2026-11-10)

Covers US-14.
Reopens Phase 0: US-3 preview shows undertime and total blank by default. Reopens Phase 1: US-4 print and PDF follow the toggle.

- One toolbar button toggles the undertime cells, the days total, and the undertime total
- Hidden at every start, for screen, print, PDF, and office batches

**Done when:** a freshly opened DTR shows blank undertime and Total values, an exported PDF has them blank, Show brings back RONIE July 1–15 `2 days` and 20h, and arrival and departure times show in both states. — **Verified** on 2026-11-10 with Playwright `_electron` and Vitest: 141/141 unit, 21/21 E2E (full run). Checked:
- hidden by default on screen and under print media
- Print office prints 11 pages with no days total while hidden and 11 with it while shown
- the toggle is locked during a job
- the shown state carries across employees and resets on relaunch
- RONIE `2 days` and 20h come back
- arrival and departure times show in both states

Results: `docs/test-results/PHASE-10-TEST-RESULTS.md`.

Shipped as:
- `src/DtrForm.jsx`: `showTotals` prop (default `false`).
- React UI: `showTotals` state in `App`, and the `Show/Hide undertime and total` button in `Preview` in `src/App.jsx`.

Deliberately not built, and why: saving the toggle to the data file (admin chose hidden at every start), and the pending morning-only late, daily rate, deduction, red late arrival, and T.O./leave marks (not yet amended into the spec).

Conventions later phases inherit:
- Every `DtrForm` render passes `showTotals`. Session-wide display settings live in `App` state, since `Preview` remounts per employee.
- E2E specs that read undertime or totals call `showTotals(page)` from `test/e2e/helpers.js` after the first employee opens in each launch.
