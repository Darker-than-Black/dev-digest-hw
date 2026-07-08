# @devdigest/api — insights

Non-obvious lessons, gotchas, and pitfalls learned while working in **@devdigest/api**.
One entry per lesson. This is the "what bit us" log — keep CLAUDE.md a map and
put the *why it bit us* here.

> Format: `### <short title>` + what happened + the rule that prevents a repeat.
> Append-only — add entries, never overwrite. Maintained by the `engineering-insights` skill.
> Link related modules with relative paths.

## What Works

### Re-thread a per-run metric: engine already computes it, plumbing is the work
Per-run `costUsd` is computed in `reviewer-core` (`ReviewOutcome.costUsd`) but was severed
from persistence/UI by commit `d45ab0d`. Re-surfacing = pure plumbing, **zero new model calls**:
add column → pass through executor → contracts → routes. Before adding a "new" metric, check
`ReviewOutcome` / the LLM `StructuredResult` — tokens AND cost are already there.

## What Doesn't Work

## Codebase Patterns

### `completeAgentRun` has TWO signatures — the repo fn AND a facade wrapper
`agent_runs` writes go through a facade: `modules/reviews/repository.ts` re-declares the
`values` type inline and proxies to `repository/run.repo.ts`. Adding a field (e.g. `costUsd`)
means editing **both** type literals or typecheck fails at the call site in `run-executor.ts`.
Grep `completeAgentRun` before touching it — expect 2 hits, not 1.

### Per-run cost lives on `agent_runs`, not `reviews`
`reviews.runId` → `agent_runs.id` (no FK). PR-list SCORE comes from latest `reviews` row, but
COST must aggregate `agent_runs.cost_usd` (`SUM … GROUP BY pr_id` in `modules/pulls/routes.ts`).
Don't look for cost on the review row.

