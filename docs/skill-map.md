# Skill Map — file classification → which skills apply

**Single source of truth.** Consumed by three agents/skills so they never drift:
- `pr-self-review` (the pre-push gate) — reviews a diff against the matching skills
- `planner` agent — classifies each work item and names the skills the implementer must load
- `implementer` agent (+ `frontend-implementer` / `backend-implementer`) — loads only its side's skills at runtime

When you touch a file, classify it below, then load and apply the mapped skills for that side.
Skills are loaded **on demand at runtime** via the `Skill` tool — not hard-bundled — so a
pure front-end task never pulls back-end rules into context, and vice-versa.

## File classification

| Path glob | Side | Notes |
|-----------|------|-------|
| `client/**` | **front-end** | Next.js studio (`@devdigest/web`) |
| `server/**` (excl. `clones/**`) | **back-end** | Fastify API (`@devdigest/api`) |
| `reviewer-core/**` | **back-end** | pure TS engine — keep it DB/IO-free |
| `**/*.schema.ts`, `**/vendor/shared/**`, Zod contracts | **shared** | load `zod` on either side |
| `e2e/**` | **back-end-ish** | deterministic browser e2e (see TESTING.md) |
| `*.md`, `scripts/**`, config, `docker-compose*` | **other** | light review; skip arch skills |
| `server/clones/**` | **ignore** | vendored clones — never review or edit |

## Skill map — which skills apply to which side

**Front-end files (`client/**`)** — load and apply:
- `ui-architecture` — where a component lives, splitting, business-logic/constants placement, client-vs-server state, prop/composition design, a11y/Web-Vitals
- `react-best-practices` — hooks misuse, derive-don't-store, keys, memoization, conditional rendering
- `next-best-practices` — RSC boundaries, `page.tsx`/`layout.tsx`, async APIs, metadata, route handlers, image/font
- `react-testing-library` — component/hook tests (Vitest + jsdom) for changed UI

**Back-end files (`server/**`, `reviewer-core/**`)** — load and apply:
- `onion-architecture` — the 4 rings (domain → application → infrastructure → transport), inward-only dependency rule, module/DI placement, keep `reviewer-core` pure
- `fastify-best-practices` — routes/plugins/hooks, JSON-schema validation, error handling, serialization
- `drizzle-orm-patterns` — schema, queries, relations, transactions, migrations
- `postgresql-table-design` — data types, indexing, constraints, perf

**Shared / either side (load when relevant lines are touched):**
- `zod` — any `z.object`/contract change (loads on both sides)
- `typescript-expert` — tricky types on changed lines
- `security` — auth, input handling, file uploads, secrets, API endpoints (**always** load when a back-end route or any input-boundary changes)

## Severity rubric (shared with `pr-self-review`)

| Severity | Meaning | Gate |
|----------|---------|------|
| **critical** | breaks build/tests/migrations; security hole (authz bypass, injection, leaked secret); onion layer violation (domain imports infra, `reviewer-core` touches DB/GitHub/fs); data-loss migration | **BLOCK push** |
| **major** | clear anti-pattern or bug with real impact; missing validation on an input boundary; wrong RSC/client boundary; N+1 or unindexed hot query | strongly advise fix; ask before push |
| **minor** | style/structure nit, naming, missing small test | non-blocking; note it |

**Reject rule:** ≥1 critical → do not push, list blockers, stop. Report faithfully — if a check
failed, say so with the output; never claim clean when it isn't.
