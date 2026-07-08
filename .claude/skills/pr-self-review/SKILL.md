---
name: pr-self-review
version: 1.0.0
description: "Local pre-flight self-review of the working diff BEFORE any push or PR. Trigger BEFORE running `git push`, `gh pr create`, `gh pr push`, opening/updating a GitHub PR, or when the user says 'review my changes', 'check before I push', 'self-review', 'ready to PR?'. Classifies changed files as front-end (client/) or back-end (server/, reviewer-core/), loads the matching architecture + best-practice sibling skills for each side, reviews the diff against them, and BLOCKS the push when a critical problem is found. Front-end files → ui-architecture, react-best-practices, next-best-practices, react-testing-library. Back-end files → onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design. Shared → zod, typescript-expert, security."
---

# PR Self-Review — local gate before push / PR

Reviews the **working diff on the current branch** against the repo's own architecture and
best-practice skills, *before* it leaves the machine. Goal: catch layer violations, anti-patterns,
and defects locally so nothing broken reaches GitHub.

**This skill is a gate.** If a **critical** problem is found → tell the user to fix it and
**do NOT push / create the PR**. Only proceed when the diff is clean or has non-blocking findings
the user accepts.

## When it runs

Invoke automatically **before** any of these actions, and on manual request:

- `git push`, `git push -u`, `git push --force*`
- `gh pr create`, `gh pr edit`, `gh pr merge`, or pushing to an existing PR branch
- user says: "review my changes", "self-review", "check before push", "ready to open a PR?"

If the user asks to push and this review has not run this turn → run it first, then push.

## Workflow

1. **Collect the diff.** Determine what will actually ship:
   ```bash
   git fetch origin --quiet 2>/dev/null || true
   BASE=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
   git diff --name-status "$BASE"...HEAD          # committed changes
   git status --porcelain                          # uncommitted (warn if present)
   git diff "$BASE"...HEAD                          # full patch to review
   ```
   Review both committed and uncommitted changes — anything not yet committed will not push, so
   flag it. Ignore files under `server/clones/**` (vendored third-party clones).

2. **Classify each changed file** → front-end / back-end / shared / other (see table below).

3. **Load the matching skills — only for sides that have changes.** Do not load back-end skills
   for a UI-only diff, or vice-versa. See the skill-map table.

4. **Review each file against its loaded skills.** For every finding produce:
   `path:line — <severity> — <problem>. <fix>.`

5. **Gate.** Apply the severity rubric. Any **critical** finding → **REJECT**: print the blockers,
   tell the user to fix, and stop. Do not run the push/PR command. Otherwise print the summary and
   proceed (or ask, if only warnings remain).

   On an **OK to push** verdict (no criticals; warnings accepted), write the pass token so the
   enforcement hook lets the push through:
   ```bash
   git rev-parse HEAD > "${CLAUDE_PROJECT_DIR:-.}/.claude/.pr-self-review-pass"
   ```
   The token is bound to the current HEAD and consumed on first push. If HEAD moves (new commit) or
   the verdict is BLOCKED, do **not** write it — re-run this skill.

6. **Fast checks** (run when the tool exists in the touched package; a failure is **critical**):
   - `pnpm -C <pkg> typecheck`
   - `pnpm -C <pkg> test` (for packages with changed source)
   - `cd server && pnpm db:migrate` status if `server/**/schema*` or migrations changed

## File classification

| Path glob | Side | Notes |
|-----------|------|-------|
| `client/**` | **front-end** | Next.js studio (`@devdigest/web`) |
| `server/**` (excl. `clones/**`) | **back-end** | Fastify API (`@devdigest/api`) |
| `reviewer-core/**` | **back-end** | pure TS engine — keep it DB/IO-free |
| `**/*.schema.ts`, `**/vendor/shared/**`, Zod contracts | **shared** | load `zod` on either side |
| `e2e/**` | **back-end-ish** | deterministic browser e2e (see TESTING.md) |
| `*.md`, `scripts/**`, config, `docker-compose*` | **other** | light review; skip arch skills |
| `server/clones/**` | **ignore** | vendored clones — never review |

## Skill map — which skills apply to which side

**Front-end files (`client/**`)** — load and apply:
- `ui-architecture` — where a component lives, splitting, business-logic/constants placement, client-vs-server state, prop/composition design, a11y/Web-Vitals
- `react-best-practices` — hooks misuse, derive-don't-store, keys, memoization, conditional rendering
- `next-best-practices` — RSC boundaries, `page.tsx`/`layout.tsx`, async APIs, metadata, route handlers, image/font
- `react-testing-library` — component/hook tests (Vitest + jsdom) for changed UI

**Back-end files (`server/**`, `reviewer-core/**`)** — load and apply:
- `onion-architecture` — the 4 rings (domain → application → infrastructure → transport), inward-only dependency rule, module/DI placement, keep `reviewer-core` pure
- `fastify-best-practices` — routes/plugins/hooks, JSON-schema validation, error handling, serialization
- `drizzle-orm-patterns` — schema, queries, relations, transactions, migrations
- `postgresql-table-design` — data types, indexing, constraints, perf

**Shared / either side (load when relevant lines are touched):**
- `zod` — any `z.object`/contract change (loads on both sides)
- `typescript-expert` — tricky types on changed lines
- `security` — auth, input handling, file uploads, secrets, API endpoints (**always** load when a back-end route or any input-boundary changes)

## Severity rubric

| Severity | Meaning | Gate |
|----------|---------|------|
| **critical** | breaks build/tests/migrations; security hole (authz bypass, injection, leaked secret); onion layer violation (domain imports infra, `reviewer-core` touches DB/GitHub/fs); data-loss migration | **BLOCK push** |
| **major** | clear anti-pattern or bug with real impact; missing validation on an input boundary; wrong RSC/client boundary; N+1 or unindexed hot query | strongly advise fix; ask before push |
| **minor** | style/structure nit, naming, missing small test | non-blocking; note it |

**Reject rule:** ≥1 critical → do not push, list blockers, stop. Report faithfully — if a check
failed, say so with the output; never claim clean when it isn't.

## Output format

```
PR Self-Review — branch <name> vs origin/main
Changed: <n> files  (FE: <a>  BE: <b>  shared: <c>)
Skills loaded: <list>

CRITICAL (blocks push)
  path:line — <problem>. <fix>.
MAJOR
  path:line — <problem>. <fix>.
MINOR
  path:line — <problem>. <fix>.

Checks: typecheck ✓/✗ · tests ✓/✗ · migrate ✓/✗

VERDICT: BLOCKED — fix criticals before push   |   OK to push
```

## Enforcement (why this is not skippable)

A `PreToolUse` hook (`.claude/hooks/pr-self-review-gate.sh`, registered in `.claude/settings.json`)
intercepts every `git push` and `gh pr create|edit|merge`. It **denies** the command unless a fresh
pass token (`.claude/.pr-self-review-pass`, matching current HEAD) exists. So even if this skill is
not invoked automatically, the push is blocked with a message telling you to run it first. The token
is written only on an OK verdict (step 5) and is consumed on the first push — one review, one push.

There is no silent bypass: the token is written only after an OK verdict, so a human must either run
the review or explicitly disable the hook in `.claude/settings.json`.

## Notes

- `.claude/.pr-self-review-pass` is a transient token — git-ignore it (do not commit).
- Delegate the actual diff read to `caveman:cavecrew-reviewer` for large diffs to save context; keep
  the gate decision in the main thread.
- This skill does not repeat the sibling skills' content — it **routes** to them. Defer to each
  loaded skill for the specific rules.
