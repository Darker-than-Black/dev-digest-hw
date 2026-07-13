# DevDigest — repo map

Local-first AI PR review. **4 standalone packages**, no monorepo workspace —
each has own `package.json`/lockfile; cross-package code shared via tsconfig
path aliases, not published modules. Full overview + diagrams → [README.md](README.md)

## Stack
- Node ≥22 · pnpm ≥10 · Docker (Postgres + pgvector only — API/web run on host)
- **server** Fastify 5 · Drizzle ORM/Postgres · Zod · TS
- **client** Next.js 15 (App Router) · React 19 · TanStack Query · next-intl
- **reviewer-core** pure TS engine — no DB/GitHub/fs, LLM via injected provider
- LLM through OpenRouter (OpenAI · Anthropic)

## Where things live
| Path | What | Port |
|------|------|------|
| `server/` | `@devdigest/api` — Fastify API | 3001 |
| `client/` | `@devdigest/web` — Next.js studio | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` — diff→prompt→LLM→findings | — |
| `e2e/` | `@devdigest/e2e` — deterministic browser e2e | — |
| `server/src/modules/repo-intel/` | codebase indexer (the **Indexed** badge) | — |
| `server/src/vendor/shared/` | `@devdigest/shared` — Zod contracts, every package | — |

## Build / test / run
- Boot from zero: `./scripts/dev.sh` (Postgres + API + web). Flags: `--no-seed` `--no-client` `--db-only`
- Per-package `test` / `typecheck` / `dev` → that package's `AGENTS.md`

## Gotchas (non-obvious)
- Server does **NOT** migrate on boot. `relation … does not exist` → `cd server && pnpm db:migrate`
- DB schema holds **every** course table; unused ones sit empty until a lesson fills them
- Reset all state: `docker compose down -v` then `./scripts/dev.sh`
- Course lessons L01–L08 add features back; starter ≠ full product (table in README)

## Read when…
- changing architecture / data flow → [README.md](README.md) (mermaid)
- touching tests or CI → [TESTING.md](TESTING.md)
- writing/editing agent prompts → [docs/agent-prompts/](docs/agent-prompts/)
- working inside a package → that package's `AGENTS.md` (auto-loads on touch)
