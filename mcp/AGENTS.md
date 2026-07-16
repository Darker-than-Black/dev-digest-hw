# @devdigest/mcp — MCP server (stdio)

Exposes DevDigest's PR-review engine as 5 agent-callable MCP tools. **Thin,
stateless HTTP client** over the Fastify API (`:3001`) — it does NOT boot the DB
or DI container. Response bodies are validated with the same `@devdigest/shared`
Zod contracts the API serialises.

## Tools
Flat args (`repo` = "owner/name", `pr` = number, `agent` = name/id) → resolved to
internal uuids in `src/resolve.ts` (which throws actionable, next-step errors).

| Tool               | Args                         | Backend                                                                          | Notes                                                                                                                                          |
|--------------------|------------------------------|----------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `list_agents`      | `onlyEnabled?`               | `GET /agents`                                                                    | compact list (id/name/provider/model/enabled); source of a valid agent id                                                                      |
| `run_agent_on_pr`  | `repo, pr, agent, detailed?` | `POST /pulls/:id/review` → poll `GET /pulls/:id/runs` → `GET /pulls/:id/reviews` | **only write tool.** Result-not-operation: creates the run, **waits**, returns `{verdict, findings[]}`. Timeout → `{status:'running', run_id}` |
| `get_findings`     | `repo, pr, detailed?`        | `GET /pulls/:id/reviews`                                                         | concise verdict + findings for a done run                                                                                                      |
| `get_conventions`  | `repo, extract?`             | `GET /repos/:id/conventions` (`…/extract` when `extract=true`)                   | repo conventions (L02)                                                                                                                         |
| `get_blast_radius` | `repo, changedFiles`         | —                                                                                | **STUB** (`reason:not_implemented`); resolves repo so bad input still errors; wire to repo-intel later                                         |

## The 4 design principles (assignment)
1. **Result, not operation** — `run_agent_on_pr` does create → wait → return findings in one call.
2. **Flat arguments** — simple `repo`/`pr`/`agent` values, no nested objects/uuids (models err less).
3. **Concise structured response** — `{verdict, findings[]}` with needed fields only (`detailed` flag for more); never a raw dump.
4. **Errors move you forward** — resolver errors name the next step (e.g. "call list_agents"), not a dry 404.

## Conventions (non-default)
- **5 tools, one-line descriptions, flat inputs.** The whole schema block loads
  into the client's context every chat — keep it token-lean. No 6th helper tool.
- **Shape responses** via `src/shape.ts` — only decision-relevant fields, not full contracts.
- `run_agent_on_pr` blocks while polling; bound by `DEVDIGEST_RUN_TIMEOUT_MS`
  (default 180000) / `DEVDIGEST_RUN_POLL_MS` (default 2000).
- Contracts come from `@devdigest/shared` via tsconfig `paths` → `../server/src/vendor/shared`.
  `zod` is pinned to this package's own `node_modules` (mirrors reviewer-core) to
  avoid a dual-Zod-instance mismatch across the alias boundary.
- **stdout is the MCP channel** — log only to stderr.
- No auth header — local `LocalNoAuthProvider` resolves the default workspace
  server-side. Add a header in `src/http.ts` if/when auth lands.

## Commands
- dev `pnpm dev` (tsx watch) · typecheck `pnpm typecheck` · build `pnpm build`
- inspector smoke test: `pnpm inspector` (`@modelcontextprotocol/inspector`)
- Requires the API up: from repo root `./scripts/dev.sh` (Postgres + API + web).
  No-auto-migrate gotcha: `cd server && pnpm db:migrate` on `relation … does not exist`.

## Client wiring (`.mcp.json` / claude_desktop_config.json)
```json
{ "command": "tsx", "args": ["<repo>/mcp/src/server.ts"],
  "env": { "DEVDIGEST_API_URL": "http://localhost:3001" } }
```
