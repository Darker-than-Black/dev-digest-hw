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

### Resolve the feature model ONCE, thread it into best-effort sub-calls
`modules/intent/service.ts` `computeIntent` resolves `resolveFeatureModel(...,'review_intent')`
once, then passes `{provider,model}` straight into `gatherSpec`'s optional second LLM call
(`condenseSpec`, for long combined specs) instead of re-resolving — one settings read, guaranteed
same model for both calls. Reuse this shape for any feature needing a "cheap pre-process call +
main call" pair on one feature-model slot.

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
doc-comment even lists which lesson modules are coming (`skills`, `intent`, `eval`, …). Confirmed
again for the Intent layer: `pr_intent` table, `Intent`/`PrIntentRecord` contracts, the
`upsertIntent`/`getIntent` repository methods, the `review_intent` `FeatureModelId`, and even the
`INJECTION_GUARD` prompt text ("derived intent/scope") all pre-existed with zero callers —
`modules/intent/` was pure wiring, no new migration.

### Skill bodies reach the prompt ONLY via `run-executor` — the seam is silent
The `## Skills / rules` block was fully scaffolded end-to-end (`PromptParts.skills[]` in
reviewer-core `prompt.ts`, `ReviewInput.skills` in `review/run.ts`, the trace-UI block) but
`modules/reviews/run-executor.ts` never passed `skills`, so the block was ALWAYS empty and
nothing downstream complained. Wiring point: `runOneAgent`, before `reviewPullRequest` — load
`this.agents.linkedSkills(agent.id)`, filter `skill.enabled && link.enabled`, keep link order,
map `.body`. `container.agentsRepo` is the `AgentsRepository` (owns the agent side of the join).
Same silent-seam shape hit the Intent layer's `## Review scope` block — see
[../reviewer-core/insights.md](../reviewer-core/insights.md).

### A live review needs a real diff — seeded PRs with NULL `pr_files.patch` review to nothing
`modules/reviews/diff-loader.ts` tries `container.git.diff(base…head)` first, then falls back to
reconstructing a unified diff from `pr_files` rows — but only for rows where `patch` is non-null
(`if (!f.patch) continue`). The seed PR #482 (`acme/payments-api`, `clone_path=null`) stores
`pr_files` with `patch: null` and pre-baked `reviews`/`findings` for DISPLAY only, so a *live*
review of it loads an EMPTY diff and the LLM has nothing to chew on. To exercise a real run
(e.g. skills on/off experiments) you need a PR whose `pr_files.patch` holds actual `@@` hunks:
either a repo with a real clone, or insert a synthetic PR row + `pr_files(patch=<hunks>)` — the
loader prepends the `diff --git`/`---`/`+++` headers itself, so store only the hunk body.

### `AgentVersionConfig.skills` is a bare `string[]` — don't snapshot objects into it
`agent_versions.config_json.skills` is validated by `AgentVersionConfig` = `z.array(z.string())`
and re-parsed in `toAgentVersionDto` on read. Tempting to record per-link `{id,order,enabled}`
for reproducibility, but that throws on every version read. Per-link `enabled` lives only on
`agent_skills`; the snapshot stays ordered ids.

### Path-from-user-text safety gate: `safeRepoPath` — reject `..`, leading `/`, null bytes, drive paths BEFORE any `readFiles`
`repoIntel.readFiles` (and `git.readFile`) do a plain `join(clonePath, path)` with **no**
traversal guard of their own. Any feature that derives a repo-relative path from
user-controlled text (PR body, issue body, etc.) MUST pass it through a `safeRepoPath`-style
gate first, applied to every candidate path before the read call — see
`modules/intent/helpers.ts`. Grep `safeRepoPath` before writing a new "read this
user-referenced file" feature instead of re-deriving the traversal check from scratch; this is
exactly the kind of miss the `pr-self-review` gate treats as critical.

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

### `drizzle-kit generate` rename-resolver is INTERACTIVE — hangs on piped stdin
Dropping a column while adding others makes drizzle-kit ask "created or renamed from X?"
per new column — a TTY select prompt. There is no `--yes`; piping (`yes '' | pnpm
db:generate`) does NOT answer it, it hangs then dies (exit 144). Fix: keep the old column
in the schema so the migration is purely ADDITIVE (no drop → no rename question). We kept
an unused `conventions.accepted` boolean beside the new `status` enum for exactly this.

