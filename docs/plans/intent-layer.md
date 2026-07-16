# Intent Layer — Implementation Plan

## Context

Add an **Intent Layer**: a separate, cheap (flash-class) LLM call that derives a
structured `Intent { intent, in_scope[], out_of_scope[] }` from a PR's title +
body + linked-issue ref (parsed from body) + a **file list with hunk headers
only (no diff bodies)**. The intent is persisted per-PR, auto-computed on the
first review run (with a manual recompute button), injected into the main review
agent's prompt with a "stay in scope; if you see a serious out-of-scope problem
emit ONE signal finding, not twenty" rule, and shown as an Intent card on the PR
page. Tokens saved by omitting diff bodies are logged.

Almost all data plumbing is **pre-scaffolded** (table, contracts, repository
methods, settings picker, injection-guard text) but has **zero callers** — this
feature wires the dead scaffolding into a live path.

## Locked product decisions

1. **Model config** = GLOBAL app setting via the existing Settings UI. The
   `review_intent` `FeatureModelId` picker already exists end-to-end (client
   `SettingsModels` + `FEATURE_MODELS['review_intent']`, server
   `resolveFeatureModel`). Do NOT rebuild settings UI. Classifier calls
   `resolveFeatureModel(container, workspaceId, 'review_intent')`.
2. **Trigger** = AUTO on first review run (compute-if-missing) PLUS a manual
   recompute button on the Intent card.
3. **Spec sources (UPDATED)** = the classifier MUST take a linked plan/spec into
   account. Gather spec text from THREE sources, all best-effort:
   - **(a) inline** — the PR body itself (plan/spec written directly in body).
   - **(b) repo file** — a plan/spec file referenced by a repo-relative path in
     the body (e.g. `docs/plans/*.md`, `specs/*.md`). Read from the local clone.
   - **(c) GitHub issue** — the `#123` linked issue: fetch its title+body.
   External URLs (Notion / Google Doc) are OUT OF SCOPE for v1.
   Long combined spec → **compress with a second cheap LLM call** before deriving.
4. **Contract** = keep `Intent` field named `intent` (already shipped) — do NOT
   rename to `summary`. Risk areas are OUT OF SCOPE for v1 (separate `Risks`
   contract) — do not extend `Intent`.

## Pre-scaffolded (reuse, do NOT recreate)

- DB table `pr_intent`: `server/src/db/schema/reviews.ts:48-55` (cols
  intent/inScope/outOfScope, 1:1 on prId). Migrated in
  `server/src/db/migrations/0000_init.sql`. **NO new migration needed.**
- Zod `Intent`: `server/src/vendor/shared/contracts/brief.ts:9-14`.
  `PrIntentRecord = Intent.extend({ pr_id })` at `contracts/review-api.ts:59-61`.
  Client mirror `client/src/vendor/shared/contracts/{brief,review-api}.ts`.
- Repository methods (DEAD CODE): `upsertIntent`/`getIntent` facade
  `server/src/modules/reviews/repository.ts:130-136`, impl
  `repository/pull.repo.ts:49-68`.
- Settings picker: server `review_intent` in `FeatureModelId`
  `contracts/platform.ts:14-21,51-57`; `resolveFeatureModel`
  `modules/settings/feature-models.ts:36-57`; `PUT /settings` persists
  `feature_models.review_intent` `modules/settings/routes.ts:49-66`. Client
  picker `SettingsModels.tsx:20-75` + registry `client/src/lib/feature-models.ts:22-27`.
- Injection defense already anticipates intent: `INJECTION_GUARD`
  `reviewer-core/src/prompt.ts:16-28` (line 18 names "derived intent/scope").

---

## Work items (ordered by dependency: engine → server → client)

### BACK-END

