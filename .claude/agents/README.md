# DevDigest — Claude Code sub-agents

Custom sub-agents for this repo. Each is a Markdown file with YAML frontmatter in
`.claude/agents/`; Claude delegates to one based on its `description` (the delegation trigger).
Each runs in its **own fresh context window** — it sees only its system prompt (the file body),
the delegated task, `AGENTS.md`/`CLAUDE.md`, and any skills it loads at runtime.

## Agents at a glance

| Agent                                             | Model  | Role                                                            | Writes code?      | Tools                                            |
|---------------------------------------------------|--------|-----------------------------------------------------------------|-------------------|--------------------------------------------------|
| [`researcher`](researcher.md)                     | sonnet | Investigate a question (repo + web), propose a solution         | No (read-only)    | Read, Grep, Glob, LS, WebSearch, WebFetch        |
| [`planner`](planner.md)                           | opus   | Turn a task into a structured, file-scoped implementation plan  | No (read-only)    | Read, Grep, Glob, LS, Skill, WebSearch, WebFetch |
| [`implementer`](implementer.md)                   | sonnet | Orchestrate a plan → spawn FE + BE sub-implementers in parallel | No (coordinates)  | Read, Grep, Glob, Bash, Agent, TodoWrite         |
| [`frontend-implementer`](frontend-implementer.md) | sonnet | Build the `client/**` work items                                | Yes (`client/**`) | Read, Edit, Write, Grep, Glob, Bash, Skill       |
| [`backend-implementer`](backend-implementer.md)   | sonnet | Build the `server/**` + `reviewer-core/**` work items           | Yes (BE only)     | Read, Edit, Write, Grep, Glob, Bash, Skill       |
| [`test-writer`](test-writer.md)                   | sonnet | Write + run tests across `client/`, `server/`, `reviewer-core/` | Yes (tests only)  | Read, Edit, Write, Grep, Glob, Bash, Skill       |
| [`arch-reviewer`](arch-reviewer.md)               | sonnet | Architecture review vs the repo's arch skills                   | No (read-only)    | Read, Grep, Glob, Bash, Skill                    |

## Workflow — how they chain

```
task ──▶ researcher (optional: grounded facts / options)
     │
     ├─▶ planner ──▶ structured plan (Context · Work items · Risks · Verification)
     │                    │
     │                    ▼
     └─────────────▶ implementer (splits plan by side)
                          ├──▶ frontend-implementer  → client/**        ┐ run in
                          └──▶ backend-implementer    → server/, core/   ┘ parallel
                          │
                          ▼
                    reconcile shared contracts · typecheck/test · engineering-insights
                          │
                          ▼
                    pr-self-review gate (PreToolUse hook) ──▶ push / PR
```

**planner → implementer** is the documented plan-then-execute split: planner never writes code,
implementer never re-plans. The main thread hands the plan from one to the other (agents are two
independent top-level files, not nested), so the plan stays a reviewable artifact.

## Shared source of truth

All build/review agents route file → skills through one file: **`docs/skill-map.md`** (repo-root
relative). It holds the file-classification table and the front-end / back-end / shared skill map.
Three consumers read it so they never drift: `planner`, `implementer` (+ its two sub-implementers),
and the `pr-self-review` skill. Skills load **on demand at runtime** via the `Skill` tool — not
hard-bundled into frontmatter — so a pure-FE task never pulls back-end rules into context.

Skill sets (canonical list lives in `docs/skill-map.md`):
- **Front-end** (`client/**`): `ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`
- **Back-end** (`server/**` excl. `clones/**`, `reviewer-core/**`): `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`
- **Shared** (touched contracts/types/boundaries): `zod`, `typescript-expert`, `security`

---

## Specifications

### `researcher` (read-only)
**Purpose.** Answer a question by searching the project's code, the internet, or both, and propose
a concrete solution — with `file:line` evidence for repo claims and URLs for web claims.
**Behavior.** Interviews first if the question is under-specified (emits only numbered questions,
then stops). Reads the touched package's `insights.md` before investigating. Single-pass, targeted
— does not spawn sub-agents or run deep multi-round crawling. Never edits files; if asked to modify
code, it declines and reports the exact change needed. Fixed output sections: TL;DR · Sources ·
Project Findings · Internet Findings · Analysis & Proposed Solution · Not Found/Gaps · Interview.

### `planner` (read-only, highest leverage)
**Purpose.** Turn a feature/bug/change into a structured, project-aware, file-scoped implementation
plan the `implementer` consumes verbatim. **Writes no code.**
**Behavior.**
1. Absorbs context first — `AGENTS.md`, `README.md`, the touched package's `AGENTS.md` + `insights.md`.
2. Classifies each work item FE / BE / shared via `docs/skill-map.md`; names the exact skills the
   implementer must load per item.
3. May consult any skill in `docs/skill-map.md` itself (via `Skill`) to reason about placement /
   schema shape / security before naming it — loads only what a work item needs.
4. Flags risks: onion-layer violations (`reviewer-core` stays DB/IO-free), the no-auto-migrate
   gotcha, the `pr-self-review` push gate.
**Output sections:** Context · Affected packages & files · Work items (side, files, skills, reuse,
steps) · Risks & gotchas · Verification.

