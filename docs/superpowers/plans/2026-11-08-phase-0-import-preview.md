# Phase 0 — Import and Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import device Excel files per office into local storage and show a computed single-copy CS Form 48 DTR for any employee and period.

**Architecture:** The Electron main process owns the file system: it picks files, parses them with SheetJS, and saves one JSON file in the data folder. Pure modules in `src/lib/` do the parsing, merging, and DTR computation, and Vitest tests them directly. The React renderer (built by Vite) talks to main only through a `window.api` preload bridge, and renders the form as an A4 HTML page.

**Tech Stack:** Electron, React 18, Vite, SheetJS `xlsx` 0.20.3 (vendor tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, because npm `xlsx@0.18.5` has known CVEs), Vitest, Playwright (`_electron`).

**Spec:** `spec.md` (US-1, US-2, US-3 and "Computation rules").

## Global Constraints

- JavaScript (ESM, `"type": "module"`). Preload is `electron/preload.cjs`. No TypeScript.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer never touches `fs` or `xlsx`.
- Data folder: `process.env.DTR_DATA_DIR || app.getPath('userData')`. One file `dtr-data.json`, written atomically (temp file + rename).
- Employee key: `office|acNo`. Punch key: `office|acNo|date|session`. `date` is ISO `YYYY-MM-DD`. `session` is `AM` (Timetable `Morning`) or `PM` (`Afternoon`).
- Required columns, matched case-insensitively after trimming: `AC-No.`, `Name`, `Date`, `Timetable`, `On duty`, `Off duty`, `Clock In`, `Clock Out`. The device's `Late`, `Early`, and `Absent` columns are never read.
- New offices get `graceMinutes: 15`.
- Displayed times are 12h `h:mm` without AM/PM.
- One DTR per A4 portrait page, with text from the reference docx. Font: Arial (template Normal style), header "Civil Service Form No. 48" italic 8pt, "DAILY TIME RECORD" bold 12pt centered, table header 7–9pt.

## Review Focus

1. **A second file for the same office that overlaps dates.** Expect rows to be updated in place with no duplicates. Pinned in Task 2 `mergeImport` test.
2. **An `.xlsx` whose Date cells are real Excel dates, not text.** Expect it to parse the same as text dates. Pinned in Task 1 test (`parseDate` accepts `M/D/YYYY` and `YYYY-MM-DD`, and `sheet_to_json` runs with `raw:false` so date cells arrive as text).
3. **Name changes between imports for the same AC-No.** Expect the latest import's name to win. Pinned in Task 2 test.
4. **Office name typed with extra spaces or different case** ("hrmo " vs "HRMO"). Expect the name to be trimmed and to match an existing office case-insensitively. Pinned in Task 2 test.
5. **A crash or kill during save.** Expect the previous data file to stay intact. Pinned in Task 2 test (atomic write: the temp file is renamed only after a full write).

---

### Task 1: Project setup and Excel parser

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore` (`node_modules`, `dist`, `test-results`)
- Create: `src/lib/parse.js`
- Test: `test/parse.test.js` (reads `sample_data/HRMO.xls` as the captured fixture)

**Interfaces:**
- Produces:
  - `readSheetRows(buffer: Buffer): string[][]`: first sheet, `sheet_to_json(ws, {header:1, raw:false, defval:''})`.
  - `parseRows(rows: string[][]): { records: Punch[], skipped: number }`. Throws `Error('Missing columns: X, Y')` when required headers are absent.
  - `Punch = { acNo, name, date: 'YYYY-MM-DD', session: 'AM'|'PM', onDuty: 'HH:MM', offDuty: 'HH:MM', in: 'HH:MM'|'', out: 'HH:MM'|'' }`.
  - `package.json` scripts: `test` = `vitest run`, `build` = `vite build`, `start` = `vite build && electron .`, `test:e2e` = `vite build && playwright test`.

- [ ] **Step 1: Set up the project.** Run `npm init`. Install deps: `react react-dom xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Install dev deps: `electron vite @vitejs/plugin-react vitest @playwright/test`. In `vite.config.js`, set `base: './'`, `build.outDir: 'dist'`, and point the vitest include at `test/*.test.js`.
- [ ] **Step 2: Write the failing tests**
  - `parses HRMO.xls`: `records.length === 154`, `skipped === 0`, 11 distinct `acNo`, and record `14 / 2026-07-01 / AM` equals `{acNo:'14', name:'RELITA BARAYA', date:'2026-07-01', session:'AM', onDuty:'08:00', offDuty:'12:00', in:'07:58', out:'12:01'}`.
  - `missing punch is empty string`: `14 / 2026-07-03 / PM` has `in:''` and `out:'17:00'`.
  - `missing columns`: HRMO rows with the `Clock Out` column removed throw `/Missing columns: Clock Out/`.
  - `bad rows skipped`: append `['1','X','13/45/2026','Morning','08:00','12:00','','','','','']` and `['1','X','7/01/2026','Morning','08:00','12:00','25:99','','','','']`, and expect `skipped === 2`.
  - `ISO date accepted`: date `2026-07-01` yields `date:'2026-07-01'`.
