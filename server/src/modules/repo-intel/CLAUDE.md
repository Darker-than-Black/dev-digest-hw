# repo-intel — codebase indexer

Reads a cloned repo **once on clone** (incrementally on fetch, keyed by file
content hash) → queryable facts: symbols, import graph, PageRank file importance,
compact **repo map**. On review it's **read-only** — index already computed, so
prompt context costs no analysis at request time. Pipeline diagram → [./README.md](./README.md)

## Layout
- `pipeline/` — `walk.ts` (discover files) · `full.ts`/`incremental.ts` (index modes) · `rank.ts` (PageRank + git hotness) · `repo-map.ts` (cached skeleton)
- `service.ts` — the `repoIntel.*` **facade** (the only public surface) · `routes.ts` · `repository.ts` (DB) · `types.ts` · `constants.ts`
- Tables: `symbols` `references` `file_edges` `file_rank` `repo_map_cache`

## Conventions / do-not-touch
- This is **starter infrastructure** — you don't rewrite it. Lessons build *on top* by calling `repoIntel.*` (Blast L04, Conventions L02, Onboarding L05, Phantom gate L06), **never** by re-indexing.
- Consume facts only through the `service.ts` facade — don't query its tables directly from other modules.
- Unindexed/partially-indexed repo must **degrade gracefully** (facade returns empty, never throws). Preserve this.
- Symbols/refs come from the **ast-grep adapter**, edges from dependency-cruiser — both injected adapters, not direct imports.

## Read when…
- server-wide conventions / DI → [../../../CLAUDE.md](../../../CLAUDE.md) (server)
- past pitfalls / indexer lessons → [./insights.md](./insights.md)
- session protocol → **before** work read `insights.md` (treat as high-confidence guidance); **at task end** run `engineering-insights` to append what was learned — don't skip
