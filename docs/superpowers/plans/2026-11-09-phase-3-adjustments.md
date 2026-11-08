# Phase 3 — Time Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin sets, clears or reverts any A.M./P.M. time of an employee's day with a reason. Device punches are never changed, re-imports never undo adjustments, and adjusted cells are marked on screen only.

**Architecture:**
- Adjustments are stored separately in `data.adjustments`, keyed `office|acNo|date|session`, with `{ in, out, onDuty, offDuty, reason, at }`. `mergeImport` never touches them.
- `adjustDay` / `revertDay` in `store.js` validate and write both sessions of a day at once. A session whose values equal the device values drops its adjustment.
- `effectivePunches` in `dtr.js` overlays adjustments on the device punches and flags the changed cells. `computeDtr` turns those flags into `row.adjusted`.
- In the app view, the day number is a button that opens `AdjustDialog`. Office batch pages have no buttons.

**Spec:** `spec.md` US-7. Inherits the conventions in `roadmap.md` (Phases 0–2).

## Global Constraints

- Times are `HH:MM` 24h (`00:00`–`23:59`) or `''` (cleared). When both are set, departure must be later than arrival in the same session.
- The reason is required (trimmed, 1–200 characters) whenever a session differs from the device. `at` is an ISO timestamp from main's clock.
- `onDuty`/`offDuty` for a session with no device punch come from the employee's other punches for that session, then `08:00-12:00` / `13:00-17:00`.
- Marking: the `.adjusted` class on the cell. Screen: tinted background. Print: no background, no mark.

## Review Focus

1. **Re-import after an adjustment.** Expect the adjustment to stay. Unit test (mergeImport) and E2E.
2. **Setting values back to the device values.** Expect the adjustment removed, not stored as a no-op. Unit test.
3. **Adjusting a day with no device rows at all** (7/13, a Monday). Expect the official hours fallback to work. Unit and E2E.
4. **Departure equal to arrival.** Expect it rejected. Unit test.
5. **An adjustment on a holiday or weekend.** Expect the times to show and no undertime (Phase 2 rule). Unit test.

---

### Task 1: Store — `adjustDay`, `revertDay`

**Files:** `src/lib/store.js`, `test/store.test.js`.

**Produces:**
- `adjustDay(data, { office, acNo, date, am: { in, out }, pm: { in, out }, reason }, at: string): void`. Errors:
  - `Unknown employee`
  - `Invalid date`
  - `Invalid time: 25:00`
  - `A.M. departure must be later than arrival`
  - `Reason is required`
- `revertDay(data, { office, acNo, date }): void`. Throws `No adjustment on 2026-07-01` when there is none.

- [ ] Tests (red):
  - Adjusting RONIE 7/01 stores the AM and PM sessions, each with its reason and `at`, while the device punch is unchanged.
  - Values equal to the device values store nothing.
  - Equal-to-device on an adjusted day removes the adjustment.
  - Invalid times and departure ≤ arrival are rejected with nothing stored.
  - A missing reason is rejected.
  - 7/13 (no rows) takes `08:00/12:00` and `13:00/17:00` from RONIE's other punches.
  - A re-import keeps the adjustment.
  - `revertDay` removes it, and throws when there's nothing to revert.
- [ ] Implement, green, mutation check (skip the order check), commit.

### Task 2: `effectivePunches` and `row.adjusted`

**Files:** `src/lib/dtr.js`, `test/dtr.test.js`.

**Produces:**
- `effectivePunches(punches, adjustments, office, acNo): Punch[]`, with `adjusted: { in: bool, out: bool }` on overlaid punches. A flag is true when the value differs from the device value, or when there was no device punch.
- `computeDtr` rows gain `adjusted: string[]`, a subset of `['amIn','amOut','pmIn','pmOut']`.

- [ ] Tests (hand-derived, RONIE July 1–15, before: credited 1200 → `2 days`, undertime 1200 min):
  - Adjust 7/01 to AM out 12:00, PM 13:00–17:00. Row 1 has `amOut '12:00'`, `pmIn '1:00'`, `pmOut '5:00'` and undertime 0. `adjusted` is `['amOut','pmIn','pmOut']`. Credited is 1680, so `days 3`. Total undertime is 960.
  - A holiday with adjusted times shows the times and no label.
- [ ] Implement, green, mutation check (always flag), commit.

### Task 3: Adjust dialog and IPC (US-7 E2E)

**Files:**
- Create `src/AdjustDialog.jsx`.
- Modify `electron/main.js` (`adjust-day`, `revert-day` via `mutate`, with `at = new Date().toISOString()`), `electron/preload.cjs`, `src/DtrForm.jsx` (`onDayClick` prop, `.adjusted` cells), `src/App.jsx` (use `effectivePunches` for the preview and batch, open the dialog), `src/dtr-form.css`.
- Test `test/e2e/phase3.spec.js`.

**UI:**
- The dialog `Adjust time — July 1, 2026` has 4 `type="time"` inputs (`A.M. arrival`, `A.M. departure`, `P.M. arrival`, `P.M. departure`), each with a "Device: 8:00" or "Device: none" hint.
- It also has a `Reason` field, the last change ("Adjusted <date> — <reason>"), and the buttons `Revert to device times` (only when adjusted), Cancel and Save.
- Errors show in `role="alert"`, and Escape is blocked while saving (`useDialogKeys`).

- [ ] E2E (red):
  - RONIE July 1–15: adjust 7/01 as in Task 2 with "Work from home". Row 1 shows the times, 3 cells are `.adjusted`, and the total is `3 days` / `16`.
  - Print media shows no tint on the adjusted cells.
  - Reason empty → alert. PM departure 12:30 → alert.
  - 7/13 work from home 8:00–12:00 and 1:00–5:00 shows on row 13.
  - Re-import HRMO → row 1 is still adjusted.
  - Relaunch → it persists.
  - Revert 7/01 → row 1 is back to `8:00` only, undertime `4`.
- [ ] Implement, green, mutation check (the print rule removed), commit.
