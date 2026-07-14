# Plan-Verifier — goal-extraction checklist

A detailed rubric for extracting an exhaustive, non-lossy goal list from a plan. The core procedure
lives in `../SKILL.md`; this file is the deep reference for *what counts as a goal* so none is
dropped.

## What to extract as a discrete goal

Scan the plan top to bottom. Emit one checklist row for each of:

- **Every work item** — the numbered items in the plan's `Work items` section. If one item names
  several files or several steps, split it: each named file to create/edit is its own row, each
  numbered sub-step that produces an observable change is its own row.
- **Every file named to create or edit** — even if mentioned only in a "Relevant files" or "Affected
  files" list. A named file with no corresponding change is a missing goal.
- **Every verification / acceptance step** — items in the plan's `Verification` section (typecheck,
  test, a smoke test, a triggering test, an index-consistency check). "The build passes" is a goal.
- **Every risk-mitigation the plan committed to** — e.g. "keep it read-only", "don't touch the
  file-classification tables", "run db:migrate before the integration test". If the plan said it
  would honor a constraint, verify the changes honor it.
- **Every explicit non-goal / out-of-scope statement** — record it so scope-drift detection can flag
  a change that violated it.

## What NOT to treat as a goal

- Pure context/background prose with no deliverable.
- Restated repo conventions that aren't a change this plan introduces.
- A goal already covered by another row — dedupe exact duplicates, but when in doubt keep both and
  mark one as covered-by-#N rather than dropping it.

## Status decision rules

- **met** — you read the change and it does what the goal states. Touching the file is not enough;
  the content must fulfil the goal.
- **partial** — any of: only some of the named files done; a stub/TODO left; a required field,
  branch, or edge-case from the goal absent; the change present but a paired verification step not
  run.
- **missing** — no change addresses the goal at all. Always the headline failure.

## Anti-drop safeguards

- Count the plan's work items before you start and assert your table has at least that many rows.
- Never output "…and the rest are done" — list every remaining goal explicitly.
- If the plan is ambiguous about whether something is a goal, include it and mark confidence, rather
  than omitting it.
