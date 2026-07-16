# Plan: DevDigest MCP Server (5 tools) — v2, aligned to the 4 design principles

## Context

We built a first version of the `mcp/` package (5 tools over stdio, thin HTTP
client to the API on `:3001`, typecheck green). The user then supplied the
assignment's actual requirements (two screenshots). The current implementation
**partially** matches them; this plan updates the implementation to fully comply.

**The 4 design principles the tools must follow (screenshot 1):**
1. **Result, not operation** — `run_agent_on_pr(repo, pr, agent)` itself does all 3
   steps: create the run, **wait**, return findings. (Current v1 returns `run_ids`
   immediately — the opposite. This is the biggest change and overrides the earlier
   "return run_ids now" decision, per the user's explicit confirmation.)
2. **Flat arguments** — pass `repo`, `pr`, `agent` as separate simple values, not a
   nested object / internal uuid. Non-Anthropic models err more on nested inputs.
3. **Concise structured response** — return `{ verdict, findings[] }` with only the
   needed fields, never a raw dump (one full dump can burn tens of thousands of tokens).
4. **Errors move you forward** — instead of a dry "404", return actionable text like
   "agent not found — call list_agents", so the agent takes the next step instead of
   stalling.

**Tool set + semantics (screenshot 2):**
- `list_agents` — which reviewer agents are configured; the agent gets a valid id here.
- `run_agent_on_pr` — runs the review, **waits**, returns ready findings; the **only
  write tool**.
- `get_findings` — concise verdict for an already-completed run.
- `get_conventions` — repo conventions (the L02 repo-conventions feature).
- `get_blast_radius` — PR impact map; **stub**, finished in a later homework.

## Gap analysis (v1 → required)

| Requirement                                                       | v1 now                                              | Action                                                                         |
|-------------------------------------------------------------------|-----------------------------------------------------|--------------------------------------------------------------------------------|
| Name `run_agent_on_pr`                                            | `run_agent`                                         | rename tool + export                                                           |
| Result-not-operation (wait, return findings)                      | returns `run_ids`, `status:queued`                  | make it **block**: create → poll runs to completion → return review            |
| Flat args `repo, pr, agent`                                       | single `pullRequestId` uuid + `agentId`             | accept `repo` (owner/name), `pr` (number), `agent` (name/id); resolve to uuids |
| Concise `{verdict, findings[]}`                                   | `get_findings` compact ✓; `run` returns no findings | `run` returns shaped review; keep `get_findings` compact                       |
| Actionable errors                                                 | raw `code: message`                                 | resolvers throw next-step guidance (e.g. "call list_agents")                   |
| `get_findings` / `get_conventions` / `get_blast_radius` flat args | take uuids                                          | switch to `repo`/`pr` flat inputs, resolve internally                          |

## Backend endpoints used (all HTTP, contracts from `@devdigest/shared`)

- `GET /agents` → `Agent[]` — resolve agent by id/name; power list_agents.
- `GET /repos` → `Repo[]` (`full_name`, `name`, `id`) — resolve repo.
- `GET /repos/:id/pulls` → `PrMeta[]` (`number`, nullish `id`) — resolve PR number→uuid.
- `POST /pulls/:id/review` body `RunRequest {agentId}` → `ReviewRunResponse` (`runs[].run_id`).
- `GET /pulls/:id/runs` → `RunSummary[]` (`run_id`, `status` = running|done|failed|cancelled) — **poll for completion**.
- `GET /pulls/:id/reviews` → `ReviewRecord[]` (findings nested) — final result.
- Conventions: `GET /repos/:id/conventions` (or `…/extract`).

## Files

New / changed under `mcp/src`:
```
config.ts        # + runTimeoutMs / runPollMs poll knobs                    [DONE]
resolve.ts       # resolveAgentId / resolveRepoId / resolvePrId — flat→uuid,
                 #   actionable errors                                       [DONE]
shape.ts         # shapeReview / shapeFinding — concise {verdict, findings[]}[DONE]
http.ts          # unchanged (already throws ApiError + network error)
tools/_result.ts # defineTool wrapper (registerTool non-generic cast)       # unchanged
tools/list-agents.ts        # unchanged
tools/run-agent.ts          # → tool id `run_agent_on_pr`, flat args, WAIT loop, return shaped review
tools/get-findings.ts       # flat args (repo, pr), return shaped reviews
tools/get-conventions.ts    # flat arg (repo), resolve repo id
tools/get-blast-radius.ts   # flat arg (repo), resolve repo id, keep stub
server.ts        # register run tool under new name
scripts/smoke.mts# update tool name/args
AGENTS.md        # update tool table + semantics
```

## Key implementation detail — the wait loop (`run_agent_on_pr`)

1. `agentId = resolveAgentId(agent)`, `repoId = resolveRepoId(repo)`,
   `prId = resolvePrId(repoId, pr)`.
2. `POST /pulls/${prId}/review {agentId}` → grab our `run_id` from `runs[]`
   (match `agent_id`).
3. Poll `GET /pulls/${prId}/runs` every `runPollMs` (default 2s) until our run's
   `status ∈ {done, failed, cancelled}` or `runTimeoutMs` (default 180s) elapses.
   - `failed`/`cancelled` → actionable error with the run's `error`.
   - **timeout** → return a non-error result `{ status:'running', run_id, hint:'call
     get_findings later' }` (don't hang forever; keep the agent moving).
4. On `done` → `GET /pulls/${prId}/reviews`, pick the review with `run_id === ours`,
   return `shapeReview(...)` = `{ agent, verdict, score, summary, findings[] }`.
5. Sleep via `await new Promise(r => setTimeout(r, ms))`. No `Date.now()` needed for
   the deadline — count elapsed poll iterations (`iterations * runPollMs`).

## Verification (end-to-end)

1. `cd mcp && pnpm typecheck` — green (already passing pre-change; re-run after edits).
2. `npx tsx mcp/scripts/smoke.mts` (no backend) — 5 tools list; names include
   `run_agent_on_pr`; `get_blast_radius` returns the degraded stub.
3. Backend up (`./scripts/dev.sh`, seed a repo+PR+agent). Then via the smoke script
   or MCP Inspector:
   - `list_agents` → seeded agents.
   - `run_agent_on_pr("owner/name", <pr#>, "<agent name>")` → **blocks**, then returns
     `{verdict, findings[]}`.
   - `get_findings("owner/name", <pr#>)` → same concise verdict.
   - `get_conventions("owner/name")` → conventions.
   - Bad agent name → error text telling the model to call `list_agents`.
4. Token check: `/context` in a client — 5-tool block stays a small % of context.

## Open items

- Timeout default 180s — long for an MCP tool, but the requirement is to wait. Made
  configurable via env; on timeout returns "still running" + run_id rather than erroring.
- `PrMeta.id` is nullish (un-imported PRs) — resolver throws an actionable "open it in
  the studio to import it first" message.
- Blast radius still a stub (`reason:not_implemented`); wired to repo-intel later.