**Item 1 — reviewer-core: `deriveIntent()` pure deriver**
- Files: create `reviewer-core/src/intent.ts`; edit `reviewer-core/src/index.ts`
- Skills: `onion-architecture`, `typescript-expert`, `zod`
- Steps:
  1. `DeriveIntentInput { llm, model, title, body?, issueSpec?, fileList, sessionId? }`,
     `DeriveIntentOutcome { intent, tokensIn, tokensOut, costUsd, raw }`.
  2. Trusted system prompt ("classify a PR's intent/scope from metadata only; NOT
     reviewing code") + user message whose title/body/issue/file-list segments
     each `wrapUntrusted()`. Pure: NO diff bodies, NO DB, NO fs.
  3. `llm.completeStructured<Intent>({ model, schema: Intent, schemaName:'Intent',
     messages, temperature:0, ...(sessionId?{sessionId}:{}) })`; return data + stats.
- Accept: `cd reviewer-core && pnpm build` passes; unit test w/ mock LLMProvider
  returns parsed Intent + stats; no fs/DB/octokit/git import in file.

**Item 2 — reviewer-core: `PromptParts.intent` slot + scope instruction**
- Files: edit `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`
- Skills: `onion-architecture`, `security`, `typescript-expert`
- Steps:
  1. Add `intent?: string` to `PromptParts` (`prompt.ts:39-73`).
  2. In `assemblePrompt` (`prompt.ts:104-120`), when non-empty push `## Review scope`:
     ONE trusted instruction line (NOT wrapped) — *"Focus your review on the PR's
     stated intent below. Do not comment on issues outside this scope. If you find
     a serious defect that is genuinely out of scope, emit exactly ONE signal
     finding flagging it — not many."* — then `wrapUntrusted('intent', parts.intent)`.
     Render after `## PR description`, before diff.
  3. Add `intent?: string` to `ReviewInput` (`run.ts:44-93`), thread into
     `promptParts` (`run.ts:130-139`). No LLM call-site change.
- Accept: reviewer-core `pnpm build` passes; test: (a) omitted → prompt
  byte-identical to today, (b) present → section appears, instruction outside
  `<untrusted>`, intent text inside.

**Item 3 — server: `modules/intent/` service + routes**
- Files: create `server/src/modules/intent/{service.ts,routes.ts,constants.ts,helpers.ts,spec-gather.ts}`;
  edit `server/src/modules/index.ts`
- Skills: `onion-architecture`, `fastify-best-practices`, `security`, `zod`
- Template: `modules/conventions/service.ts:50-104`. DB via `container.reviewRepo`.
- Confirmed integrations (from research):
  - Repo file read: `container.repoIntel.readFiles(repoId, paths) → Array<{path, content: string|null}>`
    (`modules/repo-intel/service.ts:640-661`, non-throwing, `null` if disabled/uncloned).
    Gated by `config.repoIntelEnabled` — confirm default before assuming reads work.
  - GitHub issue: `const gh = await container.github(); await gh.getIssue(repo, n)`
    (`adapters/github/octokit.ts:351-364`, returns `{number,title,body,state}`).
    `container.github()` THROWS `ConfigError` when no token — wrap in try/catch,
    degrade to "no issue" (mirror `pulls/routes.ts:33-39`).
  - Issue regex reuse: `/(?:closes|fixes|resolves)?\s*#(\d+)/i` (`octokit.ts:128`).
  - Tokenizer: `container.tokenizer.count(text)` (non-throwing).
- Steps:
  1. `constants.ts`: `INTENT_FEATURE_ID: FeatureModelId = 'review_intent'`;
     `SPEC_TOKEN_CAP` (compress above this, e.g. ~4k); `MAX_SPEC_CHARS` hard cap.
  2. `helpers.ts` (pure): `parseIssueRef(body): number | undefined` (regex above);
     `parsePlanPaths(body): string[]` — extract repo-relative `.md` paths under
     `docs/`, `specs/`, `plans/` (and inline markdown links to such); **`safeRepoPath(p)`**
     — SECURITY: reject `..`, absolute paths, leading `/` (readFiles has NO
     traversal guard; path comes from user-controlled PR body); `buildFileList(prFiles)` —
     per row emit `path` + `@@ … @@` header lines via `/^@@ .* @@.*$/gm` from `patch`
     (do NOT route through `parseUnifiedDiff` — it discards trailing func context);
     `toPrIntentRecord(intent, prId)`.
  3. `spec-gather.ts` `gatherSpec(container, {repoId, repo, body}): Promise<string>`
     (application/infra — does I/O, best-effort each source):
     - (a) start with PR `body`.
     - (b) `parsePlanPaths(body).filter(safeRepoPath)` → `repoIntel.readFiles(repoId, paths)`
       → append each non-null `content`. Missing/disabled → skip.
     - (c) `parseIssueRef(body)` → `try { gh = await container.github();
       issue = await gh.getIssue(repo, n) }` catch → skip. Append issue title+body.
     - combine → `rawSpec`. If `tokenizer.count(rawSpec) > SPEC_TOKEN_CAP` →
       **`condenseSpec`**: second cheap LLM call (same resolved `review_intent`
       model) summarizing rawSpec to scope-relevant bullets; on error → hard-truncate
       to `MAX_SPEC_CHARS`. Return final spec string.
  4. `service.ts` `IntentService(container)`:
     - `getIntent(workspaceId, prId)`: verify via `reviewRepo.getPull` (scope,
       NotFoundError) → `reviewRepo.getIntent(prId)` → `PrIntentRecord | null`.
     - `computeIntent(workspaceId, prId, {force})`: load pull + repo; if `!force` &&
       `getIntent` returns → return it; else `getPrFiles` → `buildFileList` →
       `gatherSpec(...)` (step 3) → `resolveFeatureModel(...,'review_intent')` →
       `llm = await container.llm(provider)` → `deriveIntent({...,fileList,issueSpec:spec})`
       → `reviewRepo.upsertIntent(prId, intent)` → return record.
     - Tokens-saved: `container.tokenizer.count()` of full `patch` bodies vs
       headers-only `fileList`; log delta "intent: omitted diff bodies, ~N tokens
       saved" (log-only estimate).
  5. `routes.ts` (thin): `GET /pulls/:id/intent` → `getIntent`;
     `POST /pulls/:id/intent/recompute` → `computeIntent(...,{force:true})` with
     `rateLimit` like `reviews/routes.ts:29`. Response `PrIntentRecord`, `params: IdParams`.
  6. Register in `modules/index.ts:26-37`.
- Accept: `cd server && pnpm typecheck` passes; GET returns null pre-compute, record
  after; POST re-derives; hermetic test (fake reviewRepo + mock repoIntel + mock
  github + mock llm) asserts: file-list has `@@` but no `+`/`-` code lines;
  `gatherSpec` pulls repo-file + issue text; `safeRepoPath` rejects `../` traversal;
  long spec triggers a compression call; github-unavailable degrades (no throw);
  upsert called; tokens-saved logs. No drizzle-orm/db/schema import in
  service/routes/helpers/spec-gather.

**Item 4 — server: auto-compute-on-first-review + inject**
- Files: edit `server/src/modules/reviews/run-executor.ts`
- Skills: `onion-architecture`, `typescript-expert`
- Steps:
  1. In `executeRuns` after diff load (`:105`), best-effort pre-work step
     `runLog.step('Deriving PR intent', …, {kind:'tool'})`:
     `const intent = await new IntentService(this.container)
        .computeIntent(workspaceId, pull.id, {force:false}).catch(()=>undefined)`.
     Degrade like `buildCallersDigest` (`.catch→undefined`, never fail review).
     Pass down into `runOneAgent`.
  2. Format `Intent` → compact string; spread into `reviewPullRequest({...})`
     (`:202-226`) as `...(intentText ? {intent: intentText} : {})`, mirroring
     `prDescription`/`callers`/`repoMap`.
- Accept: `pnpm typecheck` passes; review on PR w/o intent computes+persists (via
  GET), run's `prompt_assembly` has `## Review scope`; PR w/ intent does not
  recompute; forced derive error still completes review (section omitted).

### FRONT-END

**Item 5 — client: `usePrIntent` + `useRecomputeIntent` hooks**
- Files: create `client/src/lib/hooks/intent.ts`; edit `client/src/lib/hooks/index.ts`
- Skills: `ui-architecture`, `react-best-practices`, `zod`
- Steps:
  1. `usePrIntent(prId)`: `useQuery({ queryKey:["pr-intent",prId],
     queryFn:()=>api.get<PrIntentRecord|null>(\`/pulls/${prId}/intent\`),
     enabled: prId!=null })`.
  2. `useRecomputeIntent(prId)`: `useMutation({ mutationFn:()=>api.post(
     \`/pulls/${prId}/intent/recompute\`), onSuccess:()=>qc.invalidateQueries(
     {queryKey:["pr-intent",prId]}) })`.
  3. `export * from "./intent";` in `hooks/index.ts`.
- Accept: `cd client && pnpm typecheck` passes; hook test w/ mocked api returns
  record, recompute invalidates `["pr-intent",prId]`.

**Item 6 — client: `IntentCard` component + i18n**
- Files: create `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/
  {IntentCard.tsx,styles.ts,constants.ts,index.ts,IntentCard.test.tsx}`;
  edit `client/messages/en/brief.json` (+ other locales)
- Skills: `ui-architecture`, `react-best-practices`, `next-best-practices`,
  `react-testing-library`, `zod`
- Mirror: sibling `VerdictBanner/` (`"use client"`, `useTranslations`,
  `@devdigest/ui` primitives, inline `style={}` from `styles.ts export const s`,
  CSS vars, NO Tailwind). Shell: `Card`, `SectionLabel`, `IconBtn` (`RefreshCw`).
- Steps:
  1. Props `{ prId: string | null }` (container tier — calls Item 5 hooks itself,
     no server-mirror useState).
  2. `Card` + `SectionLabel` = `t("block.intent")`; body = `intent`, "In scope"
     list, "Out of scope" list; `RefreshCw` `IconBtn` (aria-label) → recompute,
     disabled+spinner while pending. null intent → `unavailable`/`unavailableHint`
     copy + recompute affordance.
  3. i18n: add `inScope`, `outOfScope`, `recompute`, `recomputing` to `brief.json`.
     No hardcoded strings.
- Accept: client `pnpm test` RTL (populated + null states, recompute calls
  mutation); `pnpm typecheck` passes; icon-only btn has aria-label.

**Item 7 — client: slot card into OverviewTab**
- Files: edit `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/
  OverviewTab.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
- Skills: `ui-architecture`, `react-best-practices`
- Steps:
  1. Add `prId: string|null` to `OverviewTabProps`; render `<IntentCard prId={prId} />`
     above the description `<section>`.
  2. `page.tsx:138`: `<OverviewTab prBody={pr.body} prId={prId} />`.
- Accept: client `pnpm typecheck` + `pnpm build` pass; card renders above PR
  description on Overview tab.

### OPTIONAL

**Item 8 — flash-class default for `review_intent`**
- Files: `server/src/vendor/shared/contracts/platform.ts:51-57` AND
  `client/src/lib/feature-models.ts:22-27` (edit BOTH — hand-mirrored registry)
- Skills: `zod`, `typescript-expert`
- Steps: change `review_intent` defaultProvider/defaultModel from `openai`/`gpt-4.1`
  to a flash-class OpenRouter model. Additive — existing overrides unaffected.
- Accept: server+client typecheck; both registries byte-match for `review_intent`;
  Settings picker unchanged.

---

## Risks & gotchas

- **Onion purity (CRITICAL):** `reviewer-core/src/intent.ts` stays pure — inputs
  are resolved strings, only side effect is injected `LLMProvider`. No fs/DB/octokit/git.
- **DB only via repository (CRITICAL):** `pr_intent` owned by reviews repo. Reach
  via `container.reviewRepo` (like conventions). No drizzle-orm/db/schema import
  in intent module; no second repo touching `pr_intent`.
- **No new migration (confirm):** `pr_intent` already exists+migrated. No
  `pnpm db:generate`/`db:migrate`. `relation "pr_intent" does not exist` → boot
  gotcha, run `cd server && pnpm db:migrate`, don't add migration.
- **Hunk-header caveat:** extract `@@` from stored `pr_files.patch` (GitHub-provided,
  has func context) via regex. Do NOT use `parseUnifiedDiff` (keeps only 4 numbers).
- **Client hand-mirrored registry (Item 8):** any `FEATURE_MODELS` change edits
  BOTH server `platform.ts` + client `feature-models.ts`; runtime `@devdigest/shared`
  value-import breaks webpack build.
- **Injection surface:** PR title/body/issue/plan-file feed both derive call and
  review prompt. Derive `wrapUntrusted()`s ALL author-controlled input (body,
  issue, repo-file content). Review treats intent as untrusted via INJECTION_GUARD.
  Scope instruction (Item 2) is trusted, sits OUTSIDE `<untrusted>`.
- **Path traversal (CRITICAL, security):** `repoIntel.readFiles` / `git.readFile`
  do a plain `join(clonePath, path)` with NO `..`/absolute guard (confirmed
  absent). Plan-file path comes from user-controlled PR body → `safeRepoPath()`
  MUST reject `..`, absolute, and leading-`/` paths before any read. Missing this
  is a critical finding the pr-self-review gate should catch.
- **Spec-source degradation:** all three spec sources are best-effort. `container.github()`
  throws `ConfigError` offline → try/catch, skip issue. `readFiles` returns `null`
  when `config.repoIntelEnabled` is off or clone missing → skip file. Never fail
  intent because a spec source is unavailable.
- **Clone freshness (open):** `readFiles` reads whatever is checked out in the
  clone, NOT the PR's exact `headSha` — no per-call `checkout <sha>`. A stale
  clone or wrong branch could read the wrong version of the plan file. Acceptable
  for v1 (best-effort context); note it, don't solve it now.
- **Compression cost:** long spec adds a SECOND cheap LLM call (`condenseSpec`).
  Same flash model, best-effort — on error hard-truncate, never fail. Only fires
  above `SPEC_TOKEN_CAP`.
- **pr-self-review push gate:** blocks on critical (onion violation, missing input
  validation, injection). Pass it — don't bypass.
- **Best-effort intent:** auto-compute in run-executor degrades to "no intent
  section" on error, like `buildCallersDigest`. Never fail a review.

## Verification

- Static: `cd reviewer-core && pnpm build`; `cd server && pnpm typecheck`;
  `cd client && pnpm typecheck && pnpm build`.
- Unit: reviewer-core `deriveIntent` (mock LLM) + `assemblePrompt` on/off parity;
  server hermetic `IntentService` (fake reviewRepo + mock llm), split `*.it.test.ts`
  from hermetic per `server/AGENTS.md`; client hooks + IntentCard states.
- E2E (`./scripts/dev.sh`): open repo → PR → Overview: card `unavailable` pre-run.
  Trigger review → (a) Live Log "Deriving PR intent" step, (b) GET returns record,
  (c) run trace `prompt_assembly` has `## Review scope`, (d) server log "~N tokens
  saved". Reload → card shows intent + lists. Recompute → re-derives. Re-run review
  → NOT recomputed (compute-if-missing).
- Pre-push: run `pr-self-review`; resolve critical/major before `gh pr create`.
