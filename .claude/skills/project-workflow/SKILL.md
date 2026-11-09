---
name: project-workflow
description: >-
  The discovery and planning loop for work that is still foggy — you cannot yet
  name the questions, write a plan, or say which files to touch. Produces a spec
  with numbered user stories, slices it into phases for roadmap.md, and routes
  each slice to feature-workflow. Use when the user types "/project-workflow",
  when starting a new project, or when a request is too vague for feature-workflow
  to consume. Also use when an approved requirement is added, changed, removed,
  or conflicts with another. Once the spec and slices exist, hand off to
  feature-workflow per slice.
---

# Project Workflow

Steps 1–4. These produce the spec and phased roadmap that `feature-workflow`
(steps 5–12) consumes. If you already have a clear spec and know which files to
touch, skip to `feature-workflow` directly.

**This workflow answers: "What are we building and in what order?"**
**Feature workflow answers: "How do we build this specific piece?"**

**On entry:** The user may provide anything from a vague idea to a detailed
requirements list. Do not wait for a complete spec. Start by reading whatever
they gave you, identify what is unclear or missing, and ask questions to fill
the gaps. The user does not need to know the "right" format — that is your job.
Meet them where they are:

| User provides | You do |
|---|---|
| A vague idea ("I want to automate tasks") | Ask what, who, where, when, how they'd verify it |
| A paragraph describing the problem | Confirm your understanding, ask about edge cases and scope |
| A bullet list of requirements | Validate each one is testable, ask about what's missing |
| A full spec | Check it against step 2's rules (numbered stories, "Rejects when", no open questions), fix gaps, then step 3 |

---

## Gate

| Situation | Action |
|---|---|
| Goal is foggy, can't name the questions yet | Start at step 1 |
| Goal is clear but no spec or user stories | Start at step 2 |
| Spec exists but work isn't sliced into phases | Check the spec against step 2's rules, then step 3 |
| Phases exist in roadmap.md, ready to build | Skip — go to `feature-workflow` step 5 |
| Spec approved, and a requirement is added, changed, removed, or conflicts, or a redesign, schema, API, or business-rule change | **Amend** below |

---

## 1. Understand — clarify what the user actually wants

Before writing anything, extract clarity. Ask questions until you can state the
goal in one sentence that the user agrees with.

**Do:**
- Ask what problem the user is solving, not what feature they want
- Ask who uses it and what they see
- Ask what already exists (existing code, APIs, services, accounts)
- Ask what "done" looks like — how would they verify it works?
- Challenge assumptions that sound like solutions disguised as requirements

**Don't:**
- Guess and build — a wrong guess costs more than a question
- Ask all questions at once — group by topic, wait for answers
- Widen scope — if the user says "just X", that's the scope

**Output:** A one-sentence goal statement the user confirms.

Example:
> **Goal:** When a matter changes stage in Clio, automatically create the
> appropriate task assigned to the responsible attorney, within 30 seconds.

---

## 2. Spec — write numbered user stories with acceptance criteria

Turn the confirmed goal into a spec saved as `spec.md` at the project root.
Each user story is numbered because
`feature-workflow` step 8 uses these numbers as the E2E test matrix.

### Format

```markdown
# Spec: <Project Name>

## Goal
<The one-sentence goal from step 1.>

## Assumptions
- <What's already true — existing accounts, APIs, infrastructure>
- <What the user confirmed in step 1>

## User Stories

### US-1: <Action the user or system takes>
**As** <who>, **I want** <what>, **so that** <why>.

**Accepts when:**
- [ ] <Observable, testable condition>
- [ ] <Observable, testable condition>

**Rejects when:**
- [ ] <What should NOT happen>

### US-2: <Next action>
...

## Critical workflows
- CW-1: <name>: US-1 → US-3 → US-5

## Out of Scope
- <Things explicitly not built, and why>

## Open Questions
- <Anything unresolved — block on these before step 3>
```

### Rules

- **Every story is testable.** Each story becomes one E2E scenario in
  `feature-workflow` step 8, and each "Accepts when" and "Rejects when"
  condition becomes one assertion in it. If you can't test it, rewrite it.
- **Number every story. Numbers are permanent.** `feature-workflow`, test
  results, and `roadmap.md` reference them. Never renumber or reuse one. A
  changed story gets `Changed <date>: <reason>` under its heading. A removed
  story gets `Withdrawn <date>: <reason>` and keeps its number.
- **Safeguards are criteria.** A story with a consequential action (delete,
  deactivate, approve, logout, editing a business record) lists the safeguards
  from `feature-workflow` **Safeguards by risk** as "Accepts when" and "Rejects
  when" conditions. A policy the user has not decided (soft or hard delete,
  retention) goes to Open Questions.
- **Name the critical workflows.** Flows that cross several stories and break
  the business when they fail. Each becomes one system E2E spec in
  `feature-workflow` step 8. Keep the list short.
