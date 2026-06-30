# @devdigest/e2e — browser end-to-end

Deterministic UI flows via Vercel **agent-browser** (Rust + CDP CLI). **No
Playwright, no LLM, no API key.** How a flow works → [./README.md](./README.md)

## Layout
- `specs/NN-name.flow.json` — each flow = ordered list of agent-browser commands
- `run.ts` — runner: executes a flow's steps against one shared browser session
- `lib/` — runner helpers · `agent-browser.json` — agent-browser config

## Conventions (non-default)
- A flow is **data, not code**: JSON `{ name, steps:[{ cmd:[…], label }] }`. Add flows as JSON, not new TS.
- Steps run in order against **one shared session** — order matters; assume state carries between steps.
- Deterministic by design — no LLM, no randomness. Use `{BASE}` placeholder for the app URL.
- Needs the real stack running (Docker Postgres + seeded API + web).

## Commands
- run `pnpm exec tsx run.ts` (or via `scripts/e2e.sh`)

## Read when…
- adding/debugging a flow → existing `specs/*.flow.json` + `run.ts`
- how-to guides → [./docs/](./docs/)
- past pitfalls / flaky-flow lessons → [./insights.md](./insights.md)
