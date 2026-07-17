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

### 2026-07-17 — Blast Radius fixes: unavailable state, file-level notice, disabled Graph, callers_total/relation, endpoint objects
`BlastTab/` updated for the extended `blast.ts` contract (server-side fixes: see
[../server/insights.md](../server/insights.md)). `status: 'unavailable'` now short-circuits to its
own return (title from `IndexBadge`'s new status label + a body message) BEFORE the stat row is
built, matching the existing `!data` early-return shape one level up — the spec is explicit that a
missing index must never render "0 symbols/callers/endpoints" (reads as "nothing breaks"). Since
Graph was already dead UI (no graph impl, an inert placeholder `div`), removing the `view` state
entirely (not just disabling the chip) followed from `react-best-practices`: once Graph is
permanently `disabled` there is no second state to toggle to, so keeping `useState<ViewMode>` would
be unused state carried for a UI affordance that no longer does anything — `Chip active` (tree,
static) + `Chip disabled` (graph) replaces it. `SymbolRow` first-only-expand takes an `index` prop
from the `impacts.map` call, not a symbol-count heuristic — matches the "container passes position,
leaf renders" shape already used elsewhere (e.g. `PRRow`). `FactChips` grew `repoFullName`/`headSha`
props (threaded from `SymbolRow`) purely to build the endpoint's `githubBlobUrl` — endpoints have no
line (index isn't line-precise for them), so the link omits it, unlike caller links.

### 2026-07-17 — Blast Radius round 2: Mermaid graph, Prior PRs, stat-chip sort, expand-all, endpoint-count fix
Re-enabled the Graph chip removed above — it's a real `flowchart LR` now (`mermaid.ts`, pure/
hermetic: symbol/caller/endpoint node ids hashed from a stable key so a caller reached from two
changed symbols still dedupes to one node; labels quoted+escaped since raw `rateLimit()` /
`/api/public/x` break mermaid's unquoted node syntax) rendered via the existing
`components/mermaid-diagram/MermaidDiagram` — reused as-is, no changes needed to it. Capped at 6
symbols/5 callers/4 endpoints (skill guidance: ~20 nodes) with a `truncated` flag surfaced as a
hint. Three new pure/testable modules colocated in `BlastTab/`: `sort.ts` (stat-chip click-to-sort;
`Array.prototype.sort` is stable since ES2019 so no explicit tie-break needed; default order sinks
`callers_total===0` symbols to the end without an explicit sort), `mermaid.ts` (chart builder),
plus `EndpointChip.tsx` extracted out of `FactChips` on its 2nd consumer (`AffectedEndpoints`, the
full flat `data.endpoints` list — added because some BFS-reached endpoints aren't attributable to
any single symbol, so per-symbol chips alone silently undercounted `counts.endpoints`). Expand/
collapse-all reuses the exact "openNonce" pattern from `ReviewRunAccordion` (already documented
above under "Navigate-to-finding") applied to a NEW case — a header control snapping every row's
local state via a bumped nonce, not lifting the state itself: `SymbolRow` keeps owning its own
`expanded` `useState`, and only resyncs it in a `useEffect` keyed on `expandSignal.nonce` changing,
so the row stays freely toggleable afterward. Stat chips became sort buttons — replaced with a
custom `StatChips.tsx` (plain `<button>`, not the `Badge` primitive) rather than adding `onClick` to
`Badge`, since `Badge` is shared broadly (severity pills etc.) and the mock wanted a visually
lighter treatment specific to this row, not a generic Badge behavior change.

The user's target mock was 4 pasted screenshots (not a repo file — no point grepping for one next
time a "match this mock" task has no findable spec doc). Two corrections made after the initial
pass, once the mock was described precisely: (1) the stat row's `symbols`/`callers` icons are
specifically `<>` (`Icon.Code`) and `↳` (`Icon.CornerDownRight`), not the generic `Layers`/`Users` —
don't assume a "close enough" icon satisfies mock parity when exact glyphs are called out. (2) the
graph's 3-column layout (symbol | callers | endpoints) requires endpoint nodes to hang off the
CALLER nodes, not the changed-symbol node directly — `mermaid.ts`'s `buildBlastGraph` originally
connected symbol→caller AND symbol→endpoint as two separate depth-1 fans, which mermaid's `dagre`
layout would draw as two nodes in the SAME column instead of three staggered columns. Fixed by
fanning every capped caller → every capped endpoint (with a `symbol→endpoint` fallback edge only
when a symbol has endpoints but zero callers survived the cap), even though the contract itself
only records symbol→endpoint reachability (`source_symbols`), not per-caller attribution — a
readable diagram over a literally-precise one, flagged as an approximation in the file comment.

### 2026-07-17 — Blast Radius round 3: mermaid classDef bug, Explain gate, path overflow, diff-nav
Live testing surfaced a real mermaid bug: `classDef`'s style list is COMMA-separated, and
`fill:var(--accent-bg,#2b3a67)`/`color-mix(in srgb,...)` values smuggle in their OWN internal
commas — the graph silently failed to parse and never rendered. Fixed by switching `mermaid.ts`'s
`CLASS_DEFS` to plain hex (no `var()`/functions at all) — moot anyway since `MermaidDiagram` always
initializes mermaid's own `dark` theme regardless of the app's light/dark setting, so a CSS custom
property wasn't even the right tool here. New `mermaid.test.ts` case asserts each `classDef` line
splits into exactly 3 `key:#hex` declarations, specifically to catch this class of regression.
Explain (`BlastTab.tsx`) had two bugs, not one: `IconBtn` renders icon-only (aria-label/title, no
VISIBLE text) so a first-time user had no way to know the sparkle icon meant "Explain" — swapped
for `Button kind="ghost" size="sm"` (same pattern as `DiffTab`'s "Show/Hide comments"). Separately,
`explainDisabled` still gated on `index.degraded` after the backend lifted that restriction (server
round 3 — see server insights) — since most starter-DB repos hit the degraded path (repo-intel
AGENTS.md), the button was disabled for nearly every real PR, so "the result never shows" was really
just "the button was never clickable to begin with."

Diff-nav (caller/symbol/endpoint click → Files-changed tab + scroll) reuses the EXACT
`focusFindingId`/`focusTarget` machinery `DiffTab`/`SmartDiffViewer`/`SmartDiffGroupSection`/
`SmartDiffFileCard` already have for finding↔diff cross-tab links — no new mechanism. The only
change: `focusTarget.line` widened to `number | null` (`SmartDiffFileCard` now falls back to a new
`data-file-card={path}` anchor — added to the card's own root div — when `line` is null) because
Blast Radius often has no line to give: a changed symbol's own contract (`ChangedSymbol`) carries no
line field, and an endpoint's `location.line` is always null (the repo index isn't line-precise for
endpoints). New `blastFocus` query param (`page.tsx`, own `encodeBlastFocus`/`decodeBlastFocus`
pair, colocated — single consumer, not worth a shared module) mirrors the existing `finding` param's
shape exactly, just carrying `file[:line]` directly instead of an id to look up (no lookup step
needed — Blast already has the file+line). Off-diff fallback: `BlastTab` now takes a `diffFiles`
prop (`pr.files.map(f => f.path)`, threaded from `page.tsx`) — a caller/endpoint whose file ISN'T in
that set keeps the pre-round-3 GitHub-link behavior (most callers live outside the diff by
definition); only an in-diff target gets the new in-app `onFocusFile` wiring. `MonoLink` (vendored)
gained an optional `style` prop (same "extend the primitive in place" pattern as `Chip`/`IconBtn`
above) — needed to fix the caller-path overflow bug too: a flex item's default `min-width` is `auto`
(its own content width), so a long `file:line` pushed the row wider than the card instead of
wrapping; `minWidth: 0` + `overflowWrap: anywhere` on the caller's `MonoLink` fixes it. This one has
no test — it's a pure CSS layout fix with nothing to assert in jsdom (no real layout engine).

### 2026-07-17 — Blast Radius round 4: empty graph nodes, nav-scroll robustness, Explain feedback
Three more live-testing bugs. (1) `buildBlastGraph` (`mermaid.ts`) capped `impacts.slice(0,
MAX_SYMBOLS)` BEFORE checking whether each one had anything to draw — a symbol with 0 callers AND 0
endpoints still got declared as a floating node with no edges, and worse, could crowd OUT a
meaningful symbol later in file-rank order once the cap was hit. Fixed by filtering
(`callers.length>0 || endpoints.length>0`) BEFORE capping, not after — general lesson: when a list
is both filtered AND capped, filter first, or the cap can starve out everything the filter would
have kept. (2) Explain silently rendered nothing when `explanation` resolved to `null` (a real,
expected outcome — the server explicitly `try/catch`es the LLM call to null rather than failing the
whole read) — looked exactly like a broken button. Fixed: render the result section whenever
`explain && !isFetching` (settled, not just clicked), with an explicit fallback message for the null
case, instead of the old `explain && explanation` gate that rendered NOTHING for null.

(3) File-level nav (symbol/endpoint click) reportedly still didn't scroll to the target file card,
confirmed as a real live bug (team lead reproduced it in-browser: URL correctly set `?blastFocus=`,
tab correctly switched, but the view stayed at the top). This agent has no browser-automation tool
wired into its subagent context (the `claude-in-chrome` skill loads but grants no
`mcp__claude-in-chrome__*` tools here — confirmed by trying twice), so this agent's two rounds of
fixes here (a `scrollAndFlash` retry loop for mount-timing races, then `router.replace(url, {
scroll: false })` in `page.tsx`'s `setParams` to stop Next's default scroll-restore from racing the
app's own scroll) were both plausible-but-unverified guesses — neither was the actual bug.
**CONFIRMED ROOT CAUSE** (team lead, live devtools): `scrollAndFlash` used
`el.scrollIntoView({ behavior: "smooth", ... })`. The app's scroll container is a nested `<main
overflow:auto>` (`AppFrame.tsx`) — a PROGRAMMATIC **smooth** scroll to a far/off-screen target
silently no-ops on this kind of container (verified in the live DOM: `scrollIntoView` was called,
`dd-finding-flash` was applied, but `scrollTop` never moved). Switching to `behavior: "auto"` fixed
it immediately — jumps correctly instead of animating (and failing to animate). The retry loop and
`data-file-card` anchor were both already correct; `smooth` was the only bug. **Lesson**: a
programmatic `scrollIntoView({behavior:'smooth'})` to a target far outside the viewport can silently
no-op on a NESTED scrollable container (not just `window`) — use `behavior:'auto'` for any
programmatic (non-user-initiated) scroll-to-element in this app, especially across a large distance;
jsdom can't catch this at all (no real layout/scroll engine), so this class of bug needs a live
browser, not more unit tests.

## Open Questions

### No `PRRow.test.tsx` — COST column render is untested
`PRRow` has no test file; the new COST cell is covered only by typecheck. Timeline + drawer cost
ARE unit-tested (`RunHistory.test.tsx`, `RunTraceDrawer.test.tsx`).

### `IntentCard` has no test coverage yet
Tests were explicitly deferred (user request) for the Intent layer pass. When added: RTL tests
for the populated state (intent + in/out-of-scope lists), the null/`unavailable` state, and that
clicking recompute calls the mutation and disables the button while pending — mirror whatever
`VerdictBanner.test.tsx` does, if it has one, for the loading-state assertions.