- **Include "Rejects when."** The happy path is half the spec. What happens on
  bad input, duplicate events, auth failure, timeout?
- **List what's out of scope.** This feeds the "Deliberately not built" line in
  `roadmap.md` phases.
- **Resolve open questions before step 3.** Don't slice foggy work — you'll
  re-slice it later.

---

## 3. Slice — break the spec into ordered phases

Take the numbered user stories and group them into phases for `roadmap.md`.
Each phase must be independently shippable and verifiable.

### How to slice

**Slice by dependency, not by component.** The question is *"what must exist
before this can work?"* — not *"what layer is this?"*

Bad slicing (by layer):
```
Phase 0: Database schema        ← can't verify, nothing uses it
Phase 1: API endpoints          ← can't verify, no consumer
Phase 2: UI                     ← finally verifiable
```

Good slicing (by user story):
```
Phase 0: US-1, US-2 (webhook → task creation)  ← verifiable end-to-end
Phase 1: US-3, US-4 (task templates)            ← builds on Phase 0
Phase 2: US-5 (dashboard)                       ← builds on Phase 1
```

### Rules

- **Each phase maps to at least one user story.** A phase with no user story
  has no test scenario and no "done when" condition. The one exception is an
  Amend phase that supersedes a technical decision. Its tests are the stories
  that decision touches.
- **Phase 0 is the smallest thing that proves the architecture works.** Not a
  skeleton, not scaffolding — a real user-visible outcome, however small.
- **One phase is `NEXT`. Everything else is `LATER`.** Never work on two phases
  at once.
- **Each phase states what it deliberately does NOT build** and which later
  phase owns it. This is what ponytail (in `feature-workflow`) enforces during
  the build — if it's not in this phase's stories, it gets cut.
- **DONE phases are history.** Never renumber or edit them. LATER phases may be
  renumbered, reordered, or inserted.
- **A phase too big for one build** splits into Phase Na and Nb before it
  starts. Found mid-build: stop and propose the split.
- **Bug fixes get no phase.** They run through the `feature-workflow` Gate.

### Output — populate `roadmap.md`

`roadmap.md` is the single template for phase entries: NEXT, LATER, reopened,
and the DONE fields step 12 adds. Replace its placeholders with real phases.
Keep its `## Part` headings. The end of a Part is a full-E2E milestone in
`feature-workflow` step 8.

---

## 4. Route — hand the first phase to feature-workflow

Once `roadmap.md` is populated:

1. Confirm the user agrees with the phases and their order
2. Identify the phase marked `NEXT`
3. Hand it to `feature-workflow` starting at step 5

**The handoff:**

> The phase marked NEXT is **Phase 0 — Webhook listener**.
> It covers US-1 and US-2. Entering `feature-workflow` at step 5.

From here, `feature-workflow` takes over:
- Step 5 turns this phase into an implementation plan
- Steps 6–11 build, test, review, and merge it
- Step 12 updates `roadmap.md` (marks DONE, promotes NEXT)
- Then this cycle repeats for the next phase

---

## Amend — when an approved requirement changes

Use when `spec.md` is approved and a requirement is added, changed, removed, or
conflicts with another, before, during, or after the build, including when every
phase is DONE. Revisit only what the change touches. Completed work and phase history stay.

**1. Classify, then act.** One request can match several rows (removing one
story can change another). Apply each row that matches.

| Change | `spec.md` | `roadmap.md` | Build |
|---|---|---|---|
| Clarification, story text unchanged | no edit | no edit | continue |
| A story in the NEXT phase changes | edit the story, add a `Changed` line | edit the NEXT phase only if its outcomes or "Done when" change | revise the plan (step 5), cut the revision (step 6) |
| New requirement | new US number | add it to a LATER phase or a new phase | current phase unchanged unless the user says otherwise |
| Conflicts with an approved story | no edit until the user picks | no edit | stop, show both stories, user decides, then classify again |
| Changes a story of a DONE phase | edit the story, add a `Changed` line | new LATER phase with the line `Reopens Phase <N>: <US-n changed, or what changes>`. The DONE entry stays untouched | built as its own phase |
| Requirement removed or replaced | `Withdrawn` line, number kept, removed from `## Critical workflows` | remove it from LATER phases. Already shipped: a new phase `Reopens Phase <N>: US-<n> withdrawn`, done when the behavior is gone and the stories it touched still pass | the phase that removes the behavior deletes the tests of that behavior only. A test filed under the withdrawn story that covers behavior still shipped moves to the story that owns it. Its stored data, including records still in progress, stays unless the user decides otherwise |
| Undo a past decision | edit the story, `Changed` line naming the date of the behavior it restores. A technical decision with no story: no edit | a new phase. A technical decision or a recorded user decision gets the line `Supersedes Phase <N> convention: <old> → <new>, <reason>` (or `decision`) | a forward change, built as a phase. To `git revert` instead, see **Reverting a phase** below |
| UI or flow redesign | conditions unchanged: no edit. Conditions changed: as for a changed story | a new phase, `Reopens Phase <N>: <what changes>` | its E2E specs are updated without weakening any assertion |
| Schema, API, or business-rule change | as above for each affected story. No story text changes: no edit | always a new phase, even when no story text changes | the Test scope must include Regression selection (`feature-workflow` step 8) |
| Schema change with existing data | as above | as above | the plan includes the migration, how existing values map to the new columns (the user approves the mapping), a backup, a way to reverse it that touches only rows the migration changed, and every reader of the old columns (code, APIs, reports, exports, and installed clients still running older builds). The dry run reports each case of the mapping with real examples, so the user approves the mapping on the data, not on a count. The migration and its reverse run first on a test copy the user provides (an export or backup restored into a throwaway deployment). The schema changes in two deploys: first add the new fields as optional and migrate, then remove the old field in a later phase, because the deployed schema must accept every existing row. The plan states the production order (deploy, dry run, run) for the user to carry out. If a push deploys automatically, the user decides when the change is merged. Never run it against production data yourself. Any loss of existing data needs the user's decision |

