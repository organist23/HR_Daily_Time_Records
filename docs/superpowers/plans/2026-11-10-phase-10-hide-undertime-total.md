# Phase 10 — Show or Hide Undertime and Total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One toolbar button hides or shows every undertime cell and the Total row's values. Hidden at every start. Screen, print, PDF, and office batches follow it.

**Architecture:**
- `App` holds `showTotals` (`useState(false)`), so it survives switching employees (`Preview` remounts per employee) and resets on restart. Passed to `Preview` with its setter.
- `Preview` renders the toggle button in `.controls` (already hidden in print) and passes `showTotals` to both `DtrForm` renders (main page and `.print-batch`).
- `DtrForm` takes `showTotals`. When false, the Hours and Minutes cells of each day and the Total row's days and undertime cells render empty. Columns and rows stay.
- No change to `computeDtr`, the store, IPC, or saved data.

**Spec:** `spec.md` US-14.

## Hand-derived values

- RONIE (568) July 1–15 (Phase 3 anchor): `2 days`, undertime total 20h 0m. Day 1: A.M. arrival `8:00`, undertime 4h.

## Tasks

### Task 1: E2E first (red)

**Files:** `test/e2e/phase10.spec.js`.

- [ ] US-14: open RONIE July 1–15 → day 1 Hours empty, Total row has no `days` text and empty undertime cells, day 1 A.M. arrival `8:00` still shown, button reads `Show undertime and total`. Export PDF (mocked save) → PDF text has no `2 days`. Click Show → `2 days`, total Hours `20`, day 1 Hours `4`, button reads `Hide undertime and total`. Switch to LAZARO and back → still shown. Relaunch → hidden again.

### Task 2: implement

**Files:** `src/DtrForm.jsx`, `src/App.jsx`.

- [ ] Prop, state, button. E2E green. Mutation check (ignore the prop).

### Task 3: earlier specs

**Files:** E2E specs for phases 0, 1, 3, 5b, 6, 7, 8 that read undertime or totals.

- [ ] Add one `Show undertime and total` click after the first employee opens in each launch. No expected value changes (justified by US-14: hidden is the new default).

## Test scope

```
Feature: Phase 10, US-14
Feature tests: E2E phase10.spec.js US-14
Regression E2E: all specs (full run)
System E2E: none
Full E2E run: yes, DtrForm is named in the Shipped as of phases 0 and 1, and the default display changes for every spec that reads totals
```
