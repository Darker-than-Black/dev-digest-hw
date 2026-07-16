# Smart Diff — Implementation Plan

## Context

Build a **risk-ordered diff layout** so a reviewer's eye lands on business logic
first, not on a lock file. The Files-changed tab gains a "REVIEWER-ORDERED DIFF"
panel with a `Smart order` / `Original order` toggle: PR files are classified
deterministically into **core** / **wiring** / **boilerplate**, rendered as three
grouped sections (boilerplate collapsed by default), with an **overlay** of the
last review's findings — a red dot + "N findings" badge on flagged files, severity
pills on flagged lines, and click-to-jump.

Two data sources, already live, both confirmed:

1. **`GET /pulls/:id`** (`server/src/modules/pulls/routes.ts:199-291`) → `PrDetail.files`
   = `{path, additions, deletions, patch}`, persisted to `pr_files`. This alone
   drives classification + layout. Works right after PR import.
2. **`GET /pulls/:id/reviews`** (`server/src/modules/reviews/routes.ts:129-132` →
   `ReviewService.reviewsForPull`, `service.ts:160-174`) → findings with exact
   `file` + `start_line`/`end_line` + `severity`. This is the OVERLAY. Before any
   review, the layout works and the overlay is simply absent.

**KEY PRINCIPLE — Smart Diff makes NO new model call.** The expensive LLM call
already happened in the Structured Reviewer. Smart Diff deterministically composes
existing `pr_files` rows + existing `findings` rows. No LLM adapter is touched, no
`resolveFeatureModel` slot is consumed, no `FeatureModelId` is added.

**Nothing is persisted** → **no migration, no schema change** for this feature.

## Locked product decisions

1. **Contract is frozen.** `SmartDiffRole` / `SmartDiffFile` / `SmartDiffGroup` /
   `ProposedSplit` / `SmartDiff` already exist at
   `server/src/vendor/shared/contracts/brief.ts:81-113`, and `SmartDiffResponse =
   SmartDiff` at `contracts/review-api.ts:63-65`. Client mirror is already in sync
   (`client/src/vendor/shared/contracts/brief.ts:81-113`, `review-api.ts:63-65`).
   **Do NOT redesign, extend, or re-declare it. No vendored-mirror edit is needed
   for this feature** — a first, versus every prior lesson.
2. **`SmartDiffFile` has no `patch` field — and that is deliberate.** The client
   already holds every patch via `usePullDetail` → `pr.files` (passed into
   `DiffTab` at `page.tsx:167-172`). The smart-diff response supplies **order,
   role, stats and finding_lines**; the client joins it to `PrFile.patch` **by
   `path`** for hunk rendering. Do not add `patch` to the contract to "make it
   self-contained".
3. **"Last review" = the newest `kind === 'review'` row**, by `created_at` desc.
   `repository/review.repo.ts:57-70` already orders `desc(t.reviews.createdAt)`, so
   it is `rows.find(r => r.review.kind === 'review')` server-side and
   `reviews.find(r => r.kind === 'review')` client-side (`usePrReviews` returns the
   server's order). This deliberately differs from the PR-list aggregates, which
   count **all** review runs (`modules/pulls/routes.ts:136-152`) — Smart Diff is the
   *latest* reviewer's opinion, not a lifetime tally.
4. **`pseudocode_summary` is `null` in v1.** There is no deterministic source that
   honestly produces pseudocode without an LLM call, and the key principle forbids
   one. The considered-and-rejected alternative was the trailing function-context
   text of `@@ … @@` hunk headers (`@@ -12,3 +12,4 @@ function foo() {`) — that is a
   *symbol list*, not pseudocode, and shipping it under this field name would poison
   the future `PrBrief` consumer that reads the same contract. The UI renders the
   "What this does:" line **only when non-null**, so the field is inert now and lights
   up for free when a later brief lesson's LLM pass fills it. See Open questions.
5. **`split_suggestion` UI home = a banner at the top of the panel**, above the group
   sections, rendered **only when `too_big === true`**. It is the one thing that
   argues about the PR as a whole, so it sits above the per-file layout rather than in
   a group.
6. **Classification thresholds + patterns live in one constants file** —
   `server/src/modules/smart-diff/constants.ts`. No inline literals in the classifier.
7. **No container registration.** `IntentService` is on the container
   (`platform/container.ts:130-134`) only because `run-executor.ts` needs it without
   reaching into another module's folder. Smart Diff has exactly one consumer (its own
   route), so it follows `ReviewService`'s shape: `new SmartDiffService(container)`
   inside `routes.ts` (`reviews/routes.ts:22`). Do not touch `container.ts`.

## Pre-scaffolded (reuse, do NOT recreate)

- **Contracts** — `SmartDiff*` + `SmartDiffResponse`, both packages, already mirrored
  (decision 1). Zero contract work.
- **DB reads** — `container.reviewRepo` (`platform/container.ts:103-105`) exposes
  everything needed, already workspace-scoped:
  - `getPull(workspaceId, prId)` → `repository.ts:30-32` (the scope gate)
  - `getPrFiles(prId)` → `repository.ts:38-40` → `repository/pull.repo.ts:29-34`
  - `reviewsForPull(prId)` → `repository.ts:63-65` → `repository/review.repo.ts:57-70`
    (newest-first, findings attached)
  **No new repository method, no new query, no `drizzle-orm` import in this module.**
