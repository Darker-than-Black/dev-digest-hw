# Blast Radius — Implementation Plan

## Context

Reviewers' first question on any PR is "what can these changes break?" — invisible
in a raw diff. The **Blast Radius** feature answers it by reading the
**already-built `repo-intel` index** (built at clone time) and rendering a layered
map: **changed symbols → downstream callers → affected HTTP endpoints / crons**.
It does essentially no review-time analysis and spends **zero tokens by default**
(one optional cheap-model paragraph is opt-in).

The critical repo fact that reshapes the task: the three-step blast algorithm the
brief describes **already exists inside the `repo-intel` facade** —
`RepoIntelService.getBlastRadius(repoId, changedFiles)`
(`server/src/modules/repo-intel/service.ts:220`, persistent path `:315-391`) does
exactly:

- **Step 1** — symbols declared in the changed files.
- **Step 2** — resolved cross-file callers, excluding the decl file, capped at
  `MAX_CALLERS_PER_SYMBOL = 20` (`constants.ts:30`), sorted by file rank.
- **Step 3** — endpoints/crons via `file_facts` / `extractEndpoints`.

The repo-intel `AGENTS.md` is explicit: **"Consume facts only through the
`service.ts` facade — don't query its tables directly… Lessons build on top by
calling `repoIntel.*`, never by re-indexing."**

So the correct build is a **thin `blast/` module that consumes the facade** (never
re-implements Step 1/2/3, never touches repo-intel tables, never writes the index)
and shapes the facade output into an HTTP contract + a new client tab. This
mirrors the existing `smart-diff` module exactly.

## Affected packages & files

**Shared (`@devdigest/shared`)**
- `server/src/vendor/shared/contracts/blast.ts` — **NEW.** Zod contract
  `BlastResponse` (index badge + layered symbols→callers→endpoints/crons +
  counts + optional explanation). Reuses `ChangedSymbol` from
  `contracts/brief.ts:17`.
- `server/src/vendor/shared/index.ts:23` — add `export * from './contracts/blast.js';`
  (barrel is extend-only per its header, `:15`).
- `server/src/vendor/shared/contracts/platform.ts:14` + `:43` — **only if** the
  optional LLM explanation is built: add a `blast_explain` id to the
  `FeatureModelId` enum and a `FEATURE_MODELS` entry (additive; this registry is
  designed to grow per lesson).

**Back-end (`@devdigest/api`)**
- `server/src/modules/blast/routes.ts` — **NEW.** `GET /pulls/:id/blast`
  (+ opt-in `?explain=true`). Mirrors `server/src/modules/smart-diff/routes.ts:18`.
- `server/src/modules/blast/service.ts` — **NEW.** `BlastService` — workspace gate
  + facade calls + optional LLM. Mirrors `smart-diff/service.ts:18`.
- `server/src/modules/blast/helpers.ts` — **NEW.** Pure mapping of facade
  `BlastResult` + `IndexState` → `BlastResponse` (grouping callers by `viaSymbol`,
  attributing endpoints/crons per symbol via `factsByFile`).
- `server/src/modules/blast/helpers.test.ts` — **NEW.** Hermetic unit test of the
  mapping (full + degraded shapes).
- `server/src/modules/index.ts:28` — register the new `blast` plugin (one import +
  one entry).

**Front-end (`@devdigest/web`)**
- `client/src/lib/hooks/blast.ts` — **NEW.** `useBlast(prId, { explain })`. Mirrors
  `useSmartDiff` (`client/src/lib/hooks/reviews.ts:64`).
