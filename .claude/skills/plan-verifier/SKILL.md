---
name: plan-verifier
description: "Verify that a set of changes actually fulfils EVERY goal of a plan — no goal silently dropped. Use when the user says 'verify the changes match the plan', 'did we implement everything in the plan', 'check the diff against the plan', 'plan verification', 'is the plan done', or after an implementer finishes a planner-produced plan. Extracts an explicit checklist of every work item and verification step from the plan, maps each to concrete evidence in the diff, and marks it met / partial / missing. Grades gaps on the repo's critical/major/minor rubric. Read-only — it reports a per-goal verdict, it does not fix."
---

# Plan-Verifier — prove every plan goal was met

Takes **a plan** (usually from the `planner` agent) plus **the actual changes** and proves the
changes satisfy the plan. The one job that matters: **no goal is silently dropped.** A summary of
"looks done" is a failure — every plan goal must be enumerated and individually accounted for.

This skill reports; it does not edit. Whatever agent runs it stays read-only for the verification.

## Inputs

1. **The plan** — its `Work items` and `Verification` sections especially. If a plan file/path is
   given, read it; otherwise use the plan text provided.
2. **The actual changes** — the working diff:
   ```bash
   git fetch origin --quiet 2>/dev/null || true
   BASE=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
   git diff --name-status "$BASE"...HEAD    # committed
   git status --porcelain                    # uncommitted (flag — won't ship)
   git diff "$BASE"...HEAD                    # full patch
   ```
   Read the changed files themselves when a diff line alone doesn't prove a goal.

## Procedure (completeness is the whole point)

1. **Extract the goal checklist.** Enumerate **every** discrete goal from the plan — each work item,
   each named file to create/edit, each verification/acceptance step, each stated risk-mitigation.
   One row per goal. Do not merge or summarize goals away; a plan with 12 work items yields ≥12 rows.
   Include implicit-but-named obligations (e.g. "run typecheck", "add a test", "update the index").
2. **Map each goal to evidence.** For every row, find the concrete change that fulfils it —
   `file:line`, a new file, a diff hunk, a test, a passing check. Read the file to confirm the change
   does what the goal says, not just that the file was touched.
3. **Mark each goal:**
   - **met** — evidence fully satisfies the goal.
   - **partial** — started but incomplete (e.g. file created but a required field/branch missing, a
     stub, a TODO left, only one of two named files done).
   - **missing** — no evidence in the changes. This is the failure case the skill exists to catch.
4. **Check for scope drift** — changes with no corresponding plan goal. Note them (not necessarily
   wrong, but the plan didn't ask for them; flag risky ones).
5. **Grade the gaps** on the shared rubric below and produce the verdict.

## Severity rubric (shared with pr-self-review / skill-map)

| Severity | Meaning |
|----------|---------|
| **critical** | a goal essential to correctness/security is **missing**, or a change breaks build/tests/migrations; a data-loss or onion-layer regression the plan meant to avoid |
| **major** | a plan goal is **missing or only partial** with real impact (a named file not created, validation the plan required absent, a verification step not done) |
| **minor** | cosmetic/naming/optional-nicety goal unmet; scope-drift worth a note |

**Reject rule:** any **missing** or **partial** goal fails verification. Do not report "done" while
one goal is unaccounted for. If a check the plan named failed, say so with the output — never claim
the plan is complete when it isn't.

## Output format

```
Plan Verification — <plan name/scope> vs changes on <branch>
Goals extracted: <n>   Met: <a>  Partial: <b>  Missing: <c>

| # | Goal (from plan) | Status | Evidence / gap |
|---|------------------|--------|----------------|
| 1 | <goal> | met | path:line |
| 2 | <goal> | partial | path:line — <what's missing> |
| 3 | <goal> | missing | — no change found |
...

Scope drift (changes with no plan goal): <list or "none">

Unmet goals:
  MAJOR   #3 <goal> — missing.
  MINOR   #7 <goal> — partial: <detail>.

VERDICT: PLAN COMPLETE — all <n> goals met   |   INCOMPLETE — <b+c> goals unmet (see above)
```

For a very large plan, keep a detailed per-goal working checklist in `references/checklist.md` and
summarize the rubric here — but the output table must still list **every** goal, never a sample.