- **Module shape** — `modules/intent/{constants,helpers,service,routes}.ts` is the
  closest sibling template (thin routes → service → `container.reviewRepo`, pure
  helpers in `helpers.ts`). `intent/routes.ts:16-19` is the exact route shape.
- **Route plumbing** — `getContext(container, req)` (`modules/_shared/context.ts`) +
  `IdParams` (`modules/_shared/schemas.ts`), used identically by
  `intent/routes.ts:16` and `reviews/routes.ts:129`.
- **Diff rendering (client)** — `components/diff-viewer/` is complete and reusable:
  `parsePatch` (`helpers.ts:12-38`), `CodeLine` (`CodeLine/CodeLine.tsx`), the `s`
  style map + `chevronFor`/`lineRowFor`/`lineSignFor` (`styles.ts`),
  `AUTO_EXPAND_MAX_LINES`/`HUNK_HEADER_RE` (`constants.ts`), `FileCard`
  (`FileCard/FileCard.tsx`), the `DiffCommentApi` inline-comment contract
  (`comments.ts`). **Do not re-parse patches or re-style diff lines.**
- **UI primitives** (`@devdigest/ui`, vendored at `client/src/vendor/ui`) —
  `SeverityBadge severity count compact` + the `SEV` token map
  (`primitives/Badge.tsx:52-88`, `primitives/tokens.ts:6-14`) for severity pills;
  `Badge dot` (`Badge.tsx:42-44`) for the red file dot; `Chip active`
  (`primitives/Chip.tsx`) for the order toggle; `Card`, `SectionLabel`, `EmptyState`,
  `disclosureProps` (`primitives/a11y.ts`, used at `FileCard.tsx:57`).
  Per `client/insights.md:19-22`: **never hand-roll severity pills.**
- **Jump-to-line pattern** — `FindingsTab.tsx:90-100` already does
  `querySelector('[data-finding-id]')` → `scrollIntoView` → add `dd-finding-flash`
  (keyframe in `vendor/ui/styles.css`). Mirror it with a line anchor.
- **Hooks** — `lib/hooks/intent.ts:11-17` is the exact `useQuery` template;
  `usePrReviews` (`lib/hooks/reviews.ts:51-57`, key `["reviews", prId]`) already
  fetches the findings the overlay needs — **do not add a second findings fetch.**

---

## Work items (ordered by dependency: BACK-END → FRONT-END)

### BACK-END

**Item 1 — server: `smart-diff` classification constants**
- Side: back-end
- Files: create `server/src/modules/smart-diff/constants.ts`
- Skills to load: `onion-architecture`, `typescript-expert`
- Reuse: pattern-list-as-constants shape from
  `modules/repo-intel/service.ts:742-762` (`JUNK_PATH_PATTERNS`, lowercase substring
  match — "deliberately simple + deterministic") and `repo-intel/constants.ts:17-26`
  (`EXCLUDED_DIRS`). Mirror that style; do **not** import from repo-intel (cross-module
  reach — its `AGENTS.md` says consume only via the `service.ts` facade, and this isn't
  on the facade).
- Steps:
  1. `SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = ['core','wiring','boilerplate']`
     — the single source of group order.
  2. `BOILERPLATE_PATTERNS` — lock files (`package-lock.json`, `pnpm-lock.yaml`,
     `yarn.lock`, `cargo.lock`, `poetry.lock`, `go.sum`), `package.json` (per the UI
     reference, which groups it under Boilerplate), generated/vendored dirs (`/dist/`,
     `/build/`, `/.next/`, `/out/`, `/coverage/`, `/node_modules/`, `/vendor/`),
     snapshots (`__snapshots__/`, `.snap`), minified/derived (`.min.js`, `.map`,
     `.d.ts`), `/migrations/meta/`, and `.md`.
  3. `WIRING_PATTERNS` — barrels (`/index.ts`, `/index.tsx`), configs (`.config.`,
     `tsconfig`, `.env`, `docker-compose`, `dockerfile`, `.github/`), registries/entry
     points (`/routes.ts`), and tests (`.test.`, `.spec.`, `__tests__/`).
  4. Both are `as const` **lowercase** substring arrays; document that match order is
     boilerplate → wiring → core, and that `package-lock.json` must be matched before
     any `package` rule.
  5. `SPLIT_TOO_BIG_LINES = 400` (total `additions + deletions` across the PR above
     which `too_big` fires) and `SPLIT_MIN_SEGMENTS = 2` (minimum distinct top-level
     dirs required to propose a split at all). Both documented as tunables.
  6. JSDoc header stating: these are heuristics, deliberately substring-based, and the
     ONLY place a reviewer should tune ordering behaviour.
- Accept: `cd server && pnpm typecheck` passes; file contains zero logic (data + types
  only); no import from `db/`, `drizzle-orm`, or `repo-intel`.

