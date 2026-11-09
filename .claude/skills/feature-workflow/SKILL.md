---
name: feature-workflow
description: >-
  The standard build loop for a single feature, bugfix, or change that needs a
  plan: plan, ponytail cut gate, TDD, real-world E2E, verify, review, merge.
  Also carries the standing constraints that superpowers and ponytail leave
  unresolved between them — ponytail's UI scope limit, the ponytail re-arm rule,
  the conflict rulings, and test integrity. Use when the user types
  "/feature-workflow", or when starting implementation work where what to build
  is already clear, or for a deliberate file or docs cleanup task. Use "project-workflow" instead when the work is foggy enough
  that you cannot yet name the questions, and it will route back here per slice.
---

# Feature Workflow

Steps 5–12. Numbering continues `project-workflow`'s 1–4, which produces the
spec and slices this loop consumes; entered directly, step 5 is the start.

Superpowers walks the route. Ponytail keeps it from bloating. The constraints
below are where those two disagree, resolved once so no task re-litigates them.

**Read the constraints before step 5. They gate every step after it.**

---

## Constraints

### Ponytail scope: backend open, UI closed

`ponytail` applies fully to backend, server, build, and tooling code — cut
abstractions, dependencies, and files freely there.

It does not get to cut user-facing surface. In UI code, treat these as
explicitly requested, never speculative (ladder rung 1 does not apply):

- loading, empty, and error states
- keyboard navigation, focus order, Escape/Enter handling
- undo and optimistic updates where the surrounding UI already has them
- transitions and states the design system already defines
- the safeguards in **Safeguards by risk** below

Lazy in the UI means *fewer elements and no new components* — reuse a primitive,
reuse a token. Never fewer states or a plainer control.

Trade UI away for performance only with a measurement showing the current
version is too slow. "It'd be simpler" is not that measurement.

