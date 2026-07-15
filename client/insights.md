# @devdigest/web — insights

Non-obvious lessons, gotchas, and pitfalls learned while working in **@devdigest/web**.
One entry per lesson. This is the "what bit us" log — keep CLAUDE.md a map and
put the *why it bit us* here.

> Format: `### <short title>` + what happened + the rule that prevents a repeat.
> Append-only — add entries, never overwrite. Maintained by the `engineering-insights` skill.
> Link related modules with relative paths.

## What Works

### Lazy-fetch popover data with an "armed" gate, not on row mount
A per-row popover that needs extra data (PR list FINDINGS → `usePrReviews`) must NOT
fetch for every row on list mount. Pattern: `const [armed,setArmed]=useState(false)` flipped
on first open, then `usePrReviews(armed ? prId : null)` (the hook's `enabled:!!prId` skips
the null). See [`_components/PRRow/PRRowFindings.tsx`](src/app/repos/[repoId]/pulls/_components/PRRow/PRRowFindings.tsx).

### Counter UI = reuse `SeverityBadge` (has `count`+`compact`) + `SEV` token map
Don't hand-roll severity pills. `SeverityBadge severity count compact` (`vendor/ui/primitives/Badge.tsx`)
renders icon+count; `SEV` (`tokens.ts`) is the color/icon/label source of truth. `SeverityCounters`
composes 3 of them; `FindingsPopoverBar` wraps that with a popover.

## What Doesn't Work

## Codebase Patterns

### Shared contracts are VENDORED twice — edit both copies
`client/src/vendor/shared/contracts/*` is a hand-mirrored copy of the server's
`@devdigest/shared` (server is source of truth). Adding a field (e.g. `cost_usd` on
`RunStats`/`RunSummary`/`PrMeta`) requires the **same edit in both** `server/src/vendor/shared/`
and `client/src/vendor/shared/` or types drift and tests show "two different types with this
name exist". See [../server/insights.md](../server/insights.md). Note: `FEATURE_MODELS`
(`lib/feature-models.ts`) is a THIRD, separately hand-mirrored registry — a runtime array, not a
type, so it lives outside `vendor/shared` entirely (see "Never import `@devdigest/shared` as a
RUNTIME value" below) and must be kept in sync with `server/src/vendor/shared/contracts/platform.ts`
by hand on every default-model change (confirmed again for `review_intent`'s flash-model flip).

### PR-list table is grid-driven by 3 files in lockstep
A new column = edit all of: `constants.ts` `GRID` track string (add width) + `COLUMN_KEYS`
(order = visual order), and the matching cell in `_components/PRRow/PRRow.tsx`. Header
right-aligns only the **last** key (`i === COLUMN_KEYS.length-1`), so insert before `updated`
to keep left-alignment. Miss one and columns misalign silently.

### Agent-editor tabs live in THREE lockstep places — miss one and `?tab=` silently resets
Adding an editor tab (e.g. Skills) requires: `AgentEditor/constants.ts` `TABS` (label+icon), the
`VALID_TABS` allow-list in `agents/[id]/page.tsx` (gates `?tab=`), AND a render branch in
`AgentEditor.tsx`. The page's `VALID_TABS.includes(...) ? ... : "config"` is the trap: forget it
and the tab renders in the bar but every deep-link falls back to Config with no error.

### Cost format = shared `formatCost` in `components/RunCostBadge`
`formatCost(usd)` = `null → "—"`, else `$` + `Number(usd.toPrecision(3))` (3 sig figs, trailing
zeros stripped: 0.06→"$0.06", 0.0013→"$0.0013"). Reused by `RunCostBadge` (PR list + timeline)
and the drawer COST `Stat` card. Never render `$0.00` for a missing value — always `—`.

### Floating panels must portal to `<body>` — the PR-list `tableCard` clips them
`pulls/styles.ts` `tableCard` has `overflow: hidden` (rounds the row corners), so an
absolutely-positioned popover inside a row gets clipped. Render the panel via
`createPortal(panel, document.body)` with `position: fixed` computed from the trigger's
`getBoundingClientRect()` (reposition on scroll/resize, capture-phase). See
[`components/FindingsPopoverBar/FindingsPopoverBar.tsx`](src/components/FindingsPopoverBar/FindingsPopoverBar.tsx).

### Navigate-to-finding: `data-finding-id` anchor + open accordion BY finding id
`FindingCard` already renders `data-finding-id={f.id}` — scroll via
`document.querySelector('[data-finding-id="…"]')` + add the `dd-finding-flash` class
(keyframe in `vendor/ui/styles.css`). The card only exists when its run accordion is OPEN, and
seeded `reviews` can have `run_id === null` — so open the accordion by **matching the finding id
against `review.findings`**, NOT by `run_id` (the existing Timeline `targetRunId` path silently
no-ops for null run_id). `ReviewRunAccordion` takes `openFindingId`+`openNonce`.

### Container-tier PR-detail cards own their own data hooks — no server-passed mirror state
`IntentCard` takes only `{prId}` and calls `usePrIntent(prId)`/`useRecomputeIntent(prId)` itself
rather than receiving already-fetched data as props — matches `VerdictBanner`'s shape (and the
sibling cards in `_components/`). Keep new PR-detail cards on this pattern: the card is the
container (fetches + owns loading/error/mutation state), `OverviewTab`/`page.tsx` only pass the
id.

### A shared folder's private (non-exported) internals can force colocation over route-local placement
`ui-architecture`'s default is "start route-local (`_components/`), promote to a shared folder on
the 2nd consumer." The Smart Diff components (`SmartDiffFileCard`, `SmartDiffGroupSection`,
`SmartDiffViewer`, `SplitSuggestionBanner`) break that default on the *first* consumer: they live
directly in `components/diff-viewer/` because they need `parsePatch`, `CodeLine`, the `s` style
map, and `chevronFor` — internals the folder's `index.ts` barrel deliberately does NOT export (see
the barrel's own comment: "Internals … stay private to this folder"). A route-local component
can only import a folder's public barrel, so when a new component needs another folder's private
internals, colocate inside that folder instead of duplicating the internals route-local. This is
a deliberate exception, not a violation — will recur for any future diff-adjacent component.