**Item 2 — server: `smart-diff` pure helpers (classify + compose)**
- Side: back-end
- Files: create `server/src/modules/smart-diff/helpers.ts`
- Skills to load: `onion-architecture`, `typescript-expert`, `zod`
- Reuse: `modules/intent/helpers.ts` for the house shape — pure, no DB/fs/network, a
  local structural interface (`PrFileHeaders`, `helpers.ts:62-65`) instead of importing
  a Drizzle row type. Do the same here.
- Steps:
  1. Local input interfaces (no DB row import):
     `SmartDiffInputFile { path: string; additions: number; deletions: number }` and
     `SmartDiffInputFinding { file: string; start_line: number }`.
  2. `classifyFile(path: string): SmartDiffRole` — lowercase the path once; first match
     wins in order boilerplate → wiring → core; default `'core'`. Pure, exported,
     directly unit-testable.
  3. `findingLinesFor(path, findings): number[]` — filter findings by **exact** `file`
     match against the PR-file path, map `start_line`, dedupe via `Set`, sort ascending.
     Only `start_line` (never the `start_line..end_line` range — a wide range would
     explode the array and the UI anchors on the start line anyway). Findings whose
     `file` matches no PR file are dropped silently; the reviewer's grounding gate
     already constrains them to the diff.
  4. `buildGroups(files, findings): SmartDiffGroup[]` — classify each file → build a
     `SmartDiffFile { path, pseudocode_summary: null, additions, deletions,
     finding_lines }` → bucket by role → emit **one group per role in
     `SMART_DIFF_ROLE_ORDER`, always all three, even when empty** (a stable shape the
     client can render without existence checks). Within a group sort by
     **(finding_lines.length desc, additions+deletions desc, path asc)** — risk first,
     then churn, `path` as the deterministic tiebreak.
  5. `buildSplitSuggestion(files): SmartDiff['split_suggestion']` —
     `total_lines = Σ(additions + deletions)` over **all** files;
     `too_big = total_lines > SPLIT_TOO_BIG_LINES`. When `too_big`, group the
     **non-boilerplate** files by their **first path segment** (`server`, `client`, …;
     files at the repo root → `"root"`); emit one `ProposedSplit { name: segment,
     files: [...] }` per segment, sorted by file count desc then name asc — but only if
     there are `>= SPLIT_MIN_SEGMENTS` segments, else `proposed_splits: []`. When
     `!too_big`, always `proposed_splits: []`. Never returns null — the contract has no
     nullable here.
  6. `composeSmartDiff(files, findings): SmartDiff` — `{ groups: buildGroups(...),
     split_suggestion: buildSplitSuggestion(files) }`.
- Accept: `cd server && pnpm typecheck` passes. Hermetic unit test (`helpers.test.ts`,
  no DB) asserts: `package-lock.json`→boilerplate, `client/src/lib/hooks/index.ts`→
  wiring, `server/src/modules/reviews/service.ts`→core, `Server/DIST/x.js`→boilerplate
  (case-insensitive); all three groups present when a role has zero files; a file with
  2 findings on the same line yields ONE entry in `finding_lines`; risk-first ordering;
  `too_big:false` → `proposed_splits: []`; a 1-segment large PR → `too_big:true` with
  empty splits. No import of `drizzle-orm`, `db/`, `fs`, or any adapter.

**Item 3 — server: `SmartDiffService` + `GET /pulls/:id/smart-diff` route**
- Side: back-end (route = input boundary → `security` is mandatory per
  `docs/skill-map.md`)
- Files: create `server/src/modules/smart-diff/{service.ts,routes.ts}`; edit
  `server/src/modules/index.ts`
- Skills to load: `onion-architecture`, `fastify-best-practices`, `security`, `zod`
- Reuse: `modules/intent/service.ts:20-29` (scope-gate shape) and
  `modules/intent/routes.ts:11-19` (thin route). DB **only** via
  `container.reviewRepo` — never a new repo, never `container.db`.