Ponytail 5.3.3 already protects the *design system* ("a house component beats
a native widget") and never cuts accessibility. What it does not cover is rung 1,
which cannot tell a speculative abstraction from a loading state. That is the
gap this closes.

### Safeguards by risk

Expected safeguards are part of the requested feature, not scope expansion.
Match them to what the action can break:

| Action | Required |
|---|---|
| View or navigate | nothing extra |
| Reversible edit | validation with clear messages, loading state, success and failure feedback, double-submit guard |
| Business-record change | the above, plus a permission check and confirmation when it affects other users |
| Destructive or irreversible (delete, deactivate, bulk change) | the above, plus confirmation naming the item and the consequence, Cancel changes nothing, dependents checked (foreign keys, history, audit records) |

- Logout ends the session server-side. Protected pages refuse access after it.
- Harmless actions get no confirmation dialog.
- A control with no working behavior does not ship.
- Delete vs deactivate vs archive, retention, and reactivation are business
  policy. If `spec.md` does not decide them, stop and ask. The answer enters
  `spec.md` through `project-workflow` **Amend**. Never pick one yourself.
- New modules, workflows, permissions, reports, or policies are scope
  expansion. They need a story first.
- A shipped feature missing one of these safeguards: report it and propose it
  through `project-workflow` **Amend**, since it changes the story. Do not add it
  inside an unrelated phase.

Each safeguard is an "Accepts when" or "Rejects when" condition of its story, so
step 8 tests it.

### Ponytail re-arm

The `SessionStart` hook injects ponytail's ladder **once per session**. Nothing
re-injects it: `ponytail-mode-tracker.js` re-emits the ruleset only under
`if (isQoder)`, `/ponytail` emits a one-line banner, and `commands/ponytail.toml`
is a one-paragraph paraphrase carrying the ladder without its guardrails —
no "never cut" list (validation, security, accessibility), no "a house component
beats a native widget", no "never lazy about the change itself".

- **Re-arm by invoking the skill** (`ponytail:ponytail`). That is the only thing
  that reloads the full ruleset mid-session. `/clear` and `/compact` re-fire
  `SessionStart`, but re-arm after them anyway: re-arming costs one call, and a
  missed reload costs the rest of the session.
- **Re-arm at step 6, and after every compaction.**
- **Never infer active constraint from `[PONYTAIL]` or `.ponytail-active`.** Both
  read a flag file, not the context. They say `full` in hour three of a session
  where the ladder stopped being read in hour one. The mode did not turn off;
  the rules aged out.

### Resolved conflicts

Fixed rulings. Do not re-decide these per task:

| Conflict | Ruling |
|---|---|
| ponytail's "one runnable check, no frameworks" vs `superpowers:test-driven-development` | **TDD wins.** |
| ponytail rung 1 vs UI surface | **UI wins.** See ponytail scope above. |
| An implementer's "left it per YAGNI" vs a reviewer's finding | **The reviewer wins.** `subagent-driven-development/task-reviewer-prompt.md` is explicit: a stated rationale never downgrades a finding's severity. Ponytail licenses building less, not defending after the fact. |
| A `mattpocock-skills` skill vs the skill a step names | **The named skill wins.** That plugin (1.3.1) is installed for `wayfinder`, `to-spec`, and `to-tickets` only — all three explicit-invoke. But 11 of its skills auto-invoke, and 9 overlap steps here: `codebase-design`, `domain-modeling`, `research`, `prototype`, `grilling` (step 5), `tdd`, `diagnosing-bugs` (step 7), `code-review` (step 10), `pr` (step 11). Use what the step names, not what fires. |

### Test integrity

A test that has never failed proves nothing. Every level, not just unit tests —
E2E is where green-by-construction hides best.

- **Watch it fail first.** Before calling any test done, break the code it covers
  on purpose — return empty, flip the branch, drop the side effect — and confirm
  it goes red. Still green = decoration; delete or rewrite it.
- **Capture fixtures, don't invent them.** Record one real payload (real API
  response, real session, real upload) from a test environment and commit it.
  Before committing, replace tokens, keys, and personal data with fake values of
  the same shape. Invented fixtures encode assumptions about the data; captured
  ones encode the data.
- **Mock only at the outer boundary** — third-party call, clock, network.
  Anything stubbed between the entry point and the assertion means the stub is
  under test.
- **Hand-derive expected values.** An expectation computed by the code under test
  passes no matter what that code does.

`superpowers:test-driven-development` has this as the Mutation Check
(`writing-good-tests.md`), but scopes it to unit test files. It applies to E2E too.

### Browser automation

`claude-in-chrome` against a live system is a **probe, not a suite** — one-shot,
non-deterministic, real auth and real third-party state. That is its value, and
why anything it catches must become a committed, re-runnable spec. A finding
that lives only in a transcript protects nothing tomorrow.

**Stop at the login wall — never authenticate on the user's behalf.** When a
flow needs credentials, halt and ask the user to log in themselves in that
browser, then continue when they say it is done.

- Do not type credentials from anywhere: the conversation, a `.env`, an
  environment variable, a config file, a password manager, or a previous
  transcript. Finding a working credential is not permission to use it.
- The same applies to MFA codes, SSO redirects, and CAPTCHAs. Hand those back.
- `claude-in-chrome` drives the user's real Chrome, so a manual login costs them
  a few seconds and leaves the session authenticated for every step after.
- After login, don't screenshot or read back pages showing tokens, session
  cookies, or account secrets. A transcript outlives the session.

Testing the login flow *itself* is the one case that needs credentials in the
browser. Use a throwaway test account whose credentials the user supplies for
that purpose — never a real one — and still ask before the first attempt.

Where a project's own instructions name a different driver for its UI, that wins.

---

## Gate