### Vendored UI primitive missing a prop your feature needs → extend it in place, don't hand-roll
`vendor/ui/primitives/IconBtn.tsx` had no `disabled`/`loading` affordance before the Intent card
needed a "recompute, spin + disable while pending" icon button. Added `disabled?`/`loading?`
(loading implies disabled; spins the icon via the existing `ddspin` keyframe from
`vendor/ui/styles.css`, same pattern already used by `Button.tsx`/`ReviewRunAccordion.tsx`/
`AgentCard.tsx` delete buttons) — additive, no existing caller passes the new props so nothing
else changes. `vendor/ui` is vendored specifically so it CAN be edited; prefer extending a
primitive over duplicating its markup inline in a new component.

## Tool & Library Notes

### Two `Severity` types: `@devdigest/ui` (4 values, has INFO) vs `@devdigest/shared` (3)
`vendor/ui/primitives/tokens.ts` `Severity = CRITICAL|WARNING|SUGGESTION|INFO`; the shared
contract `Severity` has only the 3 real ones. A callback typed `(s: ui.Severity)=>void` is NOT
assignable from `(s: shared.Severity)=>void` (param contravariance: INFO can't flow to the 3-set).
For interactive severity props use the 3-value `Sev` exported from `SeverityCounters`, not ui's
`Severity`.

### `@devdigest/ui` root barrel in a Server Component crashes — pulls recharts into RSC
The root barrel `vendor/ui/index.ts` re-exports `charts/*`, which import recharts (a class
component). Importing `{ Skeleton }`/`{ EmptyState }` from `@devdigest/ui` into a **Server
Component** (`app/loading.tsx`, `app/not-found.tsx`) drags recharts into the RSC graph →
`TypeError: Super expression must either be null or a function` and a 500 on every route using
that fallback. Pages don't hit it because they're `"use client"`. Rule: from a Server Component,
import UI from the narrow sub-barrel `@/vendor/ui/primitives` (no charts), not the root barrel —
or mark the file `"use client"`. See `app/loading.tsx`, `app/not-found.tsx`.

## Recurring Errors & Fixes

### "Cannot update a component while rendering a different component" — callback in a setState updater
`FindingsPopoverBar` called the parent's `onOpenSeverity` **inside** the `setOpenSev(cur=>…)`
updater fn → React runs updaters during render, so the parent (`PRRowFindings`) `setState` fired
mid-render. Fix: compute next value from current state in the event handler and call the parent
callback **outside** the updater (`setOpenSev(next); if(next) onOpenSeverity?.(next)`). Never call
a prop/parent setter from within a `setState(updater)`.

### Never import `@devdigest/shared` as a RUNTIME value in client code — types only
`client/src/vendor/shared` re-exports with `.js` extensions Next/webpack can't resolve
(`Can't resolve './contracts/findings.js'`). Type-only imports are erased so the barrel never
loads — but importing a zod schema as a *value* (`SkillType.options`, `SkillSlug.safeParse(...)`)
bundles the whole barrel and breaks the build at the importing page. Mirror the constant/regex
locally instead (`SKILL_TYPES`, `isValidSlug` in `app/skills/helpers.ts`) and keep
`import type { … } from "@devdigest/shared"`. Complements the "contracts vendored twice" note above.
This is also why `lib/feature-models.ts`'s `FEATURE_MODELS` is a hand-mirrored plain array rather
than importing the server's — importing the real registry as a value would bundle the whole
`vendor/shared` barrel. The same restriction forces duplicated **business logic**, not just data:
`lib/smart-diff.ts`'s `lastReview()` (newest `kind==='review'` row) reimplements the identical
rule already living in `server/src/modules/smart-diff/service.ts`, because a shared runtime
helper would need a value import across the boundary. Treat this as the correct, accepted answer
for any future cross-boundary business rule (not just constants) — don't chase a "shared util"
refactor across `client`/`server`; instead keep both copies short, comment each with a pointer to
its twin, and grep for the twin before changing either.

### `pnpm build` while `next dev` is live corrupts `.next` → `Cannot find module './975.js'`
A production build writes the same `.next/` the running dev server serves from, clobbering
its webpack chunk manifest → every route 500s with `Cannot find module './<n>.js'`. It is a
cache artifact, NOT a code bug. Don't run `pnpm build` against a live dev server; to verify a
prod build, stop dev first. Recover by restarting `next dev` (rebuilds `.next` from scratch).

### `Record<string, IconName>` index → `IconName | undefined`, unassignable to `Icon`
Under `noUncheckedIndexedAccess`, indexing `const M: Record<string, IconName>` yields
`IconName | undefined`, which fails when passed to a component prop typed as a bare `IconName`
(e.g. `<StubTab icon={M[key]} />`). Type the lookup with explicit keys instead:
`const STUB_ICON: { evals: IconName; stats: IconName } = {…}`. Same trap for any icon/color map.

## Session Notes

### 2026-07-01 — cost display in PR list, timeline, trace drawer
Added `RunCostBadge` + `formatCost` (`components/RunCostBadge/`), COST column (PR table),
cost-only timeline row (`RunHistory`), COST stat card (`TraceBody`). i18n: `prReview.columns.cost`,
`runs.trace.stat.cost`. Data plumbing on server side — see [../server/insights.md](../server/insights.md).

### 2026-07-01 — findings-by-severity counters + click popover (both PR pages)
Added `SeverityCounters` (`vendor/ui/primitives`) + `FindingsPopoverBar`
(`components/FindingsPopoverBar/`, portalled). PR-list FINDINGS column (`PRRowFindings`,
lazy-fetch) and PR-detail Review-runs bar both open a popover of that severity's findings;
clicking a finding deep-links `?tab=findings&finding=<id>` → `FindingsTab` opens the run
accordion by finding id + scrolls/flashes. Server adds per-severity counts to `PrMeta` — see
[../server/insights.md](../server/insights.md). Spec: [specs/findings-by-severity.md](specs/findings-by-severity.md).
First design (in-place card filter) was scrapped as a "bug" — user wanted the popover.

### 2026-07-09 — Skills Lab page + Agent Skills tab + trace token badge
New `/skills` split-view (`_components/SkillsView` list + `SkillDetail` Config/Preview/Versions;
Evals/Stats stubbed) with a line-numbered body editor (`SkillBodyEditor`, `unsaved` + live token
count via `lib/tokens.ts`), `react-markdown` Preview, and a `diff`-powered Versions tab
(Diff + Restore). `AddSkillModal` does create + base64 `.md`/`.zip` import (preview→confirm, trust
warning, ignored-files list). Agent editor gains a drag-reorder + checkbox `SkillsTab`. Reused
existing `Skill`/`AgentSkillLink` contracts (edited BOTH vendored copies). Nav: "SKILLS LAB" group.
Copy in `messages/en/skills.json` (rewrote the older starter draft). Server →
[../server/insights.md](../server/insights.md).

### 2026-07-15 — Intent Card (PR-detail) + client half of the model-default flip
New `IntentCard/` (`_components/`, mirrors `VerdictBanner/`) slotted into `OverviewTab` above the
PR description; `usePrIntent`/`useRecomputeIntent` hooks (`lib/hooks/intent.ts`, TanStack Query
key `["pr-intent", prId]`). Extended `vendor/ui/primitives/IconBtn.tsx` with `disabled`/`loading`
for the recompute button's spinner. `review_intent`'s default flipped to
`openrouter/deepseek-v4-flash` in `lib/feature-models.ts` — byte-matched against
`server/src/vendor/shared/contracts/platform.ts` (see [../server/insights.md](../server/insights.md)).
i18n reused existing `block.intent`/`unavailable`/`unavailableHint`, added `inScope`/`outOfScope`/
`recompute`/`recomputing` to `messages/en/brief.json`. `client/src/vendor/shared/contracts/platform.ts`
(the types-only vendored mirror, separate from `lib/feature-models.ts`) was intentionally left
un-synced — it's dead at runtime (client never imports `FEATURE_MODELS` as a value from
`vendor/shared`) but is now stale text; worth a follow-up sweep if anyone diffs the two files.

