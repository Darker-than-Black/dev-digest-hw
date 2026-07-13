# repo-intel — insights

Non-obvious lessons, gotchas, and pitfalls learned while working in **repo-intel**.
One entry per lesson. This is the "what bit us" log — keep CLAUDE.md a map and
put the *why it bit us* here.

> Format: `### <short title>` + what happened + the rule that prevents a repeat.
> Append-only — add entries, never overwrite. Maintained by the `engineering-insights` skill.
> Link related modules with relative paths.

## What Works

## What Doesn't Work

## Codebase Patterns

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