**Reverting a phase.** Only when the user asks, and after the change note is approved (Amend step 3):

1. `git diff --name-only <merge> main` (or the branch that holds the merge) lists only `spec.md`, `roadmap.md`, and
   results files (`docs/test-results/`, or older root `PHASE-*-TEST-RESULTS.md`).
   Anything else means later work sits on it: build a forward change instead.
2. If the phase changed the schema and its migration ran anywhere, run the
   reverse migration there first. The old schema rejects migrated rows, so the
   revert cannot deploy until then.
3. `git revert -m 1 <merge>`. For a squash or rebase merge, revert the phase's
   commits.
4. The revert deletes files the merge added. Restore the results file:
   `git checkout <merge> -- docs/test-results/PHASE-<N>-TEST-RESULTS.md`.
5. Run it as its own phase through steps 8–12, with the line
   `Reverts Phase <N> (<revert hash>)` written after the revert commit. Its Test
   scope covers the remaining stories the reverted phase touched. Done when the
   reverted behavior is gone and those stories pass.
6. The reverted stories get `Withdrawn` lines. The reverted DONE entry stays.
   Data the reverted code wrote is the user's decision.

**2. Impact.** Read `spec.md`, `roadmap.md`, the code and callers in the
affected files, their tests, the latest `docs/test-results/`, and the schema.
List the affected stories, the phases that shipped them (the "Shipped as" lines
in `roadmap.md`), the modules, tables, APIs, existing data, and their E2E specs
(feature and critical workflow). Show the user this list, the classification,
and a plan summary as a change note.

**3. Approval.** The change note needs the user's OK before any doc or code
change. A clarification that edits nothing is the only exception.

**4. Return** to `feature-workflow` step 5 when the affected phase is NEXT. Otherwise
it waits in the roadmap. One phase at a time still holds: a reopen phase waits as LATER unless the user moves it to
NEXT. To build it ahead of an unfinished NEXT phase, the unfinished phase goes
back to LATER with the line `Paused <date>: <reason>`, keeps its branch, and
becomes NEXT again when the new phase is DONE. If no phase is NEXT, the new phase becomes NEXT. When one Amend creates
several phases, the user sets their order and only the first becomes NEXT. New
phases go under a new `## Part` heading when they don't serve an unfinished
Part's goal, and always when every phase is DONE. Finishing that Part triggers a
full E2E run. New phases take the next unused phase number.

---

## The full picture

```
project-workflow                    feature-workflow
━━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━
1. Understand                       5.  Plan
2. Spec (user stories)              6.  Cut (ponytail gate)
3. Slice (populate roadmap)  ──→    7.  Code + TDD
4. Route NEXT phase          ──→    8.  E2E test
                                    9.  Verify
                                    10. Review (2–3 passes)
                             ←──    11. Merge
                                    12. Update roadmap ──→ next NEXT phase
                             ──→        (loop back to step 5)

Amend  ←── requirement change at any step ──→  back to step 5
```

---

## Failure modes

- **Skipping step 1.** Building a spec from assumptions produces a spec you
  rewrite after the first phase ships. One round of questions costs less.
- **User stories without "rejects when."** The happy path works. Everything
  else is discovered in production.
- **Slicing by layer instead of by story.** Three phases of invisible
  infrastructure before anything is verifiable.
- **Phase 0 is too big.** If it takes more than a few days, slice smaller.
  Phase 0's job is to prove the architecture, not ship the product.
- **Open questions carried into slicing.** Foggy stories produce foggy phases
  that get re-sliced mid-build.
- **Restarting the cycle for a change.** Amend touches only the affected
  stories and phases.