- [ ] **Step 3: Run `npm test`.** Expect FAIL (module missing).
- [ ] **Step 4: Implement `src/lib/parse.js`.** Find header positions by name. Skip rows where every cell is empty. Skip and count rows with an invalid date, an unknown Timetable, or a time not matching `^([01]?\d|2[0-3]):[0-5]\d$`. Pad times to `HH:MM`.
- [ ] **Step 5: Run `npm test`.** Expect PASS. Then do the mutation check: make the parser read the `Late` column for `in` and confirm the tests go red.
- [ ] **Step 6: Commit** `feat: parse device Excel export`.

### Task 2: Local store and import merge

**Files:**
- Create: `src/lib/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: `Punch` from Task 1.
- Produces:
  - `emptyData(): Data`. `Data = { version: 1, offices: {[name]: {name, graceMinutes}}, employees: {[office|acNo]: {office, acNo, name}}, punches: {[office|acNo|date|session]: Punch & {office}} }`.
  - `resolveOffice(data: Data, typed: string): string`: trims, then returns the existing office name on a case-insensitive match, otherwise the trimmed input. Throws on empty.
  - `mergeImport(data: Data, office: string, records: Punch[]): { added: number, updated: number }`: mutates `data`, creating the office (grace 15) and the employees.
  - `loadData(dir: string): Data`: returns `emptyData()` if the file is missing. Throws if the file is corrupt, without overwriting it.
  - `saveData(dir: string, data: Data): void`: writes `dtr-data.json.tmp`, then renames it.

- [ ] **Step 1: Write the failing tests**
  - Merging HRMO records into `HRMO` gives `added 154`. Merging again gives `added 0, updated 154`, with 154 punch keys and 11 employees.
  - The same AC-No with a new name: the employee name becomes the new name.
  - `resolveOffice(data with HRMO, ' hrmo ') === 'HRMO'`. `resolveOffice(data, '  ')` throws.
  - Save, then load, in an `os.tmpdir()` folder returns an equal object, and no `.tmp` file remains.
  - Loading a folder whose `dtr-data.json` contains `{bad` throws, and the file content is unchanged.
- [ ] **Step 2: Run `npm test`.** Expect FAIL.
- [ ] **Step 3: Implement `src/lib/store.js`** with Node `fs`.
- [ ] **Step 4: Run `npm test`.** Expect PASS. Mutation check: drop the key dedupe (always add) and confirm red.
- [ ] **Step 5: Commit** `feat: local JSON store with import merge`.

### Task 3: DTR computation

**Files:**
- Create: `src/lib/dtr.js`
- Test: `test/dtr.test.js`

**Interfaces:**
- Consumes: `Punch` (Task 1).
- Produces:
  - `formatTime(hhmm: string): string`. `'13:02'` → `'1:02'`, `'08:00'` → `'8:00'`, `'12:05'` → `'12:05'`, `''` → `''`.
  - `periodLabel(year, month, half): string`:
    - `'full'` → `'For the month of July 2026'`.
    - `'first'` → `'For the period of July 1-15, 2026'`.
    - `'second'` → `'For the period of July 16-31, 2026'` (end = last day of the month).
  - `computeDtr({ punches: Punch[], year: number, month: number /*1-12*/, half: 'full'|'first'|'second', graceMinutes: number }): { rows: Row[], totalUndertime: number /*min*/, credited: number /*min*/, days: number }`.
  - `Row = { day: 1..31, amIn, amOut, pmIn, pmOut /*display strings*/, undertime: number /*min*/ }`. There are always 31 rows. Rows outside the period or month have empty strings and undertime 0.
  - Rules: exactly the spec's "Computation rules". Late counts only when `in > onDuty + grace`, and then equals `in − onDuty`. Early = `offDuty − out` when positive. A session with exactly one punch has undertime = session length and credit 0. A session with no punches has undertime 0 and credit 0. A session with both punches has credit = length − late − early (≥ 0). `days = floor(credited / 480)`.

- [ ] **Step 1: Write the failing tests.** Each expectation below is hand-derived from HRMO.xls rows.
  - RONIE (568) July `first`, grace 15: row 1 `amIn '8:00'`, `amOut ''`, `pmIn ''`, `pmOut ''`, `undertime 240`.
  - LAZARO (611) July `first`: row 8 undertime 18 (8:18). Row 6 undertime 0 (8:08 and 1:06 within grace).
  - RELITA (14) July `first`: 13 complete on-time sessions plus 1 session missing a punch (7/03 PM). So `credited 3120`, `days 6`, `totalUndertime 240`, row 3 `pmIn ''`, `pmOut '5:00'`.
  - Grace 0: RONIE row 2 (8:01, 1:02) undertime 3.
  - A synthetic punch 8:00–12:00 and 13:00–17:00 for 7 days gives `days 7`. Arrival 07:00, departure 18:00 still credits 480 per day.
  - `second` half: rows 1–15 are empty even when punches exist. September `full`: row 31 is empty.
  - `formatTime` and `periodLabel` cases from the Interfaces block.
- [ ] **Step 2: Run `npm test`.** Expect FAIL.
- [ ] **Step 3: Implement `src/lib/dtr.js`.**
- [ ] **Step 4: Run `npm test`.** Expect PASS. Mutation check: remove the grace comparison and confirm the LAZARO row 6 test goes red.
- [ ] **Step 5: Commit** `feat: compute DTR rows, undertime and days`.

### Task 4: Electron shell, import flow, employee list

**Files:**
- Create: `electron/main.js`, `electron/preload.cjs`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/ImportDialog.jsx`, `src/app.css`
- Modify: `package.json` (`"main": "electron/main.js"`)
- Test: `test/e2e/phase0.spec.js`, `playwright.config.js`

**Interfaces:**
- Consumes: `readSheetRows`, `parseRows` (Task 1). `loadData`, `saveData`, `mergeImport`, `resolveOffice` (Task 2).
- Produces the IPC surface used by the renderer as `window.api`:
  - `pickExcelFiles(): Promise<string[]>`: `dialog.showOpenDialog` with filters `xls, xlsx`, multiSelections.
  - `importFiles(items: {path: string, office: string}[]): Promise<{ results: {file, office, ok, added, updated, skipped, error}[], data: Data }>`. A failure in one file does not stop the others. Data is saved once at the end. The main process re-checks that each path ends in `.xls`/`.xlsx` and reads only the paths the user picked in this session. That set is held in main, so the renderer cannot ask main to read an arbitrary file.
  - `loadData(): Promise<Data>`.
- UI:
  - Top bar with an "Import Excel" button.
  - Left sidebar with employees grouped by office, sorted by name, each showing name and AC-No.
  - Main area with the DTR preview (Task 5).
  - The import dialog lists each picked file with an office text input (default = file name without extension, with a datalist of existing offices) plus Import and Cancel. Escape cancels and Enter imports.
  - States:
    - Empty: "No records yet. Import an Excel file to start."
    - Loading: the button shows "Importing…" and is disabled.
    - Result: a per-file summary (`added / updated / skipped`), or an error naming the file.

- [ ] **Step 1: Write the failing E2E test** with Playwright `_electron.launch({ args: ['.'], env: { ...process.env, DTR_DATA_DIR: tmp } })`. Mock `dialog.showOpenDialog` via `app.evaluate` (OS dialog = outer boundary).
  - Empty state text is visible.
  - Import `sample_data/HRMO.xls`: the office input value is `HRMO`. After Import, the sidebar shows office `HRMO` with 11 employees and the summary shows `154 added`.
  - Close and relaunch with the same `DTR_DATA_DIR`: the sidebar still shows 11 employees.
  - Re-import the same file: the summary shows `0 added, 154 updated` and there are still 11 employees.
  - Import HRMO.xls together with a `.txt` file renamed `bad.xls` (garbage bytes): the summary shows an error naming `bad.xls`, and HRMO still imports.
  - A generated `.xlsx` (HRMO rows without `Clock Out`, written by `xlsx` in the test): the error says `Missing columns: Clock Out`, and the employee count is unchanged.
- [ ] **Step 2: Run `npm run test:e2e`.** Expect FAIL.
- [ ] **Step 3: Implement** the main process, preload, App, and ImportDialog.
- [ ] **Step 4: Run `npm run test:e2e`.** Expect PASS. Mutation check: skip `saveData` and confirm the relaunch assertion goes red.
- [ ] **Step 5: Commit** `feat: electron import flow and employee list`.

### Task 5: DTR preview form

**Files:**
- Create: `src/DtrForm.jsx`, `src/dtr-form.css`
- Modify: `src/App.jsx` (period controls and the selected employee)
- Test: extend `test/e2e/phase0.spec.js`

**Interfaces:**
- Consumes: `computeDtr`, `periodLabel` (Task 3).
- Produces: `<DtrForm name, periodText, officialHours, result />`, where `result` is the return value of `computeDtr`.
- Form, top to bottom:
  - "Civil Service Form No. 48".
  - "DAILY TIME RECORD".
  - "-----o0o-----".
  - The name on an underline with "(Name)" below.
  - The period label.
  - "Official hours for arrival and departure", with Regular days `8:00-12:00, 1:00-5:00` (from the employee's punches' onDuty/offDuty, via `formatTime`) and a blank Saturdays line.
  - The table:
    - Header rows: Day / A.M. / P.M. / Undertime, then Arrival / Depar-ture / Arrival / Depar-ture / Hours / Min-utes.
    - Rows 1–31.
    - Total row: `<days> days` across the time cells, and the total undertime hours and minutes. Undertime shows blank when 0.
  - The certification text (italic).
  - The employee name on the signature line with "SIGNATURE OVER PRINTED NAME".
  - "VERIFIED as to the prescribed office hours:".
  - A blank in-charge line with "In Charge" (Phase 1 fills in the name).
- Sizing: `@page { size: A4 portrait; margin: 0.5in 0.7in }`. Column ratios follow the template grid 468 : 720 ×5 : 540. Scale the form to the page content width, and set row heights so the whole form fits one A4 page.
- Period controls: month and year selects (default = month of the employee's latest punch), and a Full / 1–15 / 16–31 toggle. Clicking an employee selects them. With no selection, show "Select an employee to preview their DTR."

- [ ] **Step 1: Extend the E2E test.**
  - Click RONIE LOUISE BERMUDEZ and choose July 2026, 1–15. Row 1 A.M. Arrival = `8:00`, Undertime Hours = `4`, and the header shows `For the period of July 1-15, 2026`.
  - Choose 16–31: row 1 is empty.
  - Exactly one `.dtr-form` is rendered.
  - `page.pdf` is not available in Electron, so measure instead: `.dtr-form` height ≤ the A4 content height (10.69in × 96px).
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** DtrForm and the period controls.
- [ ] **Step 4: Run `npm test && npm run test:e2e`.** Expect PASS. Take a screenshot of the preview and compare it with the docx layout and the photo. Mutation check: render two forms and confirm the count assertion goes red.
- [ ] **Step 5: Commit** `feat: single-copy DTR preview`.

---

## Before execution
- Work on branch `feature/phase-0-import-preview`. Its first commit holds `spec.md`, `roadmap.md`, `CLAUDE.md`, and this plan. `.claude/settings.json` is left alone (user's change).
- The tests read `sample_data/HRMO.xls`. That folder is untracked and holds real employee names. Committing it is the user's decision.
