# @devdigest/reviewer-core — review engine

Pure logic: **diff → prompt → LLM → grounded findings**. No DB/GitHub/fs; only
side effect = LLM call through an **injected** `LLMProvider` (makes it mock-testable).
Pipeline diagram → [./README.md](./README.md)

## Layout (src/)
- `prompt.ts` — `assemblePrompt()` (diff · system prompt · repo map) + `wrapUntrusted()`/injection guard
- `llm/` — `openrouter.ts` (provider) · `structured.ts` (Zod→JSON Schema, parse-with-repair)
- `review/` — `run.ts` (orchestrate) · `reduce.ts`
- `grounding.ts` — mechanical citation gate vs the diff (drops hallucinated line refs)
- `output/to-review.ts` · `index.ts` (public surface)

## Conventions (non-default)
- Never import DB/GitHub/fs here — keep it pure. LLM access only via injected `LLMProvider`.
- Untrusted content (diff, repo map) MUST go through `wrapUntrusted()` + INJECTION_GUARD before the prompt.
- Every finding passes the **grounding gate** — un-grounded line refs are dropped, not fixed.
- Package emits **no JS**: `build` is a type-check. Server consumes the TS **source** via tsconfig alias (`@devdigest/reviewer-core` → `../reviewer-core/src`).

## Commands
- build/typecheck `pnpm build` · test `pnpm test` (vitest, LLM mocked)

## Read when…
- who calls this / wiring → [../server/CLAUDE.md](../server/CLAUDE.md)
- how-to guides → [./docs/](./docs/) · feature/lesson specs → [./specs/](./specs/)
- past pitfalls / module lessons → [./insights.md](./insights.md)
