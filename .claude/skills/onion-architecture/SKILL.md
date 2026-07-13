---
name: onion-architecture
version: 1.0.0
description: "Backend architecture & layering for the DevDigest server (Fastify 5 · Drizzle ORM · Zod · DI container · reviewer-core engine). Use when deciding where backend code goes and which way dependencies may point: adding/structuring a `modules/<name>/` plugin, placing DB access, defining ports/adapters, wiring the DI container, keeping the reviewer-core domain pure, or reviewing a backend diff for layer violations. Enforces the four onion rings (domain → application → infrastructure → transport) with an inward-only dependency rule. For Fastify route/plugin/schema mechanics see `fastify-best-practices`; for Drizzle query/schema/migrations see `drizzle-orm-patterns`; for Postgres schema design see `postgresql-table-design`; for Zod contracts see `zod`."
---

# Backend Fundamentals — Onion Architecture

Structural decisions for `@devdigest/api` and `@devdigest/reviewer-core`: *where* backend code
goes and *which way* dependencies may point. Code examples → [examples.md](examples.md).
Enforcement config → [references/enforcement.md](references/enforcement.md). Sources →
[references/sources.md](references/sources.md).

## Scope & cross-links

This skill owns **layering / dependency direction**. It does NOT repeat these sibling skills — defer to them:

- `fastify-best-practices` — route/plugin registration, hooks, JSON-schema/serialization, error handling
- `drizzle-orm-patterns` — schema definition, queries, relations, transactions, migrations
- `postgresql-table-design` — Postgres data types, indexing, constraints
- `zod` — contract schema authoring, parsing, `z.infer`
- `security` — authz, injection, secrets (orthogonal to layering)

## Severity Levels

- **CRITICAL** — breaks the dependency rule / a documented repo convention; causes real coupling or rework
- **HIGH** — hurts testability, swappability, or scalability
- **MEDIUM** — hurts maintainability / DX

---

## 1. The four rings & the dependency rule (CRITICAL)

The backend is an onion. **Dependencies point inward only.** An outer ring may import an inner
ring; an inner ring must NEVER import an outer one. Infrastructure connects by *implementing*
interfaces the inner rings own, and is injected at the composition root — never imported inward.

| Ring (inner→outer) | Repo reality | May import |
|------|------|------|
| **Domain core** | `reviewer-core/src` (pure: `prompt.ts`, `grounding.ts`, `reduce.ts`) + `@devdigest/shared` Zod contracts & the port interfaces in `vendor/shared/adapters.ts` | nothing outward — only zod/pure TS |
| **Application** | `modules/*/service.ts` + use-case orchestrators (`reviews/run-executor.ts`, `reviews/diff-loader.ts`), the `repo-intel/service.ts` facade | domain + port interfaces |
| **Infrastructure** | `modules/*/repository.ts` (the only DB layer), `adapters/*`, `db/`, `platform/container.ts` | application, domain, Drizzle, `db/schema` |
| **Transport** | `modules/*/routes.ts` (Fastify plugins), `app.ts` | application (services), shared contracts |

`transport → application → domain`. Infrastructure implements domain-owned ports; the container
(`platform/container.ts`) is the single place the concrete wires meet the interfaces.

## 2. Domain core stays pure (CRITICAL)

- `reviewer-core` has ONE side effect: the LLM call, via an injected `LLMProvider`
  (`reviewer-core/src/review/run.ts:52`, called at `run.ts:174`). It constructs no provider.
- NEVER add `import fs`, a DB driver, `octokit`, or `git` to `reviewer-core`. I/O inputs
  (skills/memory/specs) arrive as already-resolved strings — the engine does not fetch them.
- Domain entities are Zod contracts in `@devdigest/shared` (`contracts/findings.ts`, `adapters.ts`),
  the single source of truth reused as API validation, LLM output schema, and web types.
- The core owns the *port* (`LLMProvider` interface); the caller passes whatever implements it.

## 3. Ports & adapters (CRITICAL)

- Every external capability is an **interface** in `vendor/shared/adapters.ts`
  (`LLMProvider` `adapters.ts:82`, plus `Embedder`, `GitHubClient`, `GitClient`, `CodeIndex`,
  `AuthProvider`, `SecretsProvider`). Header: *"ALL external calls go behind these interfaces… Services depend on the interface, not the impl."*
