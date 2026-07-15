# @devdigest/reviewer-core — insights

Non-obvious lessons, gotchas, and pitfalls learned while working in **@devdigest/reviewer-core**.
One entry per lesson. This is the "what bit us" log — keep CLAUDE.md a map and
put the *why it bit us* here.

> Format: `### <short title>` + what happened + the rule that prevents a repeat.
> Append-only — add entries, never overwrite. Maintained by the `engineering-insights` skill.
> Link related modules with relative paths.

## What Works

### Pure "metadata-only" LLM call: wrap EACH author-controlled segment separately, not the whole message
`intent.ts`'s `deriveIntent()` builds its user message from title/body/issueSpec/fileList and
wraps each one individually via `wrapUntrusted(tag, text)` (e.g. `wrapUntrusted('title', …)`,
`wrapUntrusted('pr-description', …)`) rather than wrapping the assembled message once — keeps
the injection-guard's per-source tags meaningful and lets a future prompt inspector tell which
untrusted block a flagged instruction came from. Reuse this shape for any new pure, non-diff LLM
call that must stay onion-clean (no fs/db/octokit/git — only the injected `LLMProvider`).

## What Doesn't Work

## Codebase Patterns

### New optional prompt section = trusted instruction OUTSIDE `wrapUntrusted`, derived text INSIDE
Adding a `PromptParts` slot fed by non-diff, LLM-derived or author-controlled data (e.g. the
Intent layer's `## Review scope`) follows one shape: write the static instruction sentence as
plain trusted text (it's yours, not the author's), then call `wrapUntrusted(tag, dataText)` ONCE
for the actual derived/author content — never wrap the instruction, never leave the data
unwrapped. Gate the whole section behind `parts.X && parts.X.trim().length > 0` so omitting the
field leaves the prompt byte-identical to before the feature existed. See `prompt.ts` around
`parts.intent`.

## Tool & Library Notes

## Recurring Errors & Fixes

### `pnpm build`/`pnpm typecheck` fails with `ERR_PNPM_IGNORED_BUILDS` in a fresh sandbox — and writes stray pnpm files into an npm-managed package
`reviewer-core` is npm-managed (`package-lock.json` is the real lockfile; `build`/`typecheck` =
`tsc --noEmit -p tsconfig.json`, no bundling). Running `pnpm build`/`pnpm typecheck` here in a
freshly-sandboxed shell triggers pnpm's postinstall-script consent gate (`Ignored build scripts:
esbuild@…`) and fails with exit 1 BEFORE `tsc` ever runs — a pre-existing environment quirk,
unrelated to any code change. It also silently writes a stray `pnpm-lock.yaml` +
`pnpm-workspace.yaml` into `reviewer-core/`. Do NOT run `pnpm approve-builds` (an unrequested,
persistent global consent decision) to work around it. Instead run the underlying command
directly — `./node_modules/.bin/tsc --noEmit -p tsconfig.json` (identical to what the `build`/
`typecheck` scripts invoke) — and `rm -f pnpm-lock.yaml pnpm-workspace.yaml` afterward if pnpm
created them.

## Session Notes

### 2026-07-15 — Intent layer engine pieces: `deriveIntent()` + `PromptParts.intent`
New pure `src/intent.ts` (`deriveIntent`, `DeriveIntentInput`/`DeriveIntentOutcome`, exported
from `index.ts`): a cheap, metadata-only classifier call (title/body/issueSpec/headers-only
fileList — NO diff bodies) producing `Intent{intent,in_scope,out_of_scope}` via
`llm.completeStructured<Intent>`. `prompt.ts` gained an optional `intent` slot rendering
`## Review scope` (trusted instruction + `wrapUntrusted`-ed intent text) between
`## PR description` and the diff, gated on non-empty so omitting it leaves the prompt unchanged;
`review/run.ts`'s `ReviewInput` threads `intent?: string` straight into `promptParts`, no LLM
call-site change. Callers (the server-side derivation service + auto-compute wiring) →
[../server/insights.md](../server/insights.md).

## Open Questions

### `deriveIntent` prompt/parity has no automated test yet
Tests were explicitly deferred (user request) for this pass. When added: (a) mock-LLM test that
`deriveIntent` returns the parsed `Intent` + stats and that `intent.ts` has zero fs/db/octokit/git
imports; (b) `assemblePrompt` parity test — omitted `intent` ⇒ byte-identical output to before the
field existed; present ⇒ `## Review scope` appears with the instruction line outside
`<untrusted>` and the intent text inside.
