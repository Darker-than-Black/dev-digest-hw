# Spec: Findings by severity — counters + click-to-filter

> Status: planned · Scope: **client + server** (UI-led; needs one server data change).
> Lives in `client/specs/` per the client `CLAUDE.md`, but Step 1–2 touch the API.

## Context

Reviews already produce `findings`, each tagged `severity ∈ {CRITICAL, WARNING, SUGGESTION}`
(`@devdigest/shared` `Severity`, `contracts/findings.ts:11`). Today the PR **detail**
page lists findings grouped by run but offers no severity overview and no way to
filter. The PR **list** has no findings column at all — the list endpoint deliberately
omits the breakdown (`server/src/modules/pulls/routes.ts:116-117`).

**Goal:** surface a per-severity counter — e.g. **`3 CRITICAL · 5 WARNING · 2 SUGGESTION`** —
on both pages, and on the detail page let the user click severities to show only
matching findings.

**Decisions (locked):** both pages · clicking a severity opens a **popover**
listing that severity's findings (title · category · file:line · confidence ·
rationale); clicking a finding **navigates to it** (PR detail, run accordion
opened, scrolled + flashed). On the list the popover **lazy-fetches** findings on
first open.

## Reuse (do NOT rebuild)
- `SEV` severity → color/icon/label map — `client/src/vendor/ui/primitives/tokens.ts:6-14`
- `SeverityBadge({severity, count, compact})` — `client/.../primitives/Badge.tsx:52` — the counter pill primitive
- `Chip` (active prop) — existing filter-chip pattern (`pulls/_components/FilterBar`)
- `visibleFindings(findings, hideLow)` — `FindingsPanel/helpers.ts` — extend for severity
- list-endpoint aggregate pattern (score IN-query + JS group) — `pulls/routes.ts:114-145`
- `PrRowView` in `client/src/lib/types.ts:38-48` already declares
  `findings:{CRITICAL,WARNING,SUGGESTION}` (currently unused) — align the contract to it

## Counting basis
Severity counts = **total findings across all review runs of a PR**, matching the
detail page's existing `allFindings = runs.flatMap(r => r.findings)`
(`pulls/[number]/page.tsx:72-77`). The list aggregate must use the same basis: count
findings joined to reviews by `prId`, `reviews.kind = 'review'`.

---

## Step 1 — contract (`@devdigest/shared`)
`server/src/vendor/shared/contracts/platform.ts` — extend `PrMeta` (~line 157):
```ts
findings: z.object({
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
}).nullish(),   // null/absent until reviewed → list renders nothing
```
One def drives both server serialization and client types (fastify-type-provider-zod).
Mirror into the client vendored copy `client/src/vendor/shared/contracts/platform.ts`
and align the unused `PrRowView.findings` shape to it.

## Step 2 — server: list endpoint breakdown
`server/src/modules/pulls/routes.ts`, `GET /repos/:id/pulls` (~lines 114-173):
- Add a third aggregate alongside `latestReviewByPr` / `costByPr`:
  ```ts
  // findings.severity COUNT per PR, across all 'review' runs
  db.select({ prId: t.reviews.prId, severity: t.findings.severity, n: count() })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
    .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
    .groupBy(t.reviews.prId, t.findings.severity)
  ```
  → build `Map<prId, {CRITICAL,WARNING,SUGGESTION}>` (default zeros).
- In the row map (~line 170) add `findings: findingsByPr.get(r.id) ?? null`.
- Update the comment at lines 116-117 (breakdown is now surfaced).
- `severity` is stored as plain `text` (no pg enum) — ignore any value not in the 3
  known keys so a stray row can't break the shape.

## Step 3 — client primitive: `SeverityCounters`
New `client/src/vendor/ui/primitives/SeverityCounters.tsx`, exported from
`vendor/ui/index.ts`. Renders the 3 severities in fixed order via `SEV` + `SeverityBadge`.
Two modes by props:
```ts
{ counts: Record<Severity, number>;
  active?: Set<Severity>;            // undefined ⇒ display-only (list)
  onToggle?: (s: Severity) => void;  // present  ⇒ interactive (detail)
  hideZero?: boolean; }
```
- Display-only → plain `SeverityBadge compact count`.
- Interactive → wrap each in a `<button>` (keyboard + `aria-pressed`); dim non-active
  when `active.size > 0`; click → `onToggle`.
- `·` separator between badges to match the mock `3 CRITICAL · 5 WARNING · 2 SUGGESTION`.