### 2026-07-15 — Smart Diff panel (Files-changed tab: risk groups + last-review overlay)
New `SmartDiffViewer`/`SmartDiffGroupSection`/`SmartDiffFileCard`/`SplitSuggestionBanner`
(`components/diff-viewer/`, colocated for barrel-private-internal access — see the new
"private internals force colocation" pattern above) plus `lib/smart-diff.ts` (`lastReview`,
`findingsByLine`, `topSeverity` — pure, no fetch). `DiffTab.tsx` gains a toggle (via two `Chip`s
in `SectionLabel`'s `right` slot) between the existing unified `DiffViewer` and the new
`SmartDiffViewer`; data comes from `useSmartDiff` (`lib/hooks/reviews.ts`). `vendor/ui/primitives/
Chip.tsx` got a `disabled` prop — same "extend the vendored primitive in place" pattern as
`IconBtn.tsx`'s `disabled`/`loading` (see above), not a new lesson. Server → [../server/insights.md](../server/insights.md).

## Open Questions

### No `PRRow.test.tsx` — COST column render is untested
`PRRow` has no test file; the new COST cell is covered only by typecheck. Timeline + drawer cost
ARE unit-tested (`RunHistory.test.tsx`, `RunTraceDrawer.test.tsx`).

### `IntentCard` has no test coverage yet
Tests were explicitly deferred (user request) for the Intent layer pass. When added: RTL tests
for the populated state (intent + in/out-of-scope lists), the null/`unavailable` state, and that
clicking recompute calls the mutation and disables the button while pending — mirror whatever
`VerdictBanner.test.tsx` does, if it has one, for the loading-state assertions.
