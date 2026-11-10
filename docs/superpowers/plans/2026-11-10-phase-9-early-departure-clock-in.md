# Phase 9 — Early Departure Filed as Clock In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the A.M. row of a night shift, a Clock In with a blank Clock Out is the departure. It shows in the A.M. Departure cell and completes the shift.

**Architecture:** In `parseRows`, after all rows are read: an A.M. row with a Clock In, no Clock Out, and a night start (P.M. Off duty 23:59) on the previous date in the same file has its Clock In moved to Clock Out. Done at import, so `computeDtr`, the Adjust dialog, and `adjustDay` all see the departure. (Revised after code review: the first version did this only inside `computeDtr`, so the dialog still showed 05:57 as the arrival.)

**Spec:** `spec.md` US-13 (Changed 2026-11-10) and the "Early-morning punch filed as Clock In" rule.

## Hand-derived values (sample_data/GSO_.xls, raw rows)

- RENATO NUESTRO JR (519): 10/05 `night guard 1` In 16:04. 10/06 `night guard 2` In 05:57, Out blank.
  Start row: 17:00 → 24:00 = 420 (16:04 is before on-duty, not late). End row: 00:00 → 05:57 = 357, early 3. Shift 777.
  Before the fix: 10/05 undertime 780, credit 0.
- REYGAN SANNIE (903): 10/09 In 17:06. 10/10 In 05:58. Start 420 − 6 late = 414. End 358, early 2. Shift 772.
- `NIGHT_shift.xls` and HRMO values unchanged (no lone Clock In on a night A.M. row in either file).

## Tasks

### Task 1: `computeDtr` reads a lone Clock In as the departure

**Files:** `src/lib/dtr.js`, `test/dtr.test.js`.

- [ ] Tests (red): RENATO 10/05–10/06 credit 777, 10/05 undertime 0, 10/06 `{ amIn: '', amOut: '5:57', undertime: 3 }`. REYGAN 10/09–10/10 credit 772, undertime 6 on 10/09 and 2 on 10/10. A day employee's A.M. row with only a Clock In is unchanged (4h missing punch).
- [ ] Implement, green, mutation check (drop the swap).

### Task 2: E2E

**Files:** `test/e2e/phase9.spec.js` (new), `sample_data/GSO_.xls` (commit), `.claude/skills/e2e-testing/SKILL.md` (fixture line).

- [ ] Import `GSO_.xls` → `2851 added, 0 updated, 0 skipped`. RENATO October 1–15: 10/05 P.M. arrival `4:04`, 10/06 A.M. departure `5:57`, arrival blank, 10/06 minutes `3`, 10/05 undertime blank.
- [ ] Mutation check.

## Test scope

```
Feature: Phase 9, US-13 (changed)
Feature tests: unit for computeDtr lone Clock In; E2E phase9.spec.js US-13
Regression E2E: all specs (full run)
System E2E: none
Full E2E run: yes, the diff changes a business rule in computeDtr, named in the Shipped as of phases 0, 2, 6, and 8
```