## Step 3b — shared popover: `FindingsPopoverBar`
`client/src/components/FindingsPopoverBar/` — wraps `SeverityCounters` (interactive
mode) + a click popover. Manages `openSev` (click-outside + Esc to close), and on
the open severity renders a panel: header `N <Sev> findings`, then a row per finding
(`SeverityBadge` · title · `CategoryTag` · `file:line` · `ConfidenceNum` · 2-line
rationale clamp). Props: `{ counts, findings?, loading?, onOpenSeverity?, onSelectFinding, hideZero }`.
`stopPropagation` on the wrapper so list-row navigation doesn't fire. `findings`
`undefined` ⇒ loading state (list lazy-fetch). Reuses `lineLabel` shape.

## Step 4 — client: PR list FINDINGS column
`pulls/_components/PRRow/constants.ts`: add `findings` to `COLUMN_KEYS` between
`score` and `status`; widen `GRID` (added a 150px track) — header + row share it.

`PRRow.tsx`: new cell renders `<PRRowFindings>` (new file) when `pr.findings` is
non-null, else `—`. `PRRowFindings` lazy-loads via `usePrReviews(armed ? pr.id : null)`
(armed on first popover open), flattens `reviews.flatMap(r => r.findings)`, and on
finding click `router.push('/repos/:repoId/pulls/:number?tab=findings&finding=<id>')`.

## Step 5 — client: PR detail counter + popover + deep-link focus
`FindingsTab` computes `sevCounts`/`allFindings` from `runs`. Renders
`<FindingsPopoverBar counts findings={allFindings} onSelectFinding={f => focusFinding(f.id)} hideZero />`
in the Review-runs `SectionLabel` right slot.
- `focusFinding(id)`: find the run holding the finding, drive the existing accordion
  scroll target (`setTarget({runId, n})`) to open it, then `scrollIntoView` the
  `[data-finding-id]` element (already on `FindingCard`) and add the `dd-finding-flash`
  class (~1.4s ring pulse, keyframe in `vendor/ui/styles.css`).
- `page.tsx` reads `?finding` → `focusFindingId` prop; a `useEffect([focusFindingId, runs])`
  calls `focusFinding` once reviews load (handles the list deep-link).

## Step 6 — i18n
`client/messages/<locale>/*.json` (`prReview` ns): `severityFilter.label` +
per-severity aria text. No hardcoded copy (client convention).

## Files touched
| Layer | File |
|---|---|
| contract | `server/src/vendor/shared/contracts/platform.ts` (+ client vendored copy) |
| server | `server/src/modules/pulls/routes.ts` |
| primitive | `client/src/vendor/ui/primitives/SeverityCounters.tsx` · `vendor/ui/index.ts` |
| list | `pulls/_components/PRRow/{constants.ts,PRRow.tsx,styles.ts}` |
| detail | `pulls/[number]/page.tsx` · `FindingsTab/FindingsTab.tsx` · `ReviewRunAccordion/*` · `FindingsPanel/{FindingsPanel.tsx,helpers.ts}` |
| client types | `client/src/lib/types.ts` (`PrRowView`) |
| i18n | `client/messages/<locale>/*.json` |

## Tests
- **server** `pulls/routes` (`*.it.test.ts`, testcontainers): seed PR + reviews with
  mixed-severity findings → list returns correct `findings` breakdown; PR with no
  review → `findings` null.
- **client** (vitest + jsdom, fetch mocked):
  - `SeverityCounters` renders 3 counts in order; `hideZero` drops zeros; interactive
    mode toggles `aria-pressed` and fires `onToggle`.
  - `FindingsPopoverBar` opens a popover for the clicked severity, lists the finding,
    fires `onSelectFinding` on row click, and fires `onOpenSeverity` (lazy-load hook).

## Verify end-to-end
1. `./scripts/dev.sh` (Postgres + API + web). If `relation … does not exist` →
   `cd server && pnpm db:migrate`. Seed ships PRs with reviews.
2. `cd server && pnpm typecheck && pnpm test` · `cd client && pnpm typecheck && pnpm test`
3. Browser `http://localhost:3000`:
   - PR list → FINDINGS column shows `n CRITICAL · n WARNING · n SUGGESTION` per reviewed PR.
   - Open a reviewed PR → Agent runs tab → counter bar; click CRITICAL → only CRITICAL
     cards; add WARNING → union; click again → deselect; clear all → all findings.

## Out of scope (MVP)
- Filtering the PR **list** itself by severity (counters open a popover, not a list filter).
- Persisting the open popover / focused finding beyond the `?finding` deep-link.