### `fflate` for in-memory zip — guard entries, paths, and decompressed size
`unzipSync(buf)` → `Record<path, Uint8Array>`, fully in memory (no disk, no native dep). Skip
directory entries (`name.endsWith('/')`), reject `..` / absolute paths (traversal), and cap both
entry count and total decompressed bytes (zip-bomb). For "text-only, never execute" imports,
enumerate executable/binary entries into an `ignored_files` list and simply never read them —
extraction = reading selected text entries, nothing runs. See `modules/skills/import.ts`.

### Hunk-header extraction: regex `@@ ... @@` off raw `patch`, never `parseUnifiedDiff`
`parseUnifiedDiff` keeps only the four numeric fields off a `@@` line and **drops** the trailing
function-context text (`@@ -12,3 +12,4 @@ function foo() {`). Any feature that wants hunk
headers WITH context but no diff body (e.g. a cheap "structure-aware, no-code" classifier call)
must regex `/^@@ .* @@.*$/gm` directly off `pr_files.patch` instead — see
`modules/intent/helpers.ts:buildFileList`.

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

### 2026-07-09 — Conventions Extractor module (extract → gate → skill-draft)
New `modules/conventions/` (flat, mirrors `agents/`). `POST /repos/:id/conventions/extract`
is synchronous: samples (configs by name ∪ top-12 via `getConventionSamples`) → LLM
(`resolveFeatureModel('conventions')`, structured `{candidates:[…]}` root) → code-side
evidence gate (`verifyEvidence` in `helpers.ts`: whitespace-normalized snippet substring +
line-range ±3) drops ungrounded proposals → persist `pending`. Skill is NOT created here:
`skill-draft` assembles editable markdown, client saves via existing `POST /skills`. Extended
the reserved `conventions` table/`ConventionCandidate` contract (migration `0012`, additive).

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

### 2026-07-15 — Intent layer (derive → persist → inject → auto-compute)
New `modules/intent/` (constants/helpers/spec-gather/service/routes) wires the pre-scaffolded
`pr_intent` table + `Intent`/`PrIntentRecord` contracts + `review_intent` `FeatureModelId` into a
live path: `GET/POST /pulls/:id/intent(/recompute)`. Spec gathered from 3 best-effort sources
(inline body, `safeRepoPath`-filtered repo plan file via `repoIntel.readFiles`, linked GitHub
issue via try/catch around `container.github()`), condensed with a second cheap LLM call above a
token cap. Auto-compute-if-missing wired into `modules/reviews/run-executor.ts` right after the
diff-load step, `.catch(() => undefined)` so an unavailable intent never fails a review; injected
into `reviewPullRequest` as `intent` → reviewer-core's new `## Review scope` section. `review_intent`
default model flipped `openai/gpt-4.1` → `openrouter/deepseek-v4-flash` (mirrors `onboarding`,
the only other flash-class default in the registry) in BOTH `server/src/vendor/shared/contracts/platform.ts`
and `client/src/lib/feature-models.ts` — byte-matched, verified by the orchestrator. No new
migration (table pre-existed). Engine pieces → [../reviewer-core/insights.md](../reviewer-core/insights.md).
Client → [client/insights.md](../client/insights.md).

## Open Questions

### PR-list cost has no dedicated test
The `SUM(cost_usd) GROUP BY pr_id` aggregate in `modules/pulls/routes.ts` is only covered by
typecheck — no it.test exercises a multi-run PR summing to a known total. Add one if the
aggregate logic grows (per-PR filtering, date windows).

### Intent derivation has no test coverage yet
The Intent layer (`modules/intent/`, `reviewer-core/src/intent.ts`, the `run-executor.ts` wiring)
was implemented with tests explicitly deferred to a later pass (user request). Nothing exercises
`safeRepoPath` traversal rejection, the best-effort degrade paths (github offline, readFiles
disabled), the `SPEC_TOKEN_CAP` compression trigger, or the `## Review scope` prompt-parity
(present/absent) beyond a manual read. Write these first when tests are added — they're the
security- and correctness-critical seams called out in `docs/plans/intent-layer.md`.

### Clone freshness — `readFiles` doesn't checkout the PR's exact `headSha`
`spec-gather.ts`'s repo-file read goes through `repoIntel.readFiles`, which reads whatever is
currently checked out in the local clone, not necessarily the PR's head commit. A stale clone or
wrong branch could feed the classifier the wrong version of a referenced plan file. Accepted as
a v1 limitation (best-effort context) — revisit if intent quality complaints trace back to this.
