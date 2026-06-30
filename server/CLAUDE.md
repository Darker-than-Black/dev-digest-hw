# @devdigest/api — Fastify backend (:3001)

Imports repos/PRs, indexes with repo-intel, stores agents, runs the reviewer
(diff → reviewer-core → grounded findings). Deep dive + API map → [./README.md](./README.md)

## Layout (src/)
- `modules/<name>/` — self-contained plugins: `repos` `pulls` `reviews` `agents` `settings` `polling` `repo-intel` `workspace` (`_shared` = cross-module helpers)
- `adapters/` — LLM · GitHub · git · ast-grep behind a DI container (swapped for mocks in tests)
- `db/` — Drizzle schema + migrations · `platform/` — config/boot · `prompts/` · `app.ts` `server.ts`
- `vendor/shared/` — `@devdigest/shared` Zod contracts (source of truth for routes)

## Conventions (non-default)
- Zod contracts double as route schemas via `fastify-type-provider-zod` — one def drives request validation **and** response serialization. Don't hand-write schemas.
- Adapters injected via DI container — depend on the interface, never import a concrete adapter.
- No keys needed to boot: `loadConfig` (`platform/config.ts`) marks every secret optional; secrets stored in `~/.devdigest/secrets.json` or set at runtime via Settings.
- Each new course lesson = new `modules/<name>/` plugin + a prompt slot. Follow existing module shape.

## Commands
- dev `pnpm dev` · build `pnpm build` · typecheck `pnpm typecheck`
- db `pnpm db:migrate` (NOT auto on boot) · `pnpm db:seed` (idempotent) · `pnpm db:generate`
- test `pnpm test` — `*.it.test.ts` = DB-backed (testcontainers Postgres); rest hermetic. Split: `pnpm exec vitest run --exclude '**/*.it.test.ts'` vs `… .it.test`

## Read when…
- working in the indexer → [src/modules/repo-intel/CLAUDE.md](src/modules/repo-intel/CLAUDE.md)
- editing the review engine → [../reviewer-core/CLAUDE.md](../reviewer-core/CLAUDE.md)
- test/CI strategy → [../TESTING.md](../TESTING.md)
- how-to guides → [./docs/](./docs/) · feature/lesson specs → [./specs/](./specs/)
- past pitfalls / module lessons → [./insights.md](./insights.md)
