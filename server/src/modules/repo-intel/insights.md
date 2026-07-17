# repo-intel — insights

Non-obvious lessons, gotchas, and pitfalls learned while working in **repo-intel**.
One entry per lesson. This is the "what bit us" log — keep CLAUDE.md a map and
put the *why it bit us* here.

> Format: `### <short title>` + what happened + the rule that prevents a repeat.
> Append-only — add entries, never overwrite. Maintained by the `engineering-insights` skill.
> Link related modules with relative paths.

## What Works

## What Doesn't Work

### `getBlastRadius`'s ripgrep fallback ALWAYS tags `reason:'no_data'` — even on a successful scan
`RepoIntelService.getBlastRadius`'s non-persistent path (`repoIntelEnabled` off, or `tryPersistentBlast`
returns `null`) unconditionally sets `degraded: true, reason: 'no_data'` on its return, REGARDLESS of
whether the ripgrep/clone scan actually found real symbols/callers/endpoints. A caller that needs to
distinguish "truly no data source" from "no persistent index, but the fallback found something real"
cannot key off `reason` — check `changedSymbols.length`/`callers.length`/`impactedEndpoints.length`
instead. Bit `modules/blast/service.ts`'s `unavailable` vs `degraded` status split (2026-07-17).

## Codebase Patterns

### Uncapping a facade array for a downstream per-group total: replace the cap with a generous SAFETY cap + degraded/reason, don't just remove it
`tryPersistentBlast` used to `.slice(0, MAX_CALLERS_PER_SYMBOL)` its caller list GLOBALLY before
returning, which silently destroyed per-symbol totals for any consumer that needed them (blast's
`callers_total`/`callers_truncated`). Fix pattern: remove the per-consumer cap from the facade
entirely (return everything, rank-sorted) so the caller can compute its OWN true per-group totals
and cap — but still guard the facade with a much larger, purely defensive safety cap (`MAX_CALLERS_
GLOBAL_SAFETY_CAP = 500` vs the old per-symbol 20) that only fires on a pathological result, and
flag it (`degraded: true, reason: 'callers_capped'`) rather than truncating silently. Apply this
shape any time you're tempted to remove a facade-level cap "because the caller needs the real
numbers" — the caller needs the numbers, not an unbounded response.

### BFS reachability: one `Map<file, depth>` IS the visited-set — first assignment = min depth for free
`getReachableEndpointRefs` (mirrors `getReachableEndpoints`'s reverse-import BFS) tracks hop depth in
a single `Map<file, number>` seeded with the changed files at depth 0. Because BFS processes the
frontier in strictly increasing hop order and the map's `.has()` check gates every visit (`if
(depthByFile.has(dep)) continue`), the FIRST time a file is added is guaranteed to be its minimum
depth — no separate visited `Set` needed, and cycles terminate automatically (a file reachable via a
longer path back to itself is already in the map and skipped). Reuse this exact shape for any future
"reachable-from, with min distance" facade read instead of a `Set` + separate depth map.

### `repo-intel` internal constants (e.g. `SUPPORTED_EXT`) are fine to import from a consuming module
`modules/blast/service.ts` imports `SUPPORTED_EXT` straight from `repo-intel/constants.ts` (not
through the facade) to classify which changed files "should" have a `file_rank` row for its
`missing_files` computation. This is NOT a layering violation — constants files hold no DB/fs
access, unlike `repository.ts`/`service.ts` internals — only the facade (`service.ts`'s public
methods) and DB (`repository.ts`) are off-limits to other modules.

Confirmed again 2026-07-17: `isJunkPath`/`JUNK_PATH_PATTERNS` were a PRIVATE (unexported) helper at
the bottom of `service.ts`, used only by `getTopFilesByRank`. Moved them to `constants.ts` (plain
export, zero behavior change) so `blast/helpers.ts` could filter test/mock-file endpoints/crons out
of the blast-radius response using the EXACT SAME junk definition, instead of copy-pasting the
pattern list and risking drift. When a consumer needs a repo-intel-internal PURE predicate/constant
that happens to live inside `service.ts` rather than `constants.ts`, relocate-and-export it (additive,
no pipeline/schema touch) rather than duplicating — same rule as the `SUPPORTED_EXT` case above, just
one step earlier (the thing wasn't exported yet at all).

### `getConventionSamples` returns PATHS only — and silently drops configs/tests
`getConventionSamples(repoId, n)` → `getTopFilesByRank`, which excludes configs, tests
and migrations via `isJunkPath`. So a "sample the repo" caller gets ranked SOURCE paths
only — no eslint/tsconfig/prettier, and no file CONTENT. To read content, use
`readFiles(repoId, paths)` (added 2026-07-09, wraps the private `readClone()`; returns
`{path, content: null}` — never throws — when the clone is absent or repo-intel disabled).
To include configs, gather them explicitly by filename at the clone root before calling.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
