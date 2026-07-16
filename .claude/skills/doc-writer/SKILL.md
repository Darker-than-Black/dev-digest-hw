---
name: doc-writer
description: "Turn an implementation plan, a functionality description, an input prompt, or Zod schemas into documentation — AND route each doc to the right place in this repo. Use when the user says 'document this feature', 'write docs for', 'turn this plan into documentation', 'generate docs from this schema', 'describe how X works', or 'where should this doc go'. Picks the doc type (how-to / reference / spec / overview) by what the reader needs, writes it grounded in the actual code (never invents APIs), and places it per the repo's doc-routing table. Never writes to insights.md (owned by engineering-insights) or wholesale to AGENTS.md."
---

# Doc-Writer — describe functionality and route docs correctly

Takes input data — an implementation plan, a functionality description, an input prompt, and/or Zod
schemas — and produces accurate documentation, then writes it to the **right location** in this
repo. Two decisions drive everything: **which doc type** (by reader need) and **which destination**
(by scope). The full routing table is in `references/doc-map.md`.

## Step 1 — pick the doc type (by reader need)

| Reader need | Doc type | Shape |
|-------------|----------|-------|
| "help me *do* a task" | **how-to** | task-oriented steps, competent-user assumed |
| "give me the *facts*" (fields, routes, types) | **reference** | complete, accurate, no narrative |
| "what will we *build* and why" | **spec** | decisions + numbered steps with `file:line` |
| "help me *understand* the system" | **overview** | orientation + a diagram |

## Step 2 — route to the destination (scope-driven, see references/doc-map.md)

| Input you got | Destination |
|---------------|-------------|
| implementation plan for a not-yet-built feature/lesson | `<pkg>/specs/<feature>.md` (package that owns most of the work) |
| functionality description / "how do I use X" | `<pkg>/docs/<topic>.md` |
| Zod schema / contract → reference | prefer `.describe()` on the schema in place; standalone doc only if asked → `<pkg>/docs/<name>.md` |
| architecture/data-flow spanning packages | root `README.md` (or a package `README.md`); diagram via `mermaid-diagram` skill |
| cross-cutting topic not owned by one package | root `docs/<topic>/` (new subfolder) |
| repo-map / conventions edit | **propose a line change to `AGENTS.md`** — never regenerate it |
| session lessons / gotchas | **not this skill** — `insights.md` is owned by `engineering-insights` |

Routing is **scope-driven, not convenience-driven**: package-scoped docs never go in root `docs/`,
cross-cutting docs never go inside one package's `docs/`.

## Step 3 — write it, grounded in code

- **Read the actual code/schema before writing.** Cite `file:line` for every behavioural claim.
  Verify claimed behaviour against the real implementation — a description or plan is raw material,
  not ground truth.
- **Match the in-repo template** for the doc type: spec header shape from `client/specs/*.md`
  (`# Spec: <title>` → blockquote `Status: … · Scope: …` → `## Context` → numbered `## Step N` with
  real `file:line` refs); overview shape from `server/README.md` (overview + mermaid); how-to
  task-oriented per `docs/agent-prompts/README.md` style.
- **State the doc's authority relationship** when it can drift (e.g. "the DB/schema is the source of
  truth at runtime; this file is the reviewable copy", mirroring `docs/agent-prompts/README.md`).
- **Use the `mermaid-diagram` skill** for any flow, request/response sequence, state machine, or
  data model — don't hand-roll mermaid, and keep each diagram under ~20 nodes.

## Hard rules

- **Never invent** API fields, routes, enums, defaults, or behaviour not present in the
  schema/code/plan you were given. Generate a schema reference strictly from the schema's real shape.
- **Never write to `insights.md`** — that file is exclusively the `engineering-insights` skill's.
- **Never regenerate `AGENTS.md`** wholesale — it's a hand-curated terse repo-map; at most propose a
  specific line edit.
- **Don't duplicate a Zod schema in prose** when the schema is the source of truth — reference it.
- **Don't fill an empty `docs/`/`specs/` placeholder** with boilerplate just because it exists —
  write only when there's real content.
- If the input doesn't specify enough to place or write the doc accurately, **ask** (or flag the gap)
  rather than guessing a path or inventing content.
