---
name: e2e-testing
description: Use when a change to the DTR Analyzer Electron app has to be proven end to end — a real-app pass, "test this for real", "verify it works", or any work that launches the app, imports Excel files, or checks the DTR preview, print, or PDF. Covers isolating the pass from the admin's real data folder and the rules for fixtures and expected values.
---

# End-to-end testing the DTR Analyzer

> Used during `feature-workflow` step 8 (Real-world E2E). Model: `examples/e2e-testing-clio.md`.

**Never run a pass against the admin's real data.** The app stores everything in one file,
`dtr-data.json`, inside `app.getPath('userData')`
(`%APPDATA%\employees-dtr-analyzer\`). A pass that writes there can overwrite real imports,
adjustments, and holidays. Every pass gets its own empty temp folder through `DTR_DATA_DIR`.

## Driver and command

- Driver: Playwright `_electron` (CLAUDE.md "Project facts"). Command: `npm run test:e2e`
  (runs `vite build` first, so the pass tests the current renderer, not a stale `dist/`).
- Specs live in `test/e2e/*.spec.js`. Shared setup lives in `test/e2e/helpers.js`:
  `launch(dataDir)`, `importFiles(app, page, paths)`, `employeeButtons(page)`, `tmpDir()`.
- One spec per phase (`phase<N>.spec.js`). One `test(...)` per user story, named `US-<n> ...`.
  Each "Accepts when" and "Rejects when" line of that story in `spec.md` is one `expect`.

## Isolation

| Thing | Rule |
|---|---|
| Data folder | `launch(tmpDir())`. Never launch without `DTR_DATA_DIR`. A relaunch to test persistence reuses the same temp folder |
| `ELECTRON_RUN_AS_NODE` | `launch` deletes it from the env. VS Code's extension host sets it, and Electron then runs as plain Node (`does not provide an export named 'BrowserWindow'`) |
| OS file and save dialogs | Mocked in the main process with `app.evaluate(({ dialog }) => ...)`. The dialog is the outer boundary. Nothing between the IPC handler and the assertion is stubbed |
| Workers | `workers: 1` in `playwright.config.js`. Each test launches its own Electron |

## Fixtures

- **Captured, not invented.** `sample_data/HRMO (3).xls` is a real device export (BIFF2, 11 employees,
  154 rows, July 1–9 2026). It is committed on purpose. Use it for every happy path.
- **Bad inputs are derived from the captured file**, not typed from scratch. Example: the
  missing-column file is HRMO rows with `Clock Out` removed, written as `.xlsx` with SheetJS.
- SheetJS ESM has no file access. Use `XLSX.read(fs.readFileSync(p))` and
  `fs.writeFileSync(p, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))`,
  never `XLSX.readFile` / `XLSX.writeFile`.
- Generated files go in `tmpDir()`, never in `sample_data/`.

## Expected values

- **Hand-derive every number from the raw rows and write the derivation in a comment** before
  running. A value read off the app's own output proves nothing.
- Known hand-derived anchors (grace 15, July 2026):

| Employee (AC) | Period | Expected | Why |
|---|---|---|---|
| RONIE LOUISE BERMUDEZ (568) | 1–15 | day 1: A.M. arrival `8:00`, departure blank, undertime 4h | 7/01 AM has arrival only, PM absent |
| JOHN RYAN A. LAZARO (611) | 1–15 | day 8: undertime 18m. Day 6: 0 | 8:18 is past grace. 8:08 and 1:06 are within it |
| RELITA BARAYA (14) | 1–15 | `6 days`, undertime 4h | 13 full sessions × 240 = 3120 min, floor(3120/480) = 6. 7/03 PM has departure only |

## During the pass

- **Watch each assertion fail once.** Break the code it covers (skip `saveData`, drop the grace
  check, render two forms) and confirm the spec goes red, then restore. Still green = rewrite it.
- **Layout checks are measured, not eyeballed.** One `.dtr-form` per page, and its height
  ≤ 10.69in × 96px (A4 minus 0.5in top and bottom margins). Save a screenshot to
  `test-results/` and compare it by eye with `sample_data/Appendix-24-Daily-Time-Record-DTR (1).docx`
  and `sample_data/actual_raw_hand_writtern_dtr.jpg`. Report any difference instead of
  calling it a match.
- **Print and PDF** (from Phase 1): `webContents.printToPDF` output is checked by page count
  and page size (A4 = 595×842 pt), not only by whether a file exists.
- If the app shows data you did not import, stop. The pass is reading a real data folder.

## Teardown

- Close every launched app (`await app.close()`), including on a failed assertion path.
- Temp folders live under `os.tmpdir()` with prefix `dtr-e2e-`. Delete them after the pass.
- Never delete or edit anything under `%APPDATA%\employees-dtr-analyzer\`.
- Record the pass in `PHASE-<N>-TEST-RESULTS.md`: date, driver, pass/fail per story and per
  assertion, mutation checks run, and anything left behind.

## Common mistakes

| Symptom | Cause |
|---|---|
| `Process failed to launch!` | `ELECTRON_RUN_AS_NODE` still in the env. Launch through `helpers.launch` |
| Test passes but the UI change is not visible | `dist/` is stale. Run `npm run test:e2e`, not `npx playwright test`, after renderer edits |
| `Cannot access file ... HRMO (3).xls` | `XLSX.readFile` used in the ESM test. Read the buffer with `fs` |
| Employees from an earlier run appear | `DTR_DATA_DIR` was not set, or a temp folder was reused across tests |
| A success line matches an error assertion | Assert on the `.err` line (`status.locator('.err', { hasText })`), not on the file name alone |