- Steps:
  1. `service.ts` — `export class SmartDiffService { constructor(private container: Container) {} }`.
     `async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiffResponse>`:
     - `const pull = await this.container.reviewRepo.getPull(workspaceId, prId)`;
       `if (!pull) throw new NotFoundError('Pull request not found')`. **This is the
       authorization gate** — it is the same gate `IntentService.getIntent`
       (`intent/service.ts:25-26`) and `ReviewService.reviewsForPull`
       (`reviews/service.ts:161-162`) use. Never read `pr_files` before it passes.
     - `const prFiles = await this.container.reviewRepo.getPrFiles(prId)`.
     - `const rows = await this.container.reviewRepo.reviewsForPull(prId)`;
       `const last = rows.find(r => r.review.kind === 'review')` (newest-first is
       guaranteed by `review.repo.ts:66`); `const findings = last?.findings ?? []`.
       **Zero reviews → `findings = []` → every `finding_lines` empty → layout without
       overlay.** This is the required pre-review behaviour, not an error.
     - Map the Drizzle rows to the helpers' local interfaces (`{path, additions,
       deletions}` and `{file: f.file, start_line: f.startLine}` — note the row is
       camelCase, `helpers.ts:34-52` in reviews shows the same mapping direction), then
       `return composeSmartDiff(files, findings)`.
     - No LLM, no `resolveFeatureModel`, no `container.llm`, no `container.github()`.
       If any of those appear in this file, the item is wrong.
  2. `routes.ts` — mirror `intent/routes.ts` exactly:
     `export default async function smartDiffRoutes(appBase: FastifyInstance)`,
     `const app = appBase.withTypeProvider<ZodTypeProvider>()`,
     `const service = new SmartDiffService(container)`, then
     `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req):
     Promise<SmartDiffResponse> => { const { workspaceId } = await getContext(container,
     req); return service.getSmartDiff(workspaceId, req.params.id); })`.
     **No `rateLimit` config** — this is a cheap DB-only read, unlike
     `reviews/routes.ts:29` and `intent/routes.ts:24`, which are throttled precisely
     because they fan out to LLM calls. Adding one here would signal a cost that
     doesn't exist. The typed return + the existing `SmartDiffResponse` contract are the
     serialization surface; do not add a `response:` schema — no sibling module does
     (`intent/routes.ts`, `reviews/routes.ts`, `pulls/routes.ts`), and introducing
     Fastify response serialization on one route only invites silent field-stripping
     divergence.
  3. `modules/index.ts` — one import (`import smartDiff from './smart-diff/routes.js';`)
     + one entry in the `modules` record (`index.ts:27-39`). The doc-comment at
     `index.ts:25` already names "intent/smart-diff" as a coming lesson module.
- Accept: `cd server && pnpm typecheck` passes. Hermetic test with a fake `reviewRepo`
  asserts: unknown/other-workspace `prId` → `NotFoundError` (404); PR with files and
  **no** reviews → all three groups, every `finding_lines: []`; PR with two reviews →
  only the **newest** review's findings land in `finding_lines`; a `kind:'summary'` row
  newer than the `kind:'review'` row is **skipped**. `*.it.test.ts` only if DB-backed
  (per `server/AGENTS.md`). Grep the module: no `drizzle-orm`, no `db/schema`, no
  `container.db`, no `container.llm`.

### FRONT-END

**Item 4 — client: `useSmartDiff` hook + `lastReview` helper**
- Side: front-end
- Files: create `client/src/lib/smart-diff.ts`; edit `client/src/lib/hooks/reviews.ts`,
  `client/src/lib/hooks/index.ts`
- Skills to load: `ui-architecture`, `react-best-practices`, `zod`
- Reuse: `lib/hooks/intent.ts:11-17` (query template); `usePrReviews`
  (`hooks/reviews.ts:51-57`) — already fetches what the overlay needs.
- Steps:
  1. `lib/smart-diff.ts` (pure, framework-free — `ui-architecture` §4 tier 1):
     - `lastReview(reviews: ReviewRecord[] | undefined): ReviewRecord | null` —
       `reviews?.find(r => r.kind === 'review') ?? null`. **This mirrors the server's
       decision 3 rule and MUST stay in lockstep with `SmartDiffService`.** Put that
       sentence in the JSDoc.
     - `findingsByLine(review: ReviewRecord | null, path: string):
       Map<number, FindingRecord[]>` — group the review's findings for one file by
       `start_line`. Used for per-line severity pills and per-file counts.
     - `topSeverity(findings: FindingRecord[]): Severity` — highest of
       CRITICAL > WARNING > SUGGESTION, for the collapsed-row pill.
     - `import type` only from `@devdigest/shared` — never a runtime value import
       (`client/insights.md:114-123`: it bundles the vendored barrel and breaks the
       webpack build).
  2. `hooks/reviews.ts` — add
     `useSmartDiff(prId: string | null | undefined)`:
     `useQuery({ queryKey: ["smart-diff", prId], queryFn: () =>
     api.get<SmartDiffResponse>(\`/pulls/${prId}/smart-diff\`), enabled: !!prId })`.
     Placed here (not a new file) because it is review-adjacent and shares the PR
     domain — matches how `usePrComments` lives beside `usePrReviews`.
  3. Invalidate `["smart-diff", prId]` alongside `["reviews", prId]` in `useRunReview`
     `onSuccess` (`hooks/reviews.ts:132-135`), `useDeleteReview` (`:85`) and
     `useDeleteRun` (`:66-69`) — a finished/deleted review changes `finding_lines`, and
     without this the overlay goes stale until reload.
  4. `hooks/index.ts` — no change needed if it already re-exports `./reviews`; verify.
- Accept: `cd client && pnpm typecheck` passes; hook test with mocked `api` returns the
  response and skips when `prId` is null; `lastReview` unit test picks the first
  `kind:'review'` past a newer `kind:'summary'`; running a review invalidates
  `["smart-diff", prId]`.

**Item 5 — client: `SmartDiffViewer` + group sections + split banner**
- Side: front-end
- Files: create
  `client/src/components/diff-viewer/SmartDiffViewer/{SmartDiffViewer.tsx,index.ts,SmartDiffViewer.test.tsx}`,
  `client/src/components/diff-viewer/SmartDiffGroupSection/{SmartDiffGroupSection.tsx,index.ts}`,
  `client/src/components/diff-viewer/SmartDiffFileCard/{SmartDiffFileCard.tsx,index.ts}`,
  `client/src/components/diff-viewer/SplitSuggestionBanner/{SplitSuggestionBanner.tsx,index.ts}`;
  edit `client/src/components/diff-viewer/constants.ts`,
  `client/src/components/diff-viewer/styles.ts`,
  `client/src/components/diff-viewer/index.ts`, `client/messages/en/shell.json`
- Skills to load: `ui-architecture`, `react-best-practices`, `next-best-practices`,
  `react-testing-library`, `zod`
- Reuse: `parsePatch` (`diff-viewer/helpers.ts:12-38`), `CodeLine`
  (`CodeLine/CodeLine.tsx`), `s`/`chevronFor`/`lineRowFor` (`diff-viewer/styles.ts`),
  `AUTO_EXPAND_MAX_LINES` (`constants.ts:4`), `disclosureProps`, `SeverityBadge`,
  `Badge dot`, `SEV`. `FileCard.tsx` is the structural model for `SmartDiffFileCard`.
- **Placement rationale (deliberate deviation from `ui-architecture` §1's
  "promote on the 2nd consumer"):** these components live in the shared
  `components/diff-viewer/` folder, not route-local `_components/`, because they need
  five of that folder's **internals** (`parsePatch`, `CodeLine`, `s`, `chevronFor`,
  `AUTO_EXPAND_MAX_LINES`) which the barrel deliberately does not export
  (`diff-viewer/index.ts:3-4` exports only `DiffViewer` + `DiffCommentApi`). Putting
  them route-local would force widening that barrel with 5 internal exports — strictly
  worse encapsulation than colocating a second renderer inside the folder that owns
  diff rendering. The barrel grows by exactly one component + its prop type.
- Steps:
  1. `constants.ts` — add `SMART_DIFF_ROLE_META: Record<SmartDiffRole, { dot: string;
     order: number }>` mapping role → CSS-var dot colour (`core` → `var(--crit)`,
     `wiring` → `var(--warn)`, `boilerplate` → `var(--text-muted)`) and
     `BOILERPLATE_DEFAULT_OPEN = false`. **Titles and hints are copy, not constants** —
     they go in `messages/` (`client/AGENTS.md`: no hardcoded copy;
     `ui-architecture` §5).
  2. `messages/en/shell.json` — under the existing `diffViewer` key (the folder already
     uses `useTranslations("shell")`, `DiffViewer.tsx:21`, `FileCard.tsx:34`) add
     `smartDiff.title` ("Reviewer-ordered diff"), `smartDiff.order.smart` /
     `.order.original`, `smartDiff.role.core.{title,hint}` ("Core logic" / "The
     substance of the change — review closely"), `.role.wiring.{title,hint}`
     ("Wiring" / "Hooks the core into the app"), `.role.boilerplate.{title,hint}`
     ("Boilerplate" / "Generated / mechanical — skim"), `smartDiff.fileCount`,
     `smartDiff.findingCount` ("{count} findings"), `smartDiff.split.*`. Mirror to the
     other locales present under `client/messages/`.
  3. `SplitSuggestionBanner.tsx` — props `{ split: SmartDiff['split_suggestion'] }`.
     Presentational. Returns `null` when `!split.too_big`. Renders total_lines + each
     `ProposedSplit` (name + file count, files behind a disclosure). `Card` + `Badge`.
  4. `SmartDiffFileCard.tsx` — props
     `{ file: SmartDiffFile; patch: string | null; role: SmartDiffRole; findings:
     FindingRecord[]; defaultOpen: boolean; commenting?: DiffCommentApi }`.
     Presentational. Structure copied from `FileCard.tsx:55-95`:
     - Header: `disclosureProps` chevron, `Icon.FileText`, mono path, a red
       `Badge dot` when `findings.length > 0`, `+{additions} −{deletions}` via
       `s.addText`/`s.delText`, and a **clickable** `SeverityBadge severity={topSeverity}
       count={findings.length} compact` acting as the "N findings" badge.
     - `open` initial value = `defaultOpen` prop (**derived by the parent, not
       re-derived here** — `react-best-practices` derive-don't-store).
     - Body: `parsePatch(patch)` → `useMemo` → `lines.map(...)` → `<CodeLine>`; when a
       line's `newNo` is in `findingsByLine`, wrap it with a colored **left gutter bar**
       (role/severity colour from `SEV`) and a right-aligned inline `SeverityBadge`
       pill, and set ``data-diff-line={`${file.path}:${newNo}`}`` as the jump anchor.
     - `parsePatch(null)` already returns `[]` → the existing `noDiff` copy path renders
       (`FileCard.tsx:78-80`). Keep that degrade.
  5. `SmartDiffGroupSection.tsx` — props `{ group: SmartDiffGroup; patches: Map<string,
     string | null>; findingsFor: (path) => FindingRecord[]; commenting? }`.
     Presentational. Renders the colored dot + `t(role.title)` + `t(role.hint)` +
     right-aligned file count, then the file cards. **Per-file `defaultOpen` rule
     (compute here, one place):** `file.finding_lines.length > 0` → **always open**
     (a flagged file must never hide, in any group — this is the whole point of the
     feature); else `core`/`wiring` → open when `additions + deletions <=
     AUTO_EXPAND_MAX_LINES`; else `boilerplate` → `BOILERPLATE_DEFAULT_OPEN` (false).
  6. `SmartDiffViewer.tsx` — `"use client"`. Props
     `{ smartDiff: SmartDiffResponse; files: PrFile[]; review: ReviewRecord | null;
     commenting?: DiffCommentApi }`. **Presentational — it calls no data hook**; the
     route container (Item 6) owns fetching. Build `patches = useMemo(() => new
     Map(files.map(f => [f.path, f.patch])), [files])` — this is the by-path join from
     decision 2. Render `<SplitSuggestionBanner>` then
     `smartDiff.groups.map(g => <SmartDiffGroupSection …>)`, **skipping groups with zero
     files** (the server always sends all three; empty sections are visual noise).
  7. Jump-to-line: clicking the header findings badge scrolls to the file's first
     `finding_lines` entry. Mirror `FindingsTab.tsx:91-100` exactly — open the card,
     then `setTimeout(…, 320)` → `document.querySelector('[data-diff-line="…"]')` →
     `scrollIntoView({behavior:'smooth', block:'center'})` → add `dd-finding-flash`,
     remove after 1500ms. Reuse the existing keyframe in `vendor/ui/styles.css`; do not
     add a new animation.
  8. `diff-viewer/index.ts` — export `SmartDiffViewer` only (keep the barrel narrow).
  9. A11y: the badge is a real `<button>` with an `aria-label` from `messages`; group
     dots are `aria-hidden` (colour is never the only signal — the title carries it);
     severity pills already ship icon+label via `SeverityBadge`.
- Accept: `cd client && pnpm typecheck` passes; `pnpm test` RTL covers — boilerplate
  group collapsed by default; a boilerplate file **with** findings expanded anyway; the
  red dot + "N findings" badge present only on files with `finding_lines`; badge click
  fires `scrollIntoView` (jsdom spy); `too_big:false` → no banner; a file whose `patch`
  is null renders the `noDiff` copy, not a crash; no hardcoded user-facing string in any
  new `.tsx`.

**Item 6 — client: wire the toggle into `DiffTab`**
- Side: front-end
- Files: edit
  `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`
- Skills to load: `ui-architecture`, `react-best-practices`, `react-testing-library`
- Reuse: `Chip active` (`primitives/Chip.tsx`) for the two-option segmented toggle
  (`Toggle` at `primitives/Toggle.tsx` is a boolean **switch** — wrong affordance for a
  labelled `Smart order` / `Original order` pair); the existing `SectionLabel right={…}`
  slot (`DiffTab.tsx:45-59`) is where the toggle goes.
- Steps:
  1. `DiffTab` stays the **container tier** (`client/insights.md:71-76`) — it already
     owns `usePrComments`/`useCreatePrComment` and receives `files` + `prId` from
     `page.tsx:167-172`. Add `useSmartDiff(prId)` and `usePrReviews(prId)`, then
     `const review = lastReview(reviewsData)`.
  2. Ephemeral UI state: `const [smartOrder, setSmartOrder] = React.useState(true)` —
     smart order is the default (the feature's entire premise). Local `useState`, **not**
     `searchParams`: it is a view preference on an already-URL-addressed tab, not
     shareable state (`ui-architecture` §6).
  3. Render the two `Chip`s in the `SectionLabel` `right` slot alongside the existing
     show/hide-comments `Button`. Disable the `Smart order` chip while
     `smartDiffQuery.isLoading` or on error, and fall back to `<DiffViewer>` — the smart
     panel must never be the reason the tab shows nothing.
  4. Body: `smartOrder && smartDiff ? <SmartDiffViewer smartDiff={smartDiff}
     files={files} review={review} commenting={commenting} /> : <DiffViewer files={files}
     commenting={commenting} />`. **Pass the same `commenting` object to both** — inline
     GitHub commenting must keep working in smart order (`DiffCommentApi` is already the
     seam, `DiffTab.tsx:26-41`).
  5. Header copy: the existing `Files changed · {filesCount} files` line
     (`DiffTab.tsx:60`) is currently **hardcoded** despite `client/AGENTS.md`'s no-copy
     rule. While editing this line to add the `+{additions} −{deletions}` totals from
     the UI reference, move it into `messages/en/shell.json` too — a one-line
     opportunistic fix, in scope.
- Accept: `cd client && pnpm typecheck && pnpm build` pass (stop `next dev` first —
  `client/insights.md:125-129`); RTL: default render is smart order, clicking
  `Original order` renders the flat `DiffViewer`, a failing smart-diff query still
  renders the flat viewer; manual: comments still post in both orders.

---

## Risks & gotchas

- **No migration, and don't let anyone add one (CRITICAL).** Smart Diff persists
  nothing — it is a pure read-compose over `pr_files` + `findings`. There is no
  `smart_diff` table and none is needed. Do **not** run `pnpm db:generate`. If
  `relation "pr_files" does not exist` appears, that is the standing no-auto-migrate
  gotcha (`AGENTS.md`) → `cd server && pnpm db:migrate`. Also recall
  `server/insights.md:114-119`: `drizzle-kit generate`'s rename resolver is
  **interactive** and hangs on piped stdin — one more reason not to touch it here.
- **Onion purity (CRITICAL).** `modules/smart-diff/` must never import `drizzle-orm`,
  `db/schema`, or touch `container.db`. All DB access goes through
  `container.reviewRepo` — the declared owner of `reviews`/`findings`/`pr_files`
  (`reviews/repository.ts:5-14`). `helpers.ts` must stay pure (no fs/network/DB), taking
  local structural interfaces, exactly like `intent/helpers.ts:62-65`. Note that
  `modules/pulls/routes.ts` queries Drizzle **directly in the route** — that is a
  pre-existing wart; **do not copy it**, and do not "fix" it in this PR. The
  `pr-self-review` gate treats a layer violation as critical.
- **Authorization ordering (CRITICAL, security).** `getPull(workspaceId, prId)` is the
  ONLY workspace gate — `getPrFiles(prId)` and `reviewsForPull(prId)` are
  **unscoped by design** (`pull.repo.ts:29-34`, `review.repo.ts:57-70`). Read `getPull`
  first and `throw NotFoundError` before either. Reversing the order leaks another
  workspace's file paths and findings on a guessed id. This is the one thing to get
  right in Item 3.
- **`GET /pulls/:id/smart-diff` depends on `GET /pulls/:id` having run first.**
  `pr_files` is populated (delete + reinsert) only by the PR-detail route
  (`pulls/routes.ts:221-232`), and only when a GitHub token exists; offline it serves
  whatever is persisted (`:260-289`). A never-opened PR → empty `pr_files` → three
  empty groups. On the PR page this is a non-issue (`usePullDetail` fires first), but a
  cold curl against the endpoint can legitimately return empty. Return 200 with empty
  groups; do not invent an error.
- **Seeded PR #482 has `pr_files.patch = NULL`** (`server/insights.md:76-84`). Smart
  Diff will classify and order it fine (path/additions/deletions are present) but every
  card renders the `noDiff` copy. That is correct degradation, not a bug — verify
  against a PR with real `@@` hunks before concluding the renderer is broken.
- **"Last review" rule is duplicated server- and client-side** (decision 3:
  `SmartDiffService` picks it for `finding_lines`; `lastReview()` picks it for the
  pills). If they drift, a file shows a red dot with no pill, or vice-versa. Both
  JSDocs must name each other. A shared helper is impossible without a runtime value
  import from `@devdigest/shared`, which breaks the webpack build
  (`client/insights.md:114-123`) — so lockstep-by-convention is the accepted cost. Any
  future change to the rule edits both.
- **`SeverityCounters`' `Sev`, not `@devdigest/ui`'s `Severity`.** The ui `Severity` has
  4 values (adds `INFO`); the shared contract has 3. A callback typed with ui's
  `Severity` is not assignable from the shared one (param contravariance) —
  `client/insights.md:89-94`. Use the 3-value `Sev` for anything interactive.
- **No contract edit → no double-mirror trap.** Every prior lesson tripped on
  "contracts are vendored twice" (`client/insights.md:28-38`). This one shouldn't:
  `SmartDiff*` + `SmartDiffResponse` are already byte-identical in both copies
  (verified). If you find yourself editing `vendor/shared/contracts/brief.ts`, stop —
  you're redesigning the contract, which decision 1 forbids.
- **The temptation to add an LLM call.** `pseudocode_summary`, better `proposed_splits`,
  and smarter classification all *want* a model. The lesson's entire point is that they
  don't get one. Any `container.llm`, `resolveFeatureModel`, or new `FeatureModelId` in
  this PR is a design failure, not a nice-to-have.
- **Classification is heuristic and will be wrong sometimes.** A `.md` under
  `boilerplate` or a test under `wiring` is a judgement call, not a fact. That is exactly
  why Item 1 isolates it: retuning must be a one-file edit, never a hunt through the
  classifier. Do not scatter patterns into `helpers.ts`.
- **Barrel widening.** `diff-viewer/index.ts` currently exports 2 symbols. Export
  `SmartDiffViewer` and nothing else; internals (`parsePatch`, `CodeLine`, `s`) stay
  private to the folder — that privacy is the whole reason Item 5 lives inside it.
- **pr-self-review push gate.** It will load `onion-architecture` + `security` for
  `server/**` and `ui-architecture` + `react-*` for `client/**`. The layer rule and the
  `getPull`-first gate are the two critical-severity candidates here. Satisfy it —
  never bypass it.
- **Course-lesson context.** Starter ≠ full product. `modules/index.ts:25` already names
  "intent/smart-diff" as a planned module, and the `PrBrief` contract
  (`brief.ts:116-122`) composes `intent`/`blast`/`risks`/`history` — but **not**
  `SmartDiff`. Don't "fix" `PrBrief` to include it; that's a later lesson's call.

## Verification

- **Static:** `cd server && pnpm typecheck`; `cd client && pnpm typecheck`;
  `cd client && pnpm build` (**stop `next dev` first** — a prod build against a live dev
  server corrupts `.next` and 500s every route, `client/insights.md:125-129`).
  `reviewer-core` is untouched — if you built it, you changed something you shouldn't have.
- **Unit (hermetic, no DB):** `server` — `classifyFile` truth table (lock file, barrel,
  service, uppercase path), `buildGroups` ordering + always-three-groups, `finding_lines`
  dedupe, `buildSplitSuggestion` on/off + single-segment; `SmartDiffService` with a fake
  `reviewRepo` for the 404 gate, no-reviews, and newest-review-wins (incl. a newer
  `kind:'summary'` being skipped). Keep these out of `*.it.test.ts` — they need no
  Postgres (`server/AGENTS.md`). `client` — `lastReview`/`findingsByLine`/`topSeverity`
  units; RTL for `SmartDiffViewer` and `DiffTab` per Items 5–6.
- **Grep gates (cheap, run them):** in `server/src/modules/smart-diff/` —
  zero hits for `drizzle-orm`, `db/schema`, `container.db`, `container.llm`,
  `resolveFeatureModel`, `container.github`. In `client/src/components/diff-viewer/
  SmartDiff*` — zero hardcoded user-facing strings; zero non-`type` imports from
  `@devdigest/shared`.
- **E2E (`./scripts/dev.sh`):**
  1. Open a repo → a PR with a real diff → **Files changed** tab. Panel renders in
     `Smart order` by default: three sections in core → wiring → boilerplate order,
     boilerplate collapsed, header shows `N files +A −D`.
  2. Toggle `Original order` → the flat `DiffViewer` returns, same files. Toggle back.
  3. **Pre-review overlay check:** on a PR with no reviews, `curl
     localhost:3001/pulls/<id>/smart-diff` → all `finding_lines: []`, no red dots, no
     badges — but the layout is fully there. This is requirement 2's core claim.
  4. **Run Review** → on SSE done, the panel refreshes **without a reload** (Item 4's
     invalidation): red dots + "N findings" badges appear on flagged files, a flagged
     **boilerplate** file is expanded despite the collapse default, severity pills sit
     right-aligned on the flagged lines with the gutter bar.
  5. Click a "N findings" badge → scrolls to and flashes that line.
  6. **Cost check — the load-bearing one:** confirm the run's `agent_runs` row shows
     **no** cost delta from smart-diff and the server log shows no new LLM call for this
     endpoint. Smart Diff must be free.
  7. Split banner: on a PR over `SPLIT_TOO_BIG_LINES` spanning ≥2 top-level dirs, the
     banner appears with proposed splits; on a small PR it is absent.
  8. Inline commenting still works in smart order (post one; it appears).
  9. Negative: a PR with `pr_files.patch = NULL` (seed #482) → ordered layout, `noDiff`
     copy per card, no crash.
- **Pre-push:** run `pr-self-review`; resolve every critical/major before
  `gh pr create`. Expect it to look hardest at the `getPull`-first gate and the
  smart-diff module's import list.
- **Session close:** run `engineering-insights` — `server/insights.md` and
  `client/insights.md` both have standing open questions from the Intent pass; the
  "no-LLM composition module" shape and the duplicated last-review rule are the two
  lessons worth recording.

## Open questions

1. **`pseudocode_summary` stays null (decision 4).** If you want the "What this does:"
   line populated in v1 *without* an LLM, the only deterministic source is the trailing
   function-context text of `@@ … @@` headers — extract it with `/^@@ .* @@.*$/gm`
   directly off `pr_files.patch`, **never** via `parseUnifiedDiff`, which drops that
   text (`server/insights.md:128-133`). I recommend against it under this field name.
   Say the word and it becomes a 10-line addition to Item 2.
2. **Test classification.** Locked to `wiring` (Item 1), which is arguable — a test file
   is not "wiring the core into the app", but there is no 4th role in the frozen
   contract and tests shouldn't outrank business logic. One-line constants change if you
   disagree. Same question for `.md` → `boilerplate`.
3. **Multi-agent PRs.** When several agents review one PR, "last review" = one agent's
   pass, so another agent's findings are invisible in the overlay. The PR-list
   aggregates instead count **all** runs (`pulls/routes.ts:136-152`). I locked
   last-review-only per your requirement 2 ("findings from the LAST review"), but flag
   the inconsistency — the alternative is "all findings from the latest run *batch*",
   which needs a run-batch concept that doesn't exist yet.
4. **`SPLIT_TOO_BIG_LINES = 400`** is my invention — no existing threshold in the repo
   informed it. Tune freely; it's isolated in Item 1.
5. **Unconfirmed:** I did not verify which locales exist beyond `en/` under
   `client/messages/`, so Item 5 step 2 says "mirror to the other locales present"
   rather than naming them. I also did not read `SectionLabel`'s prop signature — Item 6
   assumes the `right` slot accepts arbitrary nodes, which `DiffTab.tsx:45-59` and
   `FindingsTab.tsx:175-191` both demonstrate but I did not confirm at the definition.