### `implementer` (orchestrator)
**Purpose.** Execute a plan from `planner`. **Does not re-plan; writes no feature code itself.**
**Behavior.** Tracks work with `TodoWrite`; buckets plan items into FE / BE via `docs/skill-map.md`;
spawns `frontend-implementer` and `backend-implementer` **in parallel** (one message, two `Agent`
calls), handing each only its side's items + the skills the plan named. On return: reconciles shared
contracts (`zod` / `*.schema.ts`) across the FE/BE boundary, runs per-package `typecheck`/`test`,
flags when `pnpm db:migrate` is needed, then runs `engineering-insights`. Never bypasses the
`pr-self-review` gate.

### `frontend-implementer` (specialist)
**Scope.** `client/**` (`@devdigest/web`) only — must not edit `server/**` or `reviewer-core/**`.
**Behavior.** Loads FE skills at runtime per `docs/skill-map.md` (+ shared trio when contracts/types/
input-boundaries are touched). Honors `client/AGENTS.md`: API access via `lib/api.ts`, i18n strings
in `messages/`, vendored UI in `src/vendor/ui`, read `insights.md` first, reuse before new. Runs
`pnpm -C client typecheck`/`test`; reports changed files + any shared contract it touched.

### `backend-implementer` (specialist)
**Scope.** `server/**` (excl. `clones/**`) + `reviewer-core/**` — must not edit `client/**`.
**Behavior.** Loads BE skills at runtime per `docs/skill-map.md` (+ shared trio; **always** `security`
on a route/input-boundary change). Enforces onion layering (module shape from `server/AGENTS.md`, no
Drizzle in routes, `reviewer-core` stays DB/GitHub/fs-free, LLM only via injected `LLMProvider`).
Handles the no-auto-migrate gotcha: runs `pnpm db:migrate` when schema/migrations change. Runs
`pnpm -C server typecheck`/`test` (+ `reviewer-core` if touched).

### `test-writer` (specialist)
**Scope.** Tests only, across all three packages (`client/**`, `server/**` excl. `clones/**`,
`reviewer-core/**`). **Never edits product code to make a test pass** — reports the mismatch instead.
**Behavior.** Loads the testing skills at runtime per `docs/skill-map.md` (`react-testing-library`
for UI; the BE set for API/engine; `zod` for fixtures). Encodes `TESTING.md`: typological-not-
exhaustive, behaviour-at-the-seams, hermetic mocks (`server/src/adapters/mocks.ts`), and the
load-bearing `*.it.test.ts` suffix for Postgres-backed server tests (migrate first, needs Docker).
Reads the touched package's `insights.md` first; runs the right per-package lane and reports
failures faithfully.

### `arch-reviewer` (read-only)
**Purpose.** On-demand deep architecture review of a diff, module, or branch — **complements**, does
not replace, the `pr-self-review` push gate. **Writes nothing** (no Edit/Write; Bash is read-only
inspection only).
**Behavior.** Classifies each changed file via `docs/skill-map.md`, loads `onion-architecture`
(BE) / `ui-architecture` (FE) at runtime, and reports evidence-cited (`file:line`) violations graded
on the shared critical/major/minor rubric. Requires a `file:line` for every finding, states what it
deliberately did not flag, and treats "no violations found" as a valid first-class result.

---

## Sources

Design of these agents is grounded in the following. Rules borrowed from a source are noted.

- **Claude Code — Create custom subagents** — https://code.claude.com/docs/en/sub-agents
  Frontmatter fields (`name`, `description`, `model`, `tools`, `color`); `description` as the
  delegation trigger; `tools` as an allowlist (read-only agents omit Edit/Write/Bash); fresh
  context window per subagent; the `Agent` tool for spawning nested subagents (depth ≤5, used by
  `implementer`); the plan-then-execute / chained-subagents pattern.
- **Anthropic — Skill authoring best practices** — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
  Progressive disclosure (load skills on demand, don't preload) — the reason skills are runtime-loaded
  via `Skill` rather than bundled into agent frontmatter.
- **Anthropic — Equipping agents for the real world with Agent Skills** — https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
  Three-layer skill model (discovery → load → navigate); skills compose with subagents.
- **Repo — `pr-self-review` skill** (`.claude/skills/pr-self-review/SKILL.md`)
  Origin of the file-classification + FE/BE/shared skill map, now factored into `docs/skill-map.md`
  and shared by planner/implementer.
- **Repo conventions** — `AGENTS.md`, per-package `AGENTS.md` (`client/`, `server/`, `reviewer-core/`),
  `researcher.md` (frontmatter/description style these agents mirror).
- **`TESTING.md` + `server/src/adapters/mocks.ts`** — the testing conventions `test-writer` encodes:
  typological-not-exhaustive coverage, hermetic mocks, the `*.it.test.ts` split, per-package run lanes.
- **Reviewing AI-Generated Tests: A Code-Review Checklist** — https://qaskills.sh/blog/reviewing-ai-generated-tests-checklist-2026
  Source of `test-writer`'s "a test must be able to fail" rules and the never-weaken-an-assertion /
  never-edit-product-code-to-pass guardrails.
- **Cloudflare — How we built our AI code-review system** — https://blog.cloudflare.com/ai-code-review/
  Source of `arch-reviewer`'s review discipline: evidence-cited findings, negative "what NOT to flag"
  instructions, a reasonableness filter, and "clean is a valid outcome".
- **Diátaxis** — https://diataxis.fr/
  Source of `doc-writer`'s doc-type-by-reader-need split (how-to / reference / spec / overview).

## Notes

- Editing an agent file takes effect on the **next session** (restart Claude Code or run `/agents`),
  not live in the current one.
- `docs/skill-map.md` is a plain reference doc (not a registered skill) — agents load it via an
  explicit `Read`, not auto-discovery.