| Situation | Start at |
|---|---|
| Cleanup of files or docs | **Cleanup** below |
| Bug, small fix, or small improvement that changes no story, schema, API, or business rule, and is not a redesign (a new layout or flow for a page or module) | step 6 re-arm (no plan to cut, re-arm only), then step 7 (`systematic-debugging` first for a bug). No roadmap entry. Write the step 5 Test scope block before step 7, and record step 8 in `docs/test-results/FIX-<date>-<slug>.md` |
| A requirement is added, changed, removed, or conflicts, or a redesign, schema, API, or business-rule change, before, during, or after the build | pause. Run `project-workflow` **Amend**, then go where its table sends you. A change to the NEXT phase resumes at step 5 with the plan revised, not rewritten |
| Spec or plan already decided | step 5 |
| Can't yet name the questions | stop — use `project-workflow` |

The first matching row wins.

---

## 5. `superpowers:writing-plans` — one plan per slice

Turns "what" into "in what order, touching which files".

Plan the phase marked NEXT in `roadmap.md`, from the stories it covers in
`spec.md`. A bug or a request with no spec plans from the request itself.

Skip `superpowers:brainstorming` if a map or spec already decided it. Keep it for
implementation-level choices nothing has reached yet.

**The plan ends with a Test scope block.** Step 6 cuts against it. Step 8
re-checks it against the real diff and records it.

```
Feature: <phase>, US-<n>, US-<n>
Feature tests: unit and integration for the new code, E2E for US-<n>, US-<n>
Regression E2E: <DONE phase: US specs to rerun, reason> | none, <reason>
System E2E: <CW specs> | none
Full E2E run: yes, <trigger from step 8> | no
```

## 6. Re-arm ponytail on the plan — the cut gate

**Before any code.** Invoke the skill (`ponytail:ponytail`). Not `/ponytail` — see
**Ponytail re-arm** above for why the command is not equivalent.

Ponytail is already on from the session start; this is not where it activates,
it is where you deliberately re-read it. The plan is where speculative
*implementation* first appears. Cutting a plan step costs nothing; cutting
shipped code costs a rewrite. Brainstorming stays exploratory on purpose —
ponytail is explicit that laziness never shortens comprehension.

Read the plan against the ladder. Kill speculative abstractions, new files, new
deps, config for values that never change. Bounded by **Ponytail scope** above.

## 7. `superpowers:executing-plans` + `superpowers:test-driven-development`

Ponytail stays on as a mode — its minimalism and TDD's "simplest code to pass"
agree, and where they don't, see **Resolved conflicts**.

Bug instead of a plan → `superpowers:systematic-debugging` first.

## 8. Real-world E2E — prove it against the actual system

Read `.claude/skills/e2e-testing/SKILL.md` before running a live pass — it
covers isolation, setup, and teardown for shared environments. If that file is
missing or is still the template placeholder, use the project's own runner
against a real process (driver table below), never against production data.
A read-only check of production that a phase's "Done when" names (open the live
site, call a function that must refuse) is allowed. It creates, changes, and
deletes nothing, and uses no stored credentials.

Unit, lint, and API tests prove the pieces. This proves the *use case*.

**Where the cases come from:** the numbered user stories **this phase covers**
in `spec.md`. One story = one scenario, and each of its "Accepts when" and
"Rejects when" conditions is one assertion in that scenario. The test matrix is
already written; don't re-invent it at test time. Entered without a spec,
enumerate the user-visible outcomes first. Stories from DONE phases run again
only when **Regression selection** picks them.

**The shape — nothing stubbed between entry and assertion:**

```
captured fixture → the real endpoint/handler → real processing → hand-derived expected output
```

Fixtures, mocking boundary, and the mutation check are in **Test integrity** above.

**Edge cases — enumerate, don't imagine:** empty / zero / one / many · malformed
and wrong-type input · unauthorized and expired auth · slow, failed, and partial
network · duplicate and concurrent submission · unicode, very long strings,
injection-ish payloads · offline or interrupted mid-flow.

**Pick the driver by target:**

| Target | Driver |
|---|---|
| Web app in a real browser session | `claude-in-chrome` |
| Desktop / Electron app | Playwright over CDP |
| HTTP service, CLI, worker | the project's own runner against a real process |

