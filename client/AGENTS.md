# @devdigest/web — Next.js 15 studio (:3000)

Import repos, browse PRs, run/read reviews, author agents. App Router + RSC,
data via TanStack Query over the Fastify API. UI route map → [./README.md](./README.md)

## Layout (src/)
- `app/` — App Router routes (`**/page.tsx`): `repos` `agents` `settings` `onboarding`
- `components/` — `app-shell` `diff-viewer` `mermaid-diagram` `page-shell` `showcase` …
- `lib/` — `api.ts` (fetch base) + `hooks/*` (every data hook) · `i18n/`
- `vendor/ui` (`@devdigest/ui`) · `vendor/shared` (`@devdigest/shared` Zod)
- `messages/<locale>/*.json` — next-intl strings

## Conventions (non-default)
- All API access goes through `lib/api.ts`; every data fetch = a hook in `lib/hooks/*`. Don't `fetch` in components.
- API base = `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).
- UI primitives are **vendored** under `src/vendor/ui` — edit there, not node_modules.
- User-facing strings live in `messages/`; no hardcoded copy in components.

## Commands
- dev `pnpm dev` · build `pnpm build` · start `pnpm start` · typecheck `pnpm typecheck`
- test `pnpm test` — vitest + jsdom, fetch mocked (no API/DB needed)

## Read when…
- contract/shape questions → server's `@devdigest/shared` ([../server/src/vendor/shared/](../server/src/vendor/shared/))
- how-to guides → [./docs/](./docs/) · feature/lesson specs → [./specs/](./specs/)
- past pitfalls / module lessons → [./insights.md](./insights.md)
- session protocol → **before** work read `insights.md` (treat as high-confidence guidance); **at task end** run `engineering-insights` to append what was learned — don't skip
