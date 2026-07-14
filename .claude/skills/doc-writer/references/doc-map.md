# Doc-Map — where every kind of doc lives in this repo

The routing table `doc-writer` uses to place documentation. Scope decides the destination; reader
need decides the doc type. Evidence paths are given so you can confirm the convention before writing.

## Destinations

### `<pkg>/docs/` — package-local how-to guides
- **What:** task-oriented guides for using or operating a feature that lives in one package
  (`server/`, `client/`, `reviewer-core/`).
- **Currently:** empty placeholders (`server/docs/.gitkeep`, `client/docs/.gitkeep`,
  `reviewer-core/docs/.gitkeep`) — you'll usually be the first content.
- **Evidence:** the identical "Read when…" block in each `AGENTS.md` — `server/AGENTS.md:27`,
  `client/AGENTS.md:25`, `reviewer-core/AGENTS.md:25` (`how-to guides → ./docs/`).

### `<pkg>/specs/` — package-local feature / lesson specs
- **What:** the decisions + steps for a not-yet-built (or just-built) feature or course-lesson item.
- **Template (the de-facto repo shape):** `# Spec: <title>` → blockquote `Status: … · Scope: …`
  (note which side the scope actually touches) → `## Context` → numbered `## Step N` sections with
  concrete `file:line` refs and code snippets.
- **Populated examples:** `client/specs/front-end-audit.md`, `client/specs/findings-by-severity.md`.
- **Placement across packages:** put it in the package that owns most of the work; note the
  cross-package touch in the `Scope:` line.

### root `README.md` / `<pkg>/README.md` — overview + architecture
- **What:** orientation for a newcomer; architecture/data-flow changes; anything needing a diagram.
- **Evidence:** `AGENTS.md:35` ("changing architecture / data flow → README.md (mermaid)"),
  `README.md` architecture section, `server/README.md` (overview + mermaid flowchart).
- Use the `mermaid-diagram` skill for the diagram.

### root `docs/<topic>/` — cross-cutting, topic-scoped bundles
- **What:** content that doesn't belong to a single package — agent-prompt conventions, a
  skill/experiment writeup, a cross-package reference.
- **Examples:** `docs/agent-prompts/` (canonical copies of reviewer system prompts),
  `docs/api-contract-reviewer/` (experiment writeup + the skills it tested), `docs/skill-map.md`
  (the file→skills routing table), `TESTING.md` (cross-cutting test/CI strategy).

### `AGENTS.md` (root or package) — NOT generated wholesale
- Terse, hand-curated repo-map / conventions. Never regenerate it; at most propose a specific line
  edit. Evidence: `AGENTS.md:1-38`, `server/AGENTS.md:1-29`.

### `insights.md` — NOT this skill
- Append-only lessons log, fixed 7 headings, **owned exclusively by the `engineering-insights`
  skill** — never write to it from doc-writer. Evidence: `reviewer-core/insights.md` ("Maintained by
  the `engineering-insights` skill"), `.claude/skills/engineering-insights/SKILL.md`.

## Input → doc handling

- **Plan → spec:** treat the plan as raw material. Output a `<pkg>/specs/<name>.md` matching the
  template exactly; pull real `file:line` citations from the plan — never invent paths.
- **Schema → reference:** prefer enriching the Zod schema with `.describe()` in place (repo
  convention: field meaning lives in the schema). Produce a standalone reference only when asked, and
  generate it strictly from the schema's actual fields/types/enums — add nothing not in the source.
  `@devdigest/shared` is the source of truth, so its reference lives with the server package.
- **Functionality description → how-to:** output `<pkg>/docs/<feature>.md`, task-oriented, but verify
  every claimed behaviour against the real implementation before writing it down.
- **Diagram detection:** any input describing a flow, sequence, state machine, or data model triggers
  the `mermaid-diagram` skill instead of prose.

## Diátaxis quick key (doc type by reader need)
- **tutorial** — learning, hand-held (rare here).
- **how-to** — a competent user achieving a real goal → `<pkg>/docs/`.
- **reference** — accurate, complete, interpretation-free facts → schema `.describe()` or `<pkg>/docs/`.
- **explanation / spec** — decisions and why → `<pkg>/specs/` or root `docs/<topic>/`.