- Services depend on the **interface**, never a concrete adapter class. Concretes live in `adapters/*`.
- The container injects the concrete; tests swap a mock via `ContainerOverrides` (`container.ts:40`).
- Adding an external dependency = add a port interface first, then an adapter under `adapters/`, then wire it in the container. Not a direct import in a service.

## 4. Repository is the only DB layer (CRITICAL)

- `drizzle-orm` and `db/schema` imports are allowed **only** in `repository.ts`.
  A module's `repository.ts` header states it is *"the ONLY layer touching the DB"* for that aggregate.
- NEVER import `drizzle-orm` / `db/schema` in `routes.ts`, `service.ts`, or `helpers.ts`.
- Known leaks to FIX, not copy: `settings/routes.ts:3`, `workspace/routes.ts:2`,
  `polling/routes.ts:3`, `pulls/routes.ts:3` query Drizzle straight from the route; some domain
  helpers (`reviews/diff-loader.ts`, `reviews/run-executor.ts`, `repos/helpers.ts`,
  `settings/feature-models.ts`) reach into `db/schema` directly. New code introduces a
  `repository.ts` instead. (`agents/` is the clean template.)

## 5. Transport is thin (HIGH)

- `routes.ts` = a Fastify plugin that: opts into the type provider (`app.withTypeProvider<ZodTypeProvider>()`,
  `agents/routes.ts:71`), validates with shared Zod contracts (one def drives request validation
  AND response serialization — don't hand-write schemas), resolves tenancy via
  `getContext(container, req)`, then delegates to a service (`new AgentsService(app.container)`, `routes.ts:72`).
- No business rules, no DB, no adapter calls in a route handler. If a route branches on domain logic, that logic belongs in the service.

## 6. Composition root (HIGH)

- All wiring lives in `platform/container.ts` — one `Container` per app instance, decorated onto
  Fastify in `app.ts` and reachable as `app.container` / `req` context.
- Adapters are lazily constructed there, resolving secrets; shared repos (`agentsRepo`, `reviewRepo`)
  and the `repoIntel` facade are constructed here too so modules don't reach into each other's folders.
- Modules register via the **static registry** in `modules/index.ts` (a `Record<string, FastifyPluginAsync>`
  looped in `app.ts`), NOT `@fastify/autoload` — deliberate, for tsx/bundler/vitest portability.
- A service takes a `Container` and pulls `container.db` / `container.<adapter>`; it never `new`s an adapter.

## 7. Cross-module access via facades (HIGH)

- Consume another module ONLY through its service facade, never its tables. Canonical example:
  `repo-intel` — all features read facts through `container.repoIntel` (`RepoIntelService`,
  wired `container.ts:114`), never by querying `symbols` / `references` / `file_edges` / `file_rank`.
- The facade returns degraded/empty results rather than throwing when data is absent.
- A module owns its tables; another module wanting that data calls the owner's service, or the
  shared repo constructed in the container — it does not import the owner's `repository.ts`.

## 8. Module file shape (MEDIUM)

Canonical layout per `modules/<name>/`:

- `routes.ts` — transport (§5)
- `service.ts` — application logic; takes the `Container`
- `repository.ts` — the only DB layer (§4); split into a `repository/` subfolder for large aggregates (see `reviews/repository/`)
- `helpers.ts` — pure DTO mappers (`toAgentDto`) — no DB, no I/O
- `constants.ts` — literals/config for the module

A read-only module may legitimately skip `service`/`repository` — but the moment it touches the DB,
that access goes in a `repository.ts`, not the route.

## 9. Enforce mechanically (HIGH)

Layering is enforced by tooling, not review. See [references/enforcement.md](references/enforcement.md)
for the proposed `dependency-cruiser` rules (`no-drizzle-outside-repository`,
`no-adapter-concrete-in-service`, `domain-core-no-infra`) and the `eslint-plugin-boundaries`
flat-config. `dependency-cruiser` is already installed. Wire the arch rule into `pnpm lint` / CI so
a violation fails the build the way a type error does.

## Sources

Full curated, grouped source list → [references/sources.md](references/sources.md).