- `client/src/lib/hooks/index.ts:9` — export the new hook file.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:114`
  — add a `{ key: "blast", label: …, icon: … }` tab to the `Tabs` array.
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:151` — render
  `<BlastTab … />` when `tab === "blast"`.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastTab/*` — **NEW.**
  `BlastTab.tsx` + `styles.ts` + sub-components (index badge, expandable symbol
  rows, endpoint/cron chips) + `BlastTab.test.tsx`.
- `client/messages/en/blast.json` — **already scaffolded** (`stat.*`,
  `view.tree/graph`, `callerCount`, `noDownstream`, `graph.*`); extend with keys
  for the index badge, endpoint/cron chips, and the Explain button.

## Work items

### Item 1 — Shared `BlastResponse` contract

- **Side:** shared
- **Files:** `server/src/vendor/shared/contracts/blast.ts`,
  `server/src/vendor/shared/index.ts`
- **Skills to load:** `zod` (+ `typescript-expert` if inference gets tricky)
- **Reuse:** `ChangedSymbol` (`contracts/brief.ts:17`); shape the badge fields off
  `IndexState` (`repo-intel/types.ts:42`) and `BlastResult` (`:74`). Do **not**
  edit `brief.ts` (stable contract per `index.ts:15`) — import from it.
- **Steps:**
  1. Define `BlastIndexBadge`: `status` (`z.enum(['full','partial','degraded','failed'])`),
     `degraded: z.boolean()`, `reason: z.string().nullish()`,
     `files_indexed`/`files_skipped` (`z.number().int()`),
     `last_indexed_sha: z.string()`, `updated_at: z.string().nullish()` (ISO).
  2. Define `BlastCallerRef`:
     `{ symbol: z.string(), file: z.string(), line: z.number().int(), rank: z.number() }`
     (rank = file-rank percentile; 0 on the degraded path).
  3. Define `BlastSymbolImpact`:
     `{ symbol: ChangedSymbol, callers: z.array(BlastCallerRef), endpoints: z.array(z.string()), crons: z.array(z.string()) }`.
  4. Define `BlastResponse`:
     `{ index: BlastIndexBadge, changed_symbols: z.array(ChangedSymbol), impacts: z.array(BlastSymbolImpact), endpoints: z.array(z.string()), crons: z.array(z.string()), counts: z.object({ symbols, callers, endpoints, crons }) [int fields], explanation: z.string().nullish() }`
     — the flat `endpoints`/`crons` feed the mockup's chip row + `counts` feeds
     "2 symbols · 14 callers · 3 endpoints · 1 cron".
  5. Export inferred types; add the barrel line. **Do not** add "Prior PRs
     touching these files" to this contract — flag as a separate stretch (see
     Risks).

### Item 2 — `blast/` back-end module (route + service + mapping)

- **Side:** back-end
- **Files:** `server/src/modules/blast/{routes,service,helpers,helpers.test}.ts`,
  `server/src/modules/index.ts`
- **Skills to load:** `onion-architecture`, `fastify-best-practices`, `security`,
  `zod`. (**Not** `drizzle-orm-patterns`/`postgresql-table-design` — this module
  adds no schema and does no direct DB access.)
- **Reuse:**
  - `smart-diff/service.ts:18` as the service template (constructor
    `(container)`, instantiated inline in `routes.ts`, single consumer — not
    registered on the container).
  - Facade: `container.repoIntel.getBlastRadius(repoId, changedFiles)`
    (`service.ts:220`) and `container.repoIntel.getIndexState(repoId)` (`:189`) —
    via the `container.repoIntel` getter (`platform/container.ts:118`).
  - `container.reviewRepo.getPull(workspaceId, prId)`
    (`reviews/repository/pull.repo.ts:9`), `.getPrFiles(prId)`
    (`reviews/repository.ts:38`), `.getRepo(repoId)` (`:34`).
  - `getContext` (`modules/_shared/context.ts:14`), `IdParams`
    (`modules/_shared/schemas.ts:11`), `NotFoundError` (`platform/errors.js`).
  - Optional LLM: `resolveFeatureModel` (`settings/feature-models.ts:51`) +
    `container.llm(provider)` (`container.ts:179`), following
    `intent/service.ts:56-79`.
- **Steps:**
  1. **Route** (`routes.ts`): `app.get('/pulls/:id/blast', { schema: { params: IdParams } }, …)`
     → `getContext` → `service.getBlast(workspaceId, req.params.id, { explain: req.query.explain === 'true' })`.
     Return type `BlastResponse`. Follow smart-diff's choice to rely on the typed
     return; optionally also attach `response: { 200: BlastResponse }` for
     serialization safety (fastify-type-provider-zod). Validate/whitelist the
     `explain` query flag.
  2. **Service `getBlast`** (`service.ts`): call
     `container.reviewRepo.getPull(workspaceId, prId)` **first** and throw
     `NotFoundError` if missing — this is the ONLY workspace gate; `getPrFiles`
     is unscoped, so the order matters (copy the security comment from
     `smart-diff/service.ts:24-28`). Then `getPrFiles(prId)` →
     `changedFiles = files.map(f => f.path)`; `getBlastRadius(pull.repoId, changedFiles)`
     and `getIndexState(pull.repoId)` (can run concurrently). Pass both to the
     pure mapper.
  3. **Mapper** (`helpers.ts`):
     - Badge ← `IndexState` (map `status`, `degraded ?? false`,
       `degradedReason ?? reason`, counts, sha, `updatedAt.toISOString()`).
     - `changed_symbols` ← `result.changedSymbols`.
     - Group `result.callers` (flat rows `{ file, symbol, viaSymbol, line, rank }`)
       by `viaSymbol` → one `BlastSymbolImpact` per changed symbol; keep the
       facade's rank order.
     - Per-symbol `endpoints`/`crons`: when `result.factsByFile` is present
       (persistent/non-degraded path), union the facts of that symbol's caller
       files; on the degraded path `factsByFile` is absent — leave per-symbol
       endpoints empty and populate only the top-level flat `endpoints` from
       `result.impactedEndpoints`. Document this asymmetry inline.
     - Flat `endpoints` ← `result.impactedEndpoints`; flat `crons` ← union of
       `factsByFile` crons (empty on degraded path). Compute `counts`.
  4. **Optional explanation:** only when `explain` is true AND `!badge.degraded`
     AND there is data; resolve `blast_explain` feature model, call
     `container.llm(provider)` with a compact prompt built from the map, wrap in
     `try/catch` → `explanation: null` on any failure (never fail the read). Skip
     entirely otherwise so the default path spends zero tokens.
  5. Register `blast` in `modules/index.ts`.
  6. **Test** (`helpers.test.ts`): feed a synthetic persistent `BlastResult` (with
     `factsByFile`) and a degraded one; assert grouping-by-`viaSymbol`, per-symbol
     endpoint attribution, flat unions, counts, and the badge mapping.

### Item 3 — Blast tab (client)

- **Side:** front-end
- **Files:** `client/src/lib/hooks/blast.ts`, `client/src/lib/hooks/index.ts`,
  `PrDetailHeader.tsx`, `page.tsx`, `_components/BlastTab/*`,
  `client/messages/en/blast.json`
- **Skills to load:** `ui-architecture`, `react-best-practices`,
  `next-best-practices`, `react-testing-library`
- **Reuse:**
  - Hook pattern: `useSmartDiff` (`lib/hooks/reviews.ts:64`) —
    `useQuery(['blast', prId, explain], () => api.get<BlastResponse>(…), { enabled: !!prId })`.
    Import `BlastResponse` from `@devdigest/shared` (unlike repo-intel's local
    type, this IS a shared contract).
  - Tab wiring: `PrDetailHeader.tsx:111-120` `Tabs` array; `page.tsx:60-76`
    (`setParams`/`setTab`, `?tab=blast`) and the `{tab === … && <…Tab/>}` blocks
    (`:151-190`).
  - Card/badge/empty-state pattern: `IntentCard.tsx:93-118` (loading / data /
    unavailable branches) and `OverviewTab.tsx`. Primitives `Card`,
    `SectionLabel`, `Badge`, `Icon`, `IconBtn` from `@devdigest/ui`.
  - Deep-links: `githubBlobUrl(repoFullName, headSha, file, line)`
    (`lib/github-urls.ts:24`) for caller navigation (callers usually live
    **outside** the PR diff, so the in-app Files-changed tab can't show them —
    link to GitHub blob at the head sha). Changed symbols that are in the diff can
    link to the Files-changed tab via `setParams({ tab: 'diff', … })`.
  - i18n: the scaffolded `messages/en/blast.json` already has `stat.*`,
    `view.tree/graph`, `callerCount`, `noDownstream`, `graph.*` — reuse them; add
    keys for the index badge, endpoint/cron chip labels, and the Explain button.
    No hardcoded copy.
- **Steps:**
  1. Add the `blast` hook and barrel export.
  2. Add the `blast` tab to `PrDetailHeader` (choose an icon such as
     `Radio`/`Activity`/`Zap`; count = `counts.symbols` when loaded).
  3. In `page.tsx`, render
     `<BlastTab prId={prId} repoFullName={repoFullName} headSha={pr.head_sha} />`
     under `tab === "blast"`.
  4. Build `BlastTab`: top row of stat chips (`counts`), the **index badge**
     (render `partial`/`degraded` with the `reason` as an explanatory chip — never
     a blank screen; when `changed_symbols` is empty show the `noDownstream`
     string), a **Tree/Graph** toggle (Tree is required; Graph may render a simple
     placeholder reusing `graph.empty`/`graph.ariaLabel` — flag Graph as
     optional), expandable symbol rows listing callers as `file:line` linking out
     via `githubBlobUrl`, endpoint chips + cron chip. Add an opt-in **Explain**
     `IconBtn` (mirrors IntentCard's recompute) that re-runs the hook with
     `explain=true` and renders `explanation`.
  5. Add `BlastTab.test.tsx` (RTL + mocked fetch): degraded/partial badge renders
     with reason; populated response renders symbols→callers→endpoints and the
     counts.

## Risks & gotchas

- **Onion layering (critical if violated):** the `blast/` module must read **only**
  through `container.repoIntel` (facade) and `container.reviewRepo`. Do **not**
  import `repo-intel/repository.ts`, `drizzle-orm`, or `db/schema`, and do **not**
  re-implement Step 1/2/3 — the facade owns that (`service.ts:220`, `:315`). The
  optional LLM must go through the injected `container.llm` provider
  (reviewer-core / adapters stay the only LLM path). A route reaching into
  repo-intel tables or a domain module importing infra is a **BLOCK-push**
  violation per `docs/skill-map.md:47`.
- **No new migration / no-auto-migrate:** this feature adds **no** schema — it
  reuses `symbols`/`references`/`file_rank`/`file_facts`/`repo_index_state` via the
  facade. Do not add a migration. (If a future variant did add a table, remember
  the server does **not** migrate on boot — `cd server && pnpm db:migrate`; the
  symptom is `relation … does not exist`.)
- **Index missing / partial / degraded (core requirement):** on an unindexed or
  partially-indexed repo the facade **degrades, never throws** — `getBlastRadius`
  returns empty arrays + `degraded:true` and `getIndexState` synthesises a degraded
  row (`service.ts:189`). The tab must render the **badge + reason** (and the
  `noDownstream` copy), not a blank screen, and must skip the LLM call when
  degraded/empty so zero tokens are spent. Preserve this graceful-degradation
  contract (`repo-intel/AGENTS.md`).
- **Course-lesson context:** the `file_rank`/`file_facts`/`repo_index_state` tables
  are empty until a repo is indexed (the **Indexed** badge) — most starter DBs will
  hit the degraded path, so test that path first.
- **pr-self-review push gate:** adding a back-end route is an input boundary — load
  `security`, validate `:id` via `IdParams`, and keep the
  `getPull(workspaceId, …)`-before-`getPrFiles` order (reversing it leaks another
  workspace's file paths — critical). Run `pr-self-review` before any push; a
  critical finding blocks — satisfy it, don't bypass the hook.
- **Scope flag:** the mockup's "Prior PRs touching these files" section is **not**
  part of the stated feature goal (symbols/callers/endpoints) and needs
  `pr_files`/history data, not the index. Leave it out of `BlastResponse`; note it
  as a follow-up (could reuse `PrHistory` from `brief.ts:75`).
- **`?explain` cost:** keep it opt-in so the default tab load costs nothing; use the
  cheap default model (e.g. deepseek flash, matching `intent`) and cache via the
  query key.

## Verification

- **Typecheck/build:** `cd server && pnpm typecheck` and `cd client && pnpm typecheck`
  (shared contract must resolve on both sides via the barrel).
- **Server unit:** `cd server && pnpm exec vitest run modules/blast` — helpers
  mapping test (persistent + degraded) is hermetic (no DB).
- **Client unit:** `cd client && pnpm test` — `BlastTab.test.tsx` covers degraded
  badge + populated map (fetch mocked, no API/DB).
- **End-to-end (drive the flow):** `./scripts/dev.sh` → add a repo (wait for the
  **Indexed** badge) → import a PR → open the PR → **Blast** tab. Confirm: stat
  counts, expandable symbols → callers with working `file:line` GitHub links,
  endpoint chips + cron chip. Then open a PR on an **unindexed** repo and confirm
  the **partial/degraded badge + reason** renders (not an empty screen). Finally
  click **Explain** and confirm a one-paragraph summary appears and that no LLM
  call fires until clicked.
- **Contract spot-check:** `curl localhost:3001/pulls/<uuid>/blast` returns the
  layered JSON; `?explain=true` adds `explanation`.

## Key anchor files for the implementer

- `server/src/modules/repo-intel/service.ts`
- `server/src/modules/repo-intel/types.ts`
- `server/src/modules/smart-diff/{routes,service}.ts`
- `server/src/vendor/shared/contracts/brief.ts`
- `server/src/modules/index.ts`
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx`
- `client/src/lib/hooks/reviews.ts`
- `client/src/lib/github-urls.ts`
- `client/messages/en/blast.json`