*Check the project's instruction file first* — some projects forbid one of these
outright, and that overrides this table.

**Test layout.** Follow the project's existing layout if it has one, and keep
the naming:

- `tests/e2e/features/us-<n>-<slug>.*`: one spec per story, holding all of its
  edge cases.
- `tests/e2e/system/cw-<n>-<slug>.*`: one spec per critical workflow in
  `spec.md`. It chains the stories and asserts the hand-offs between them, not
  each story's edge cases again.
- `tests/fixtures/`: captured fixtures shared by both.

In a project with one spec file per app, a story is a `describe` block named
`US-<n>`, and "run its spec" means `--grep "US-<n>"`.

Regression is a selection of feature specs, not a separate suite. A scenario
lives in one spec. Later phases rerun it and never copy it.

A `claude-in-chrome` probe cannot be rerun selectively. Its findings become
committed specs in this layout before the phase is done.

**Regression selection.** Before running anything from a DONE phase:

1. `git diff --name-only <base>...HEAD` lists the changed files, where `<base>`
   is the branch the phase started from (usually `main`). The hunk headers of
   `git diff -U0 <base>...HEAD` name the changed functions.
2. Grep the callers of what changed, and their callers, until you reach a name
   a "Shipped as" entry lists. Match the changed files and every changed or
   calling function, component, and table name against each DONE phase's
   "Shipped as" entries in `roadmap.md`. When an entry names functions or
   components, match those names, not the whole file. A directory entry matches
   only through the names it lists. A schema change matches every phase whose
   entries name the changed table.
3. Matched phases give their US numbers, which give their feature specs. Run
   those, plus every system spec whose workflow includes a matched story, plus
   every spec that uses a test helper or selector bound to changed UI.
4. A DONE phase that is not selected is listed in the results file with its
   reason, for example "no shared files or tables".
5. If the impact cannot be bounded (shared config, dynamic dispatch, rows
   written by another module), run the full E2E suite.

**Full E2E suite** (`Full E2E command` in CLAUDE.md "Project facts") runs when:

- the merged phase completes a `## Part` of `roadmap.md`, or before a release
- the diff changes a schema or migration, auth or sessions, a dependency
  version, a business rule, or a function, component, or table named (directly
  or through its callers) in the "Shipped as" of two or more phases
- Regression selection cannot bound the impact

Otherwise it does not run.

**When an E2E test fails.** **REQUIRED SUB-SKILL:** `superpowers:systematic-debugging`.
Its root-cause phases, its stop after 3 failed fixes, and its
`condition-based-waiting.md` for timing apply here.

1. Read the output, logs, browser console, and any screenshot or trace before
   editing anything.
2. Classify the failure: app bug, wrong test assumption, broken test script,
   environment or config, test data or fixture, timing, external service.
3. Rerun once, only to tell flaky from deterministic. A rerun is never the fix.
4. Environment, external service, or isolation failure: stop and report. Do not
   change app code for it.
5. Changing a test's expected result requires the US condition that justifies
   it. If the spec is ambiguous, ask. Never weaken an assertion, delete a case,
   or loosen a wait to get green.
6. After the fix, rerun the failed spec plus the specs Regression selection
   picks for the files the fix touched.
7. Root cause not established: stop and report the evidence and the hypotheses
   already ruled out.

**Record the pass** in `docs/test-results/PHASE-<N>-TEST-RESULTS.md`: date,
driver, pass/fail per story and per assertion, the Test scope as run (regression
specs, DONE phases skipped and why, full run yes or no), and anything left
behind. Step 12 links it from `roadmap.md`. `git check-ignore docs/test-results/`
must print nothing. Playwright's default `test-results` ignore entry also matches
it, so anchor that entry as `/test-results/`.

`superpowers` 7.0.0 has zero E2E or browser coverage; all 15 skills assume a fast
unit runner. This step is not duplicating an existing skill.

