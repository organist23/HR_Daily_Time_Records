# Phase 1 — Print, PDF, office settings: test results

- **Date:** 2026-11-08
- **Branch / commit:** `feature/phase-1-print-pdf` @ `fb03a0d`
- **Drivers:** Vitest (`npm test`), Playwright `_electron` (`npm run test:e2e`), per `.claude/skills/e2e-testing/SKILL.md`
- **Totals:** unit 44/44 pass, E2E 5/5 pass (Phase 0 tests still green)

## US-4 Print and export PDF — PASS (e2e `US-4 print and export PDF...`)

| Assertion | Result |
|---|---|
| Print sends the job to the system print dialog (mocked) with `pageSize: 'A4'` and portrait | pass |
| Print with 1 page for an employee, 11 pages for the HRMO office | pass (pages counted in the DOM at print time) |
| Export PDF: file saved to the picked path, 1 page, 595×842 pt | pass |
| Export office PDF: 11 pages, one employee per page in name order | pass (also checked by rendering the PDF with PyMuPDF) |
| No app UI in print or PDF (top bar, sidebar, controls hidden, 1 visible page) | pass |
| A single DTR does not spill onto a second page | pass |
| Cancelled save: no file, no message, buttons usable again | pass |
| Unwritable target (a folder): error `Could not save PDF` shown | pass |

## US-5 In-charge name per office — PASS (e2e `US-5 ...`, unit `updateOffice`)

| Assertion | Result |
|---|---|
| Office settings: in-charge name and grace (default 15), saved and still there after relaunch | pass |
| The form shows the in-charge name above "In Charge" | pass |
| Grace 0 changes the computation (RONIE 7/02 = 3 min) | pass |
| One-print override changes only the preview and print, not the saved default | pass (relaunch shows the saved name) |
| Saving settings without a name change keeps a typed override | pass |
| Invalid grace (`-5`, `61`, `abc`, `1.5`, `0x10`, `1e1`, `true`) is rejected with an error and nothing saved | pass |
| Unknown office, a name over 100 characters, or an office named `__proto__` is handled safely | pass |

## Mutation checks (each went red, then restored)

- Grace range check removed → 2 unit tests fail.
- Override also saved as the default → relaunch assertion fails.
- Sidebar not hidden in print CSS → `toBeHidden` fails.
- Not verified: the `.page + .page { break-before: page }` guard. Removing it still gives 11 pages, because each page is already nearly A4 tall. It stays only as a guard.

## Bugs found during the pass

- `printToPDF` ignores `margins: { marginType }`, which is an option of `print()` only, so it applied its default margins. It now uses zero inch margins.
- The test helper had left `emulateMedia({ media: 'screen' })` on, which forced screen styles while printing. It now resets with `media: null`. Added to the e2e skill.
- Test temp folders filled drive C: (each launch writes a Chromium profile). They now live under `%TEMP%\dtr-e2e\` and a global teardown deletes them. Unit test temp folders are deleted in `afterAll`.

## Reviews

- ponytail-review: 1 finding (a double-click could start two office jobs), fixed.
- code-review (medium): 10 findings. 6 fixed in `fb03a0d`. Skipped:
  - Override state does not follow settings changed by other paths (no such path exists).
  - Untrimmed override (spaces don't show in print).
  - setState after unmount (ignored by React 18).
  - Blank pages for employees with no punches in the period: a product decision, asked of the user.
- security-review: no findings at confidence ≥ 8.

## Left behind

- Nothing. Temp folders are deleted by teardown (0 `dtr*` folders in `%TEMP%` after the run).
