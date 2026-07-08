# Examples — Onion Architecture

Good/bad per SKILL.md section, using **real repo code**. ✅ = follow, ❌ = fix.

## 1. The dependency rule

```
transport (routes.ts) ──▶ application (service.ts) ──▶ domain (@devdigest/shared, reviewer-core)
                                     ▲
                        infrastructure (repository.ts, adapters/*) implements domain ports,
                        injected at platform/container.ts — never imported inward
```

❌ inner ring reaching outward — a domain/use-case file importing the DB:

```ts
// reviews/run-executor.ts (leak) — application code importing infrastructure
import * as t from '../../db/schema.js';
```

✅ inner ring depends on a port; infra is handed in:

```ts
// reviewer-core/src/review/run.ts:52 — domain owns the interface, caller supplies the impl
export interface ReviewInput {
  llm: LLMProvider;            // port, defined in @devdigest/shared
  // ...
}
const res = await input.llm.completeStructured<Review>({ /* ... */ }); // run.ts:174
```

## 2. Domain core stays pure

✅ `reviewer-core` — no DB/fs/network; only dep is the injected `LLMProvider`. I/O inputs arrive
as strings (`ReviewInput.skills/memory/specs`), never fetched inside the engine.

❌ never do this in `reviewer-core/src/**`:

```ts
import { readFileSync } from 'node:fs';        // ❌ breaks purity
import { db } from '../../server/src/db/client'; // ❌ engine must not know the DB exists
```

## 3. Ports & adapters

✅ define the capability as an interface, once, in the shared package:

```ts
// vendor/shared/adapters.ts:82
export interface LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter';
  listModels(): Promise<ModelInfo[]>;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}
```

✅ service depends on the interface via the container; the concrete is wired once:

```ts
// platform/container.ts — composition root picks the concrete adapter
this._embedder ??= new OpenAIEmbedder(/* ... */);   // concrete lives in adapters/*
// a service only ever sees `container.embedder` typed as the Embedder interface
```

❌ service importing a concrete adapter:

```ts
// modules/<x>/service.ts
import { OpenAIEmbedder } from '../../adapters/embedder/openai.js'; // ❌ import the port, inject the impl
```

## 4. Repository is the only DB layer

✅ `agents/` — the clean template. DB confined to `repository.ts`:

```ts
// modules/agents/repository.ts — the ONLY file importing drizzle for this aggregate
import { and, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
export class AgentsRepository { constructor(private db: Db) {} /* queries */ }

// modules/agents/service.ts — no drizzle import; goes through the repo
// modules/agents/routes.ts — no drizzle import; calls the service
```

❌ leaks to fix (Drizzle imported straight in the route — no repository at all):

```ts
// modules/settings/routes.ts:3   ❌
import { and, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
// also: workspace/routes.ts:2, polling/routes.ts:3, pulls/routes.ts:3
```

Fix: move the queries into a new `modules/settings/repository.ts`, have the route call a
`SettingsService` that owns the repo — mirror `agents/`.

## 5. Transport is thin

✅ route validates with a shared contract and delegates:

```ts
// modules/agents/routes.ts:70-75
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService(app.container);      // delegate to application layer
  app.get('/agents', async (req) => {
    const { workspaceId } = await getContext(app.container, req); // tenancy resolved via port
    return service.list(workspaceId);
  });
}
```

❌ business branching / DB in the handler → belongs in the service.

## 6. Composition root

✅ one container, adapters + shared repos + facades constructed here:

```ts
// platform/container.ts
get agentsRepo(): AgentsRepository { return (this._agentsRepo ??= new AgentsRepository(this.db)); }
get reviewRepo(): ReviewRepository { return (this._reviewRepo ??= new ReviewRepository(this.db)); }
get repoIntel(): RepoIntel {                         // facade, not raw tables (§7)
  if (this.overrides.repoIntel) return this.overrides.repoIntel; // tests inject a mock
  return (this._repoIntel ??= new RepoIntelService(this));
}
```

✅ registration is a static registry, not autoload:

```ts
// modules/index.ts → app.ts loops it: for (const plugin of Object.values(modules)) app.register(plugin)
```

## 7. Cross-module access via facades

✅ read repo-intel facts through the facade:

```ts
const map = await container.repoIntel.getRepoMap(repoId); // degrades gracefully if unindexed
```

❌ never query another module's tables directly:

```ts
import * as t from '../../db/schema.js';
await db.select().from(t.symbols); // ❌ go through container.repoIntel instead
```

## 8. Module file shape

```
modules/agents/
  routes.ts        transport
  service.ts       application (takes Container)
  repository.ts    infrastructure — only DB layer
  helpers.ts       pure DTO mappers (toAgentDto) — no I/O
  constants.ts     literals
```

Large aggregate → split the repo (see `reviews/repository/`: `pull.repo.ts`, `review.repo.ts`,
`run.repo.ts` composed by `reviews/repository.ts`).
