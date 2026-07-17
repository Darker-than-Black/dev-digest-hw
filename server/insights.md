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

### PR detail route (`GET /pulls/:id`) has NO GitHub sync budget — 30s page hang when GitHub is slow/unreachable
`modules/pulls/routes.ts`: the LIST route guards its best-effort sync with `withTimeout(sync, GITHUB_SYNC_BUDGET_MS=2500)` + a shared in-flight map, so a slow/offline GitHub is abandoned to a background sync and persisted rows serve immediately. The DETAIL route does the opposite — it `await gh.getPullRequest(...)` inline with no budget. octokit's per-call `TIMEOUT = 30_000` (`adapters/github/octokit.ts:17`) then blocks the whole request 30s before the catch serves persisted detail. `TimeoutError` is NOT retryable (`defaultIsRetryable` keys off status/code, timeout has neither) so it's one 30s hit, not ×3 — but still a 30s hang per detail load when a token is configured and GitHub is unreachable. The `GitHub PR sync skipped … serving persisted PRs` warning in logs is the LIST background sync's 30s timeout firing AFTER the page already served — log noise, not the slow path. Fix pattern: mirror the list's budget guard on the detail refresh.

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

### `GitClient` port method with zero callers = dead code hiding a real gap — check callers, not just existence
`fetchPullHead(repo, n)` existed on the `GitClient` interface + both implementations (real +
mock) but was never called anywhere — its existence made it *look* like the fork-PR-diff problem
was already handled when it wasn't. Folded it into the new `prepareReviewDiff(repo, baseRef,
prNumber)` (fetches base branch + PR head together, since `diff()`'s three-dot form needs both
reachable for `merge-base`) rather than keeping two half-solutions. When a port method has an
interface declaration + adapter impl but `grep -rn "methodName"` turns up only those two hits
(no call site), don't assume the feature it backs actually works — trace the caller chain.

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

### Blast Radius: an endpoint found only via file-attribution (`factsByFile`) has no BFS depth — pick a fixed best-effort depth, don't fabricate precision
`modules/blast/helpers.ts` merges two endpoint-discovery sources: `getReachableEndpointRefs` (a real
BFS with a true hop-depth) and the facade's `factsByFile` (endpoints found via the 1-hop
symbol-reference caller graph, which has no depth concept at all). Rule: BFS-sourced depth always
wins when both cover the same endpoint (`min`); a `factsByFile`-only endpoint gets a fixed depth of
`1` (a caller of a changed symbol is one hop away) rather than `0` — reserve `0` for "the endpoint's
file IS a changed file," which only the BFS (seeded with the changed files themselves) can assert.
Endpoints with NEITHER source (the fully-degraded/ripgrep path, which never had per-file attribution
even before this change) are dropped from the structured `BlastEndpointRef[]` list rather than
fabricated with an empty/guessed `location` — that path already renders with a degraded/unavailable
badge, so losing those entries from the structured list doesn't hide anything the badge doesn't
already flag. See `mapToBlastResponse`'s endpoint-location merge block.

### Hunk-header extraction: regex `@@ ... @@` off raw `patch`, never `parseUnifiedDiff`
`parseUnifiedDiff` keeps only the four numeric fields off a `@@` line and **drops** the trailing
function-context text (`@@ -12,3 +12,4 @@ function foo() {`). Any feature that wants hunk
headers WITH context but no diff body (e.g. a cheap "structure-aware, no-code" classifier call)
must regex `/^@@ .* @@.*$/gm` directly off `pr_files.patch` instead — see
`modules/intent/helpers.ts:buildFileList`.

### Pure read-compose module shape: no LLM, no persistence
Every prior module either calls an LLM (`reviews`, `intent`, `conventions`) or writes to the DB
(`skills`, `agents`). `modules/smart-diff/` is the first of a third shape: a route that only
reads existing rows (`pr_files`, `findings` via the last review) and deterministically recomposes
them (risk grouping, split suggestion) — zero model calls, zero writes. When a feature is "derive
a view from data another feature already persisted," reach for this shape (`service.ts` = DB
reads only, `helpers.ts` = pure compose) instead of defaulting to the LLM-call or CRUD templates.

### Dedup a JOIN-produced list of parent rows with `selectDistinct`, not `selectDistinctOn`
`getPriorPullsForFiles` (`modules/reviews/repository/pull.repo.ts`) joins `pull_requests` ⋈ `pr_files`
to find PRs touching ANY of a set of paths — a PR with multiple matching files produces multiple
join rows. Since every selected column is already PR-level (no `pr_files` column in the select
list), plain `db.selectDistinct({...})` collapses the duplicates correctly — no need for Postgres's
fussier `DISTINCT ON` (which requires the leading `ORDER BY` expressions to match the `DISTINCT ON`
list). Include the row's own PK in the select even if the caller doesn't need it (here: `pull_requests.id`,
unused by the `PriorPull` contract) so `DISTINCT` dedupes by true identity, not by display columns
that could theoretically collide (e.g. PR `number` is only unique per-repo, not workspace-wide).

### Pure helper modules take local structural interfaces, not Drizzle row imports — now 3-for-3
`modules/intent/helpers.ts` (`PrFileHeaders`), `modules/smart-diff/helpers.ts`
(`SmartDiffInputFile`/`SmartDiffInputFinding`), and `modules/blast/helpers.ts` (`PriorPullSourceRow`,
2026-07-17) all declare a narrow local interface for "the subset of a `pr_files`/`findings`/
`pull_requests` row this module needs" instead of importing the Drizzle row type (or even the
owning module's `repository/*.repo.ts` row type — blast's `PriorPullSourceRow` deliberately doesn't
import `reviews/repository/pull.repo.ts`'s `PriorPullRow`, even though it's structurally the exact
same shape plus an `id` field). This keeps the helpers file DB-free and independently testable with
plain object literals (see each module's `helpers.test.ts`). Confirmed three times now — treat as
the standard shape for any new pure-compose helpers file that consumes DB-shaped data: declare the
local interface, map the real row into it at the service boundary, never import the Drizzle (or
repository) row type into `helpers.ts`.

### Test the workspace-scope gate ORDER, not just its outcome — call-order flags in the fake repo
`modules/smart-diff/service.test.ts`'s 404 test doesn't just assert `getSmartDiff` throws for an
unknown/other-workspace `prId` — it sets `getPrFilesCalled`/`reviewsForPullCalled` booleans inside
the fake `reviewRepo`'s other methods and asserts both stay `false` after the throw. This is the
only test in the codebase using this technique (grepped for `Called = false` across
`modules/*/*.test.ts`). Reuse it for any service where one repo call is the sole workspace gate
and subsequent calls are unscoped by design (`SmartDiffService.getSmartDiff`,
`IntentService.getIntent`, `ReviewService.reviewsForPull`) — asserting only the thrown error
doesn't catch a regression that reorders the calls and leaks another workspace's rows.

### When NOT to add `rateLimit` to a route
`intent`/`reviews` throttle their routes because they fan out to LLM calls (real $ cost per
request). `modules/smart-diff/routes.ts` deliberately has **no** `rateLimit` config — it's a
cheap DB-only read with no LLM call, and adding a limit would signal a cost that doesn't exist.
Base the decision on "does this route call an LLM," not "is this a new route" — a DB-only read/
compose route should stay unthrottled.

## Recurring Errors & Fixes

### A bare `catch {}` around `container.git.diff()` made every fork/fresh PR review "approve" with score 100
`modules/reviews/diff-loader.ts` swallowed the "bad revision" thrown when the PR head sha wasn't
in the local clone (depth-1, default-branch-only — see `repos/constants.ts` `CLONE_DEPTH`), then
silently fell back to `diffFromPrFiles`, which is ALSO empty for a fresh/fork PR (see the "A live
review needs a real diff" entry above — same empty-diff symptom, different root cause: that one is
seed data with `patch: null`, this one is a real clone missing the commit). Net effect: the LLM got
an empty diff and returned 0 findings / a clean verdict — indistinguishable from a genuinely clean
PR. Fix: `GitClient.prepareReviewDiff(repo, baseRef, prNumber)` fetches the base branch AND
`origin pull/<n>/head` (with `REVIEW_DIFF_FETCH_DEPTH=200`, `adapters/git/simple-git.ts`) into the
clone before diffing — best-effort, non-fatal — and the `diff()` catch now logs the error via an
injected `Logger` instead of discarding it. **Any `catch {}`/`catch { /* comment */ }` with no log
call around an external I/O call (git/LLM/GitHub) is a latent "silent wrong answer" bug** — grep
for bare catches before trusting a fallback path is actually reached only on the condition it
claims to be. See `modules/reviews/diff-loader.ts` + `diff-loader.test.ts`.

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

### 2026-07-15 — Smart Diff (risk-ordered layout + last-review findings overlay, no LLM)
New `modules/smart-diff/` (constants/helpers/service/routes): `GET /pulls/:id/smart-diff` groups
`pr_files` into `core`/`wiring`/`boilerplate` by path-pattern classification, sorts each group by
(finding-count desc, churn desc, path asc), overlays the newest `kind:'review'` row's findings by
exact-path + `start_line`, and proposes a same-directory split when total churn exceeds a
threshold. Zero LLM calls, zero writes — see the new "Pure read-compose module shape" pattern
above. `pseudocode_summary` is a locked-`null` field on `SmartDiffFile` (reserved for a future
LLM-backed enhancement, not wired here). No migration — reads only `pr_files`/`findings`/`reviews`.

### 2026-07-16 — Fix empty-diff/false-approve bug for fork & fresh PRs
Root cause: shallow depth-1 clone (default branch only) never had a fork/fresh PR's head commit,
`container.git.diff(base...head)` threw "bad revision," and a bare `catch {}` in
`modules/reviews/diff-loader.ts` masked it before falling back to an also-empty `pr_files`
reconstruction — reviews "approved" with 0 findings / score 100. Added `GitClient.prepareReviewDiff
(repo, baseRef, prNumber)` (`vendor/shared/adapters.ts`, `adapters/git/simple-git.ts` — new
`REVIEW_DIFF_FETCH_DEPTH=200` const, `adapters/mocks.ts`), called best-effort from `loadDiff`
before `diff()`; folded the dead-code `fetchPullHead` into it. `loadDiff` now takes an optional
`Logger` (reused from `run-executor.ts`) and logs both the prepare-failure and the diff-failure
instead of discarding them; `run-executor.ts` bridges its `RunLogger` into that `Logger` shape so
the reason shows up in the run's Live Log. New hermetic `diff-loader.test.ts` (mocked
`container.git` + `ReviewRepository`, no DB). MCP server (`mcp/`) is a thin proxy over this API —
this fix is what makes `run_agent_on_pr` produce a real review for a fork/fresh PR end-to-end.
`client/src/vendor/shared/adapters.ts`'s `GitClient` copy was already stale/divergent from the
server's before this change (missing several other fields too) — **not** updated here (out of
front-end scope; it has no `git` consumer since git access is server-only), flagged for whoever
next reconciles the vendored copies.

### 2026-07-17 — Blast Radius fixes: line-level change detection, unavailable status, true per-symbol caller totals, structured endpoint objects
Server side of a 4-tier fix to `modules/blast/`. New `modules/blast/diff.ts` (pure): `parseChangedLines`
(hunk-header regex → new-side line ranges, extends the existing "regex off raw patch" pattern above)
+ `detectFileChange` (best-effort deleted/renamed sniff — `pr_files` has no `status`/`previous_path`
column). `blast/service.ts` now parallelizes 5 facade reads, intersects each changed file's symbol
line-ranges against its patch hunks to decide `line-level` vs `file-level` `change_detection_mode`
(fixes the old "20 symbols when 1 changed" bug), and owns a `computeIndexStatus` that maps to
`unavailable`/`degraded`/`partial`/`full` (see the repo-intel insight above on why `reason` alone
can't detect true unavailability). `blast/helpers.ts`'s `mapToBlastResponse` now takes an options
object and emits `callers_total`/`callers_truncated`/`relation` per caller and `BlastEndpointRef`
objects (method/path/location/source_symbols/depth) instead of flat strings — `counts.callers` is
now deduped by `relation|file|line|symbol` across the whole result, not summed per-symbol.
repo-intel side (additive only — see that module's insights.md): removed `tryPersistentBlast`'s
global 20-cap, added `getReachableEndpointRefs` (min-depth BFS). Contract (`blast.ts`) was already
extended by another agent before this work started. Client (`BlastTab/*`) done in parallel by a
different agent. Tests: `blast/diff.test.ts`, `blast/helpers.test.ts` (rewritten), `blast/
service.test.ts` (new — status-mapping), `repo-intel-facade-degraded.test.ts` (extended).

Follow-up same day: `prior_pulls` (a `BlastResponse` field the contract already had, but no query
backed it yet). New `reviews/repository/pull.repo.ts:getPriorPullsForFiles` (workspace-scoped,
excludes the current PR, `pull_requests` ⋈ `pr_files` on path overlap, `selectDistinct`-deduped,
newest first — see the dedup insight above) plus `blast/helpers.ts:mapPriorPull` (pure row→contract,
builds the `github.com/.../pull/N` URL the same way the client's `githubPrUrl` does). Also verified/
locked `counts.endpoints === endpoints.length` with an explicit test (it was already tautologically
true from the 07-17 rewrite above, but wasn't asserted anywhere).

**Round-2 correction (same day):** the first pass only scoped `getPriorPullsForFiles` by
`workspaceId` — team lead caught it should ALSO scope by `repoId` (a workspace with two GitHub repos
sharing a relative path, e.g. two Node services both with `src/index.ts`, would otherwise surface
the wrong repo's PRs as "prior PRs touching this file"). Added `eq(pullRequests.repoId, repoId)`
to the `WHERE`. Also: Postgres's DEFAULT null-ordering for `ORDER BY x DESC` is **`NULLS FIRST`**,
not last — a plain `desc(openedAt)` would float never-opened rows to the very top of "newest first."
Needed an explicit `sql\`${col} DESC NULLS LAST\`` (drizzle's `desc()`/`asc()` helpers have no
`.nullsLast()` chain in this drizzle-orm version — a raw `sql` fragment mixed into `.orderBy(...)`
is the way, and it's allowed to sit alongside plain column args in the same call).

Round-3: added the DB-backed `test/pull-repo-prior-pulls.it.test.ts` (workspace + repo isolation is
security-relevant enough to verify against real Postgres, not just fake-repo call-args). Confirms
(a) another workspace's overlapping PR is excluded, (b) a sibling repo in the SAME workspace is
excluded, (c) the current PR is excluded, (d) a PR matching on 2 files dedups to 1 row, (e) the
`NULLS LAST` fix above actually holds against real Postgres (seeded a null-`opened_at` row, asserted
it sorts strictly last). `startPg()` (`test/helpers/pg.ts`) already runs migrations before the test
body executes — no separate `pnpm db:migrate` step needed in a testcontainers-backed `*.it.test.ts`.

### 2026-07-17 — Blast: read-time junk-file filter for endpoints/crons + widened explain gate
Two more blast fixes, same day. (1) `file_facts` (endpoints/crons) is indexed off EVERY parsed file
— a test/mock/fixture file that literally contains something `extractEndpoints`'s regex matches
(e.g. a supertest fixture calling `app.get('/foo', ...)` to mock a route) indexes as a "real"
endpoint with no way to tell it apart downstream. Rather than touch the indexer (repo-intel is
starter infra — additive only, see [repo-intel/insights.md](src/modules/repo-intel/insights.md)),
`blast/helpers.ts` now filters `factsByFile` KEYS and `endpointRefs[].file` through `isJunkPath`
(same list `getTopFilesByRank` already used) BEFORE any location/dedup/attribution logic runs — a
read-time filter, so noisy `file_facts` rows stay persisted, just never surfaced from this one
endpoint. Moved `JUNK_PATH_PATTERNS`/`isJunkPath` from a private helper at the bottom of
`repo-intel/service.ts` to `repo-intel/constants.ts` (exported) so blast could reuse the SAME
definition rather than duplicating it — same "reuse repo-intel constants directly" pattern as
`SUPPORTED_EXT` (see the repo-intel insight above). (2) `?explain=true` used to gate on `index.status
=== 'full'` only; widened to `EXPLAINABLE_STATUSES = {full, degraded, partial}` (new blast/
constants.ts export) — a stale or file-rank-partial index still has REAL impact data worth a
paragraph, only `unavailable` (no data source at all) has nothing to summarize. Testing the gate
required `vi.mock('../settings/feature-models.js')` (the fake container alone can't stand in for
`resolveFeatureModel`, which reads real settings) + a `llm: async () => ({ complete: ... })` stub
added to the shared `makeContainer` fake in `blast/service.test.ts` — first hermetic test in this
module to exercise `explain: true` at all.

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