### PR-list per-severity findings breakdown = `findings ⋈ reviews` by `prId`, kind='review'
Same shape as the SCORE/COST aggregates in `modules/pulls/routes.ts`: one IN-query +
JS group, no FK denorm. `select({prId:reviews.prId, severity:findings.severity, n:count()})`
`.from(findings).innerJoin(reviews,…).where(inArray(reviews.prId,ids) AND reviews.kind='review')`
`.groupBy(reviews.prId, findings.severity)`. Counts **all** review runs of the PR (matches the
detail page's `runs.flatMap(r=>r.findings)`). `findings.severity` is plain `text` (no pg enum) —
**clamp to the 3 known keys**, ignore strays, or one bad row breaks the response shape.

### No seed creates `agent_runs` / `run_traces`
`db/seed.ts` seeds repos/PRs/reviews/findings/agents only — **runs are born from live reviews**.
A feature that displays run data shows nothing on a fresh seed until a real review runs. Don't
plan a "seed the runs" step; it doesn't exist.

### Starter ships schema + Zod contracts for UNBUILT features — check before creating them
Building the Skills feature, `skills` / `skill_versions` / `agent_skills` tables AND the
`Skill` / `SkillType` / `AgentSkillLink` Zod contracts already existed in the Part-0 starter —
only `modules/skills/` and the prompt wiring were missing. Before a "new feature" migration or
contract, grep `db/schema/*` and `vendor/shared/contracts/*`: half the domain may already be
there, and re-declaring it fights the existing PK/unique index. The starter's `modules/index.ts`
doc-comment even lists which lesson modules are coming (`skills`, `intent`, `eval`, …).

### Skill bodies reach the prompt ONLY via `run-executor` — the seam is silent
The `## Skills / rules` block was fully scaffolded end-to-end (`PromptParts.skills[]` in
reviewer-core `prompt.ts`, `ReviewInput.skills` in `review/run.ts`, the trace-UI block) but
`modules/reviews/run-executor.ts` never passed `skills`, so the block was ALWAYS empty and
nothing downstream complained. Wiring point: `runOneAgent`, before `reviewPullRequest` — load
`this.agents.linkedSkills(agent.id)`, filter `skill.enabled && link.enabled`, keep link order,
map `.body`. `container.agentsRepo` is the `AgentsRepository` (owns the agent side of the join).

### `AgentVersionConfig.skills` is a bare `string[]` — don't snapshot objects into it
`agent_versions.config_json.skills` is validated by `AgentVersionConfig` = `z.array(z.string())`
and re-parsed in `toAgentVersionDto` on read. Tempting to record per-link `{id,order,enabled}`
for reproducibility, but that throws on every version read. Per-link `enabled` lives only on
`agent_skills`; the snapshot stays ordered ids.

## Tool & Library Notes

### Drizzle `sum()` returns `string | null`, not number
`select({ total: sum(t.agentRuns.costUsd) })` yields a numeric **string** (or null when all
rows NULL). Wrap: `total != null ? Number(total) : null`. Postgres `SUM` ignores NULL rows, so
all-NULL group → null → render "—".

### No `@fastify/multipart` — file uploads arrive as base64 JSON
The app registers no multipart plugin, so there is no `req.file()`. The skill-import route takes
a normal JSON body `{ filename, content_base64 }` (Zod-validated like any route) and does
`Buffer.from(content_base64, 'base64')`. Enforce a size cap on the decoded buffer. Follow this
shape for any future upload rather than wiring multipart.

### `fflate` for in-memory zip — guard entries, paths, and decompressed size
`unzipSync(buf)` → `Record<path, Uint8Array>`, fully in memory (no disk, no native dep). Skip
directory entries (`name.endsWith('/')`), reject `..` / absolute paths (traversal), and cap both
entry count and total decompressed bytes (zip-bomb). For "text-only, never execute" imports,
enumerate executable/binary entries into an `ignored_files` list and simply never read them —
extraction = reading selected text entries, nothing runs. See `modules/skills/import.ts`.

## Recurring Errors & Fixes

### `cost_usd` missing in RunStats/RunSummary fixtures → Zod/TS failures
Adding a required field to a contract breaks every test fixture that builds it. After editing
`vendor/shared/contracts/trace.ts`, fix `test/contracts.test.ts` (the `RunTrace.parse` stats
fixture) and the client `RunHistory`/`RunTraceDrawer` test fixtures in the same pass.

## Session Notes

### 2026-07-01 — per-run cost surfaced in UI (3 places)
Re-threaded `costUsd` (severed by `d45ab0d`): migration `0010` re-adds `agent_runs.cost_usd`;
executor → `completeAgentRun` (+ facade) → trace `stats` → `RunSummary`/`RunStats`/`PrMeta`
contracts; PR-list `SUM` route. Client mirror + `RunCostBadge`. See [client/insights.md](../client/insights.md).
Tests: `reviews.it.test.ts` asserts cost persists DB→trace→`GET /pulls/:id/runs`.

### 2026-07-01 — per-severity findings breakdown on PrMeta (PR-list column)
Added `findings:{CRITICAL,WARNING,SUGGESTION}` (nullish) to `PrMeta` (both vendored copies) +
a COUNT-by-severity aggregate in `modules/pulls/routes.ts` (mirrors score/cost). `null` until
reviewed → UI renders `—`. Test: `reviews.it.test.ts` inserts mixed-severity findings directly
(grounding would drop them) and asserts the list breakdown + `null` for an unreviewed PR. Client
UI (popover + navigate) → [client/insights.md](../client/insights.md).

### 2026-07-09 — Skills feature (CRUD module + per-link enable + prompt wiring)
New `modules/skills/` (routes/service/repository/helpers/constants/import) over the pre-existing
`skills`/`skill_versions` tables; body changes bump `skills.version` + snapshot `skill_versions`
(mirrors agents' `snapshotVersion`/`isConfigChange`). Migration `0011`: `agent_skills.enabled`
(per-link mute) + unique `skills(workspace_id, name)` (slug). Extended agents `setSkills` to carry
`enabled`, added `setSkillEnabled` + `PATCH /agents/:id/skills/:skillId`. Load-bearing wiring:
`run-executor.ts` now resolves enabled skill bodies into `reviewPullRequest({skills})`. Import is
text-only base64 `.md`/`.zip` (`fflate`) with preview→confirm. Seed: Test Quality + API Contract
agents, 6 skills (one `source:extracted`), linked. Slug uniqueness → `ConflictError` (new 409 in
`platform/errors.ts`). Client → [client/insights.md](../client/insights.md).

## Open Questions

### PR-list cost has no dedicated test
The `SUM(cost_usd) GROUP BY pr_id` aggregate in `modules/pulls/routes.ts` is only covered by
typecheck — no it.test exercises a multi-run PR summing to a known total. Add one if the
aggregate logic grows (per-PR filtering, date windows).
