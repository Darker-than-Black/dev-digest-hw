# @devdigest/mcp — insights

Non-obvious lessons, gotchas, and pitfalls learned while working in **@devdigest/mcp**.
One entry per lesson. This is the "what bit us" log — keep AGENTS.md a map and
put the *why it bit us* here.

> Format: `### <short title>` + what happened + the rule that prevents a repeat.
> Append-only — add entries, never overwrite. Maintained by the `engineering-insights` skill.
> Link related modules with relative paths.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

### tsx resolves `paths` from the tsconfig of its CWD, and there is NO root tsconfig
`mcp/tsconfig.json` defines the `@devdigest/shared` alias (→ `../server/src/vendor/shared`).
tsx picks up the tsconfig nearest its **working directory**, not the entry file's directory.
The repo root has no `tsconfig.json`, so launching from root gives tsx no `paths` map at all.
Any tsx launcher for this package must run with **cwd = `mcp/`** (or pass `--tsconfig mcp/tsconfig.json`).

## Recurring Errors & Fixes

### MCP server `-32000` on connect = crash-on-startup, run it standalone to see the real error
Claude Code reports `Failed to reconnect to devdigest: -32000` for ANY startup crash — the JSON-RPC
code hides the cause. `.mcp.json` had `npx tsx ./mcp/src/server.ts` with no `cwd`, so tsx ran from
repo root → `ERR_MODULE_NOT_FOUND: Cannot find package '@devdigest/shared'` (see Tool & Library Notes).
Fix: `.mcp.json` → `{ "args": ["tsx", "src/server.ts"], "cwd": "mcp" }`. Debug rule: when the client
only shows `-32000`, run the server command by hand from the SAME cwd the config uses; the crash prints.

## Session Notes

## Open Questions
