---
name: engineering-insights
description: "Captures non-obvious engineering lessons into the touched module's insights.md so future sessions start informed. Use at the end of any substantial session (a problem solved, a non-obvious decision made, a gotcha hit, a recurring error fixed, an open question left open), or the moment a surprising lesson surfaces mid-task, or when the user says 'capture insights', 'wrap up', 'what did we learn', or runs /engineering-insights. Skips trivial edits."
---

# Engineering Insights — capture-learnings loop

Append what a session learned to the **touched module's `insights.md`**, so the
next session reads it cold and doesn't relearn it. This is the project's
persistent memory between context windows.

## Where to write

Route by the path you were working in — write to that module's file:

| You worked in… | Append to |
|----------------|-----------|
| `client/**` | `client/insights.md` |
| `server/src/modules/repo-intel/**` | `server/src/modules/repo-intel/insights.md` |
| `server/**` (anything else) | `server/insights.md` |
| `reviewer-core/**` | `reviewer-core/insights.md` |
| `e2e/**` | `e2e/insights.md` |

Most specific path wins (repo-intel before server). Shared/cross-cutting change →
the **nearest owning module**. A lesson that spans two modules is written **once**
in the primary file and cross-linked to the other with a relative path. Reference
code with a markdown link or bare path — the repo does **not** use `file:line`.

## The 7 sections

Every `insights.md` has these fixed headings, in this order. Append the entry
under the matching one (create the heading only if missing):

`What Works` · `What Doesn't Work` · `Codebase Patterns` · `Tool & Library Notes`
· `Recurring Errors & Fixes` · `Session Notes` · `Open Questions`

## Wrap-up — what to capture

Walk the session and harvest, mapping each to its section:

1. **What Works** — 2–5 approaches that worked this session.
2. **What Doesn't Work** — approaches abandoned + *why* (negative lessons are the
   most valuable — they stop a repeat).
3. **Codebase Patterns** — new conventions / architectural decisions made.
4. **Tool & Library Notes** — quirks discovered in a dep or tool.
5. **Recurring Errors & Fixes** — an error you hit + the fix that resolved it.
6. **Session Notes** — one dated entry `### YYYY-MM-DD` summarizing what got done.
7. **Open Questions** — anything left unresolved.

## How to write — silent append + dedup

1. **Read the target `insights.md` first.**
2. For each candidate, check overlap with existing entries. If it overlaps,
   **extend or skip — never duplicate**.
3. Otherwise **append** under the right section.
4. **Append-only:** never overwrite or delete an existing entry. A superseded
   lesson gets a new dated note that corrects it, not an in-place edit.
5. Report one line: `wrote N entries → <module>/insights.md`. Do not ask first —
   append silently, then report.

Entry shape: `### <short title>` then 1–3 lines — what happened + the rule that
prevents a repeat + a relative code ref.

## Quality gate — actionable, not banal

Each entry must read **actionable cold**: a future session reads it and *knows
what to do*, no chasing. Rubric: **Specific · Reusable · Actionable · Dated.**

Test: *if it would be obvious to anyone reading the code, don't write it.*

- ✗ `Promises can be tricky` → ✓ ``Promise.all()`` on the ingest pipeline times
  out past ~30 items — use ``Promise.allSettled()``, batch 10.
- ✗ `be careful with the database layer` → ✓ exclude `vendor/` from dependency
  checks — it holds a forked lodash with custom patches.
- ✗ `update the skill with the fix` → ✓ show the **exact** corrected behaviour.

Skip: general best practices, one-off situations, anything already in `CLAUDE.md`
or `docs/`.

## Hygiene

- Consolidate at ~80–100 entries **or** weekly — merge duplicates, prune stale,
  resolve conflicts explicitly (don't leave two entries that contradict).
- Hard ceiling ~200 entries per file — past that, signal drowns ("400 unsorted
  bullets is worse than no file"). Split into a domain file if needed.
- `insights.md` is a **reviewed draft, not gospel** — it's committed to git, so a
  bad wrap-up is visible and revertible. It's team memory.

## Trigger reliability (L01 → L06)

At L01 this fires from the description or a manual run — **best-effort**; the most
common failure is skipping the wrap-up. Build it into the session-ending ritual,
same as committing. At **L06** a `Stop` hook makes capture automatic and
unskippable — a skill can register a hook that lives only while it's active. The
heavier glebis-`retrospective` machinery (silent Fast/Full gate check, ranked
candidates capped at 5, AskUserQuestion approval, a tested dedup engine,
multi-session JSONL scan) is the same L06 upgrade path — not built here.
