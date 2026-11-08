# Phase 0 — Import and preview: test results

- **Date:** 2026-11-08
- **Branch / commit:** `feature/phase-0-import-preview` @ `db45f75`
- **Drivers:** Vitest (`npm test`), Playwright `_electron` (`npm run test:e2e`), per `.claude/skills/e2e-testing/SKILL.md`
- **Fixture:** `sample_data/HRMO.xls` (captured device export). Bad files are derived from it in temp folders.
- **Totals:** unit 27/27 pass, E2E 3/3 pass

## US-1 Import Excel files per office — PASS

| Assertion | Result | Where |
|---|---|---|
| Multiple files in one import, including BIFF2 `HRMO.xls` | pass | e2e `US-1 import...` (3 files in one import) |
| Office defaults to file name (`HRMO`), editable | pass | e2e (`noout.xlsx` set to `Accounting`) |
| HRMO yields 11 employees under HRMO | pass | e2e, unit `parses HRMO.xls` |
| Data survives close and relaunch | pass | e2e relaunch with the same data folder |
| Re-import updates, no duplicates (`0 added, 154 updated`) | pass | e2e, unit `mergeImport` |
| Missing column: error names it, nothing saved from that file | pass | e2e `noout.xlsx: Missing columns: Clock Out`, no Accounting office |
| Unreadable file: error names file, other files still import | pass | e2e `bad.xls` error line plus HRMO import |
| Invalid date/time rows skipped and counted | pass | unit `skips rows with invalid date or time` |
| Escape cancels the import dialog, nothing saved | pass | e2e `cancel import with Escape` |

## US-2 Compute the DTR — PASS (unit, hand-derived)

| Assertion | Result |
|---|---|
| RONIE 7/01: `8:00`, blank departure, undertime 4h, PM blank | pass |
| LAZARO 7/08 `8:18` = 18m. 7/06 `8:08` and `1:06` = 0 (grace 15) | pass |
| Grace 0 counts every minute (RONIE 7/02 = 3m) | pass |
| RELITA July 1–15: credited 3120, `6 days`, undertime 240 | pass |
| Full 8–12 and 1–5 for 7 days = `7 days`. Early arrival and late departure not credited | pass |
| Early departure counted as undertime | pass |
| Days outside period and day 31 of September blank | pass |
| Device Late/Early/Absent columns never used | pass (the parser does not read them, and the mutation using `Late` went red) |

## US-3 Preview the DTR — PASS (e2e)

| Assertion | Result |
|---|---|
| Single `.dtr-form` with form text, name, period | pass |
| Half-month: `For the period of July 1-15, 2026`, rows 1–15 only. 16–31: rows 16–31 only | pass |
| Full month: `For the month of July 2026`, 31 rows | pass |
| Official hours `8:00-12:00, 1:00-5:00` | pass |
| Total row `6 days`, undertime total aligned under Hours | pass |
| Form height within one A4 content area (15-row and 31-row views) | pass |
| Partial year typed (`20`) does not change the period | pass |

Visual check: `test-results/phase0-preview.png` compared with the docx template and the photo. The layout matches. One difference is intentional: weekend rows (4, 5) are blank until Phase 2 adds labels.

## Mutation checks (each went red, then restored)

- Parser reads `Late` for arrival → 4 unit tests fail.
- Merge always adds → dedupe test fails.
- Grace check removed → `within grace` fails. Missing punch = 0 undertime → 2 tests fail.
- `saveData` skipped → e2e relaunch count fails.
- Two forms rendered → e2e count fails.
- Total cell `display:flex` (real bug found by screenshot) → column alignment assertion fails.
- Year applied on every keystroke → e2e period text fails.

## Reviews

- ponytail-review: 1 finding (`__proto__`/`constructor` office names) fixed with a test.
- code-review (medium): 10 findings. 8 fixed in `db45f75`. Skipped: duplicate rows inside one file are counted as "updated" (cosmetic), and synchronous parsing in the main process (fine at single-admin load).
- security-review: no findings at confidence ≥ 8.

## Left behind

- Temp folders `dtr-e2e-*` and `dtr-*` under `%TEMP%` from test runs. They are not in the repo.
- Nothing written to the real `%APPDATA%\employees-dtr-analyzer\` folder.
