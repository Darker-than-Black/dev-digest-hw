# @devdigest/web — insights

Non-obvious lessons, gotchas, and pitfalls learned while working in **@devdigest/web**.
One entry per lesson. This is the "what bit us" log — keep CLAUDE.md a map and
put the *why it bit us* here.

> Format: `### <short title>` + what happened + the rule that prevents a repeat.
> Append-only — add entries, never overwrite. Maintained by the `engineering-insights` skill.
> Link related modules with relative paths.

## What Works

## What Doesn't Work

## Codebase Patterns

### Shared contracts are VENDORED twice — edit both copies
`client/src/vendor/shared/contracts/*` is a hand-mirrored copy of the server's
`@devdigest/shared` (server is source of truth). Adding a field (e.g. `cost_usd` on
`RunStats`/`RunSummary`/`PrMeta`) requires the **same edit in both** `server/src/vendor/shared/`
and `client/src/vendor/shared/` or types drift and tests show "two different types with this
name exist". See [../server/insights.md](../server/insights.md).

### PR-list table is grid-driven by 3 files in lockstep
A new column = edit all of: `constants.ts` `GRID` track string (add width) + `COLUMN_KEYS`
(order = visual order), and the matching cell in `_components/PRRow/PRRow.tsx`. Header
right-aligns only the **last** key (`i === COLUMN_KEYS.length-1`), so insert before `updated`
to keep left-alignment. Miss one and columns misalign silently.

### Cost format = shared `formatCost` in `components/RunCostBadge`
`formatCost(usd)` = `null → "—"`, else `$` + `Number(usd.toPrecision(3))` (3 sig figs, trailing
zeros stripped: 0.06→"$0.06", 0.0013→"$0.0013"). Reused by `RunCostBadge` (PR list + timeline)
and the drawer COST `Stat` card. Never render `$0.00` for a missing value — always `—`.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

### 2026-07-01 — cost display in PR list, timeline, trace drawer
Added `RunCostBadge` + `formatCost` (`components/RunCostBadge/`), COST column (PR table),
cost-only timeline row (`RunHistory`), COST stat card (`TraceBody`). i18n: `prReview.columns.cost`,
`runs.trace.stat.cost`. Data plumbing on server side — see [../server/insights.md](../server/insights.md).

## Open Questions

### No `PRRow.test.tsx` — COST column render is untested
`PRRow` has no test file; the new COST cell is covered only by typecheck. Timeline + drawer cost
ARE unit-tested (`RunHistory.test.tsx`, `RunTraceDrawer.test.tsx`).