## 9. `superpowers:verification-before-completion`

Evidence before assertions. Run the full `Test command` from CLAUDE.md "Project
facts" (the fast unit and integration suite) every phase, whatever step 8
selected, and every other check. Read the output, then claim done. E2E runs
only as step 8 decided.

## 10. Review: complexity, then correctness, then security

`/ponytail-review` → `/code-review` → `/security-review`. That order — deleting
code first means less to review, and security audits the shape that actually
ships rather than one two passes are about to change.

The three scopes overlap only on simplification, so skipping one leaves a real
gap. When `/code-review` repeats a simplification finding `/ponytail-review`
already raised, act on it once:

| Pass | Covers | Explicitly excludes |
|---|---|---|
| `/ponytail-review` | over-engineering, dead flexibility | correctness, security, performance |
| `/code-review` | correctness bugs, reuse/simplification/efficiency | security |
| `/security-review` | injection, authn/authz, secrets, crypto, input validation, TOCTOU, deserialization, XSS, supply chain | DoS, rate limiting, resource exhaustion |

**Gate the security pass, don't always-run it.** Three review passes on a CSS
tweak is what ponytail exists to prevent. Run it when the diff touches any of:

- auth, sessions, tokens, or permission checks
- input parsing, deserialization, or file/path handling
- shell or SQL construction, or anything building a command string
- crypto, secrets, or credential storage
- a network-facing handler, or a new dependency

Extend that list with whatever the current project treats as a trust boundary —
its `CLAUDE.md` / `AGENTS.md` usually names them. In an app that talks to remote
hosts, that includes anything crossing the wire, running over SSH, or spawning a
user-supplied binary.

If in doubt, run it — ponytail is explicit that security measures are never
simplified away.

**All three report; none applies.** The built-in `/simplify` covers the same
complexity hunt as `/ponytail-review` but applies its fixes in the same pass,
landing changes in the tree before you have read them. Report-then-decide is the
point. Same reason `/code-review` runs without `--fix`.

Pair with `superpowers:receiving-code-review` when acting on findings — it holds
the YAGNI-defense procedure (grep for real usage before implementing a
reviewer's suggestion).

## 11. `superpowers:finishing-a-development-branch`

Merge, rebase, or abandon — decided once.

## 12. Roadmap

If the merged work completes the phase marked NEXT, apply the roadmap rule in CLAUDE.md. Otherwise skip.

---

## Cleanup — a separate task, never inside a phase

During steps 5–12, files unrelated to the phase stay as they are. Note them for
a cleanup task.

1. `/ponytail-audit` lists candidates. It reports and changes nothing.
2. For each candidate, grep its references across source, tests, config, build
   scripts, and CI. `git ls-files` and `.gitignore` separate source from
   generated output. A file name or an apparent lack of use is not evidence.
3. Never candidates: `spec.md`, `roadmap.md`, `CLAUDE.md`, `docs/test-results/`,
   ADRs, config, and fixtures a spec still references.
4. Present the list with the evidence per file. Delete or move only what the
   user approves, in one commit on its own branch. Move a file only when its
   location breaks a stated convention.
5. Then steps 8 to 11, as for any change. Step 8 runs Regression selection only
   and records it in `docs/test-results/CLEANUP-<date>.md`.

---

## Failure modes

- **Ponytail on UI with no scope rule.** Rung 1 reads a loading state as
  speculative and deletes it.
- **Trusting the badge.** `[PONYTAIL]` reads the flag file, not the context.
  Re-arm; never infer.
- **An E2E test nobody watched fail.** Green-by-construction hides best at this level.
- **Reaching for `/simplify` at step 10.** It applies what it finds. Read first.
- **Rerunning every DONE phase's E2E.** Regression selection decides. Skipped
  phases are listed with a reason.
- **Test-fix-rerun loop.** Classify and find the root cause first. Three failed
  fixes means stop and report.
