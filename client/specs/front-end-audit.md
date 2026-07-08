# Spec: Front-end best-practices audit — `@devdigest/web`

> Status: findings-only (no implementation) · Scope: **client only**
> Investigated via `ui-architecture` + `react-best-practices` + `next-best-practices`
> skills over a full sweep of `client/src`.

## Context

Goal: assess the front-end (`client/`, Next.js 15 App Router · React 19 ·
TanStack Query · next-intl · vendored `@devdigest/ui`) against modern React /
Next.js best practices and surface what can be improved. Focus categories:
**Accessibility**, **State/React correctness**, **Next.js/RSC** (performance kept
as a lower-priority appendix).

**Headline: the codebase is well-factored.** Clean 4-tier component split
(route-local `_components/` → `src/components/` → `vendor/ui/{primitives,kit,shell}`),
centralized fetch (`lib/api.ts`), all data in `lib/hooks/*`, consistent barrels +
colocated `constants.ts`/`styles.ts`/tests, no `React.FC`, no `<img>`, no real
TODO/FIXME debt. Only 3 real components exceed ~200 lines. Issues below are
localized gaps, not structural rot.

---

## CRITICAL — correctness / real bugs

### C1. `ConfigTab` mirrors server data into `useState`
`src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx:18-39`
- 9 `useState` fields copied from `agent.*`, re-synced by a `useEffect` keyed on
  `[agent.id]` with `eslint-disable exhaustive-deps` (`:39`).
- Bug: form only resets on `id` **change** — if the same agent is updated
  server-side (or refetched) while open, the form shows stale values. Other
  `agent` fields are read but untracked (the disabled lint rule hides it).
- `AgentEditor.tsx:23` mounts `<ConfigTab agent={agent} />` with **no `key`**, so
  the remount-on-id escape hatch isn't even leveraged.
- Direction: uncontrolled form re-mounted via `key={agent.id}`, or a form library
  (RHF). Contrast `CreateAgentModal` — genuine create form, its `useState` is fine.

### C2. Shared `Modal` / `Drawer` primitives lack Escape, focus-trap, return-focus
`src/vendor/ui/kit/Modal.tsx:20-27` · `src/vendor/ui/kit/Drawer.tsx:20-27`
- `role="dialog" aria-modal="true"` set, but: no Escape handler, no focus trap
  (Tab escapes to page behind), no focus return on close, no `aria-labelledby`.
  Overlay close is a bare `<div onClick={onClose}>` (non-semantic).
- Blast radius is **every dialog in the app** that uses these primitives.
- `CommandPalette.tsx` has Escape+arrows+autofocus but still no focus trap;
  `ShortcutsHelp.tsx:11` overlay is a click-div with no keyboard.
- Escape is hand-rolled ad-hoc in a few call sites (`AddRepoView.tsx:22-28`,
  `FindingsPopoverBar.tsx:94`) — proof the shared primitive should own it so the
  rest stop silently lacking it.

### C3. Array-index keys on editable/reorderable lists
- `src/components/diff-viewer/DiffViewer/DiffViewer.tsx:28` — `key={i}` over PR files
- `src/components/diff-viewer/FileCard/FileCard.tsx:83` — `key={i}` over diff lines
  (stable `path` + line numbers are available)
- Also `RunTraceDrawer/.../TraceBody.tsx:45,102`, `PromptModalBody.tsx:25,66`,
  `vendor/ui/kit/Dropdown.tsx:103,105`.
- Good counter-examples already exist: `FindingsTab.tsx:204`, `FindingsPanel.tsx:63`
  key by `f.id`/`review.id`.

---

## HIGH — a11y, scalability, Next.js correctness

### H1. Clickable `<div onClick>` without keyboard access (mouse-only, unreachable)
- `FindingCard/FindingCard.tsx:56` (expand header)
- `diff-viewer/FileCard/FileCard.tsx:57` (file expand header)
- `RunTraceDrawer/_components/{PromptBlock/PromptBlock.tsx:35, ToolCallRow/ToolCallRow.tsx:15, TraceSection/TraceSection.tsx:25}`
- `agents/_components/AgentCard/AgentCard.tsx:30` (whole-card click)
- `vendor/ui/kit/Dropdown.tsx:84` (trigger wrapper)
- Pattern to copy: `ReviewRunAccordion.tsx:85-91` already does it right
  (`role="button"`, `tabIndex={0}`, Enter/Space handler).

### H2. `app/page.tsx` is a client route only to run a redirect effect
`src/app/page.tsx:2,15-19`
- `"use client"` + `useEffect` → `router.replace` to first repo. Ships JS and
  flashes an intermediate "Taking you to your repository…" screen (`:40`).
- Direction: Server Component using `redirect()` — no client JS, no flash. This is
  the single worst RSC smell.

### H3. Every real `page.tsx` is `"use client"` — blocks RSC/streaming
`app/page.tsx:2` · `repos/[repoId]/pulls/page.tsx:3` ·
`repos/[repoId]/pulls/[number]/page.tsx:6` · `onboarding/page.tsx:3`
(the agents/settings pages re-export client Views — same effect).
- Only `app/layout.tsx` is a true Server Component. Given TanStack-Query-everywhere
  the broad client tree is partly intentional, but `page.tsx` as a client
  boundary forecloses any server data-fetch / streaming and per-route metadata.

### H4. No route-level `loading.tsx` / `error.tsx` / `not-found.tsx`
Confirmed none exist in `src/app`.
- Every route hand-rolls skeletons + `ErrorState` inside the client component
  (e.g. `pulls/[number]/page.tsx:99-122`). No error boundaries, no streaming.
- `layout.tsx:29-31` wraps the whole app in `<Suspense fallback={null}>` — any
  suspending descendant renders **blank**, not a skeleton.

### H5. `useSearchParams` without a proper Suspense boundary (Next 15 de-opt)
Used in `pulls/page.tsx`, `pulls/[number]/page.tsx`, `agents/[id]/page.tsx`.
- In Next 15 these must sit under a Suspense boundary or the subtree opts out of
  static/streaming. Only the root `fallback={null}` boundary exists → whole
  subtree de-opts to client rendering.

### H6. Nonce-counter effects that fight React (imperative scroll/flash state machines)
- `FindingsTab.tsx:73-76,90-106` — `{runId,n}` / `{id,n}` nonce objects +
  `document.querySelector` + `setTimeout(320)` + `classList.add/remove('dd-finding-flash')`,
  effect deps disabled.
- `ReviewRunAccordion.tsx:53-66` — two effects keyed on `targetNonce`/`openNonce`,
  each `setOpen(true)` + `scrollIntoView`, deps disabled.
- Direction: refs / `useImperativeHandle` or CSS-driven state instead of
  nonce-bump-to-retrigger-effect.

### H7. Icon-only buttons that bypass the good `IconBtn` primitive
`vendor/ui/primitives/IconBtn.tsx:22-25` correctly forces `label` → `aria-label`+`title`.
Raw `<button>` icon triggers to verify for missing `aria-label`:
`AgentCard.tsx:42`-area delete button, `PromptBlock.tsx:39` copy button.

---

## MEDIUM — maintainability / typing / DX

### M1. Correlated optional props that should be discriminated unions
- `FindingsPopoverBar.tsx:70-73,117` — `loading?`+`findings?` with derived
  `isLoading = !!loading && findings === undefined` encodes impossible states.
- `ReviewRunAccordion.tsx:32-49` — `targetRunId?/targetNonce?` and
  `openFindingId?/openNonce?` are two correlated pairs as 4 loose optionals →
  `{runId,nonce} | null`.
- `AgentCard.tsx` — `onToggle?/onClick?/active?/enabled` implicit modes.

### M2. Prop-drilling depth ~4
`repoFullName`/`headSha`: page → `FindingsTab` (:41-42) → `ReviewRunAccordion`
(:31) → `FindingsPanel` (:23-24) → `FindingCard`. Candidate for composition or a
small context.

### M3. `messages/` string leakage (minor, localized)
- `OverviewTab.tsx:16` — hardcoded `>Description<` literal, component has no
  `useTranslations`.
- `app/page.tsx` copy ("Welcome to DevDigest", "Taking you to your repository…")
  hardcoded — collapses when H2 turns it into an RSC.
- Audit `SectionTitle.tsx`, `PRRowFindings.tsx` for stray literals. Otherwise
  next-intl coverage is strong.

### M4. Fat pages never extracted to a `View` (inconsistent with agents/settings/onboarding)
`repos/[repoId]/pulls/[number]/page.tsx` (187, ~8 hooks, tabs+drawer, ~13 props to
`FindingsTab`) and `repos/[repoId]/pulls/page.tsx` (135) carry inline orchestration,
whereas `agents`/`settings`/`onboarding` follow thin-page → colocated `View`.

### M5. Components over ~200 lines
`showcase/Showcase.tsx` (259, dev sandbox), `RunHistory.tsx` (228),
`FindingsTab.tsx` (219 — also a container-masquerading-as-view, see H6),
`SearchableSelect.tsx` (203, borderline).

### M6. No runtime validation at the API boundary
`api.ts:64` returns `(await res.json()) as T` — raw cast, no `.parse()`. SSE
`reviews.ts:184` is `JSON.parse(...) as RunEvent`. All `@devdigest/shared` imports
are `import type` — the Zod schemas are used as types only, never as a boundary
guard. (Acceptable for a local-first tool; flagged for awareness.)

---

## Appendix — Performance (deprioritized)

- **No list virtualization.** Biggest risk: diff viewer renders every file
  (`DiffViewer.tsx:27`) and every line (`FileCard.tsx:81`) eagerly — a large PR =
  thousands of `CodeLine` nodes. `RunHistory` / `FindingsPanel` unvirtualized too
  (smaller blast radius).
- **Defeated `useCallback`s:** `FindingsTab.tsx:48-76` memoizes handlers, but the
  parent (`page.tsx:153-162`) passes fresh `onDelete`/`onRunDone` closures each
  render and no leaf is `React.memo` — so the memoization currently buys nothing.
- Pervasive inline `style={{…}}` objects (design convention) → new object each
  render; low severity given no memoized children.
- Three uncoordinated polling loops on an open PR page: `usePrActiveRuns` +
  `usePrRuns` (4s each, `reviews.ts:33,45`) + `usePulls` (60s, `core.ts:109`).

---

## Suggested severity ordering (for whatever gets built later)

1. **C2** shared Modal/Drawer a11y — one fix, app-wide payoff
2. **C1** ConfigTab prop→state — real stale-data bug
3. **H1** keyboard-accessible collapse headers — copy `ReviewRunAccordion` pattern
4. **H2** `app/page.tsx` → RSC `redirect()`
5. **H4 + H5** add `loading.tsx`/`error.tsx` + real Suspense around `useSearchParams`
6. **C3 / H6 / M1** keys, nonce-effect cleanup, prop unions

## Verification (when changes are made later)

- `cd client && pnpm typecheck && pnpm test` (vitest + jsdom, fetch mocked — no
  API/DB needed).
- a11y: keyboard-only pass — Tab to every collapse header (H1), open a dialog and
  confirm Escape closes + focus trapped + returns on close (C2).
- RSC: `pnpm build` and confirm `app/page.tsx` no longer flashes the intermediate
  screen; check no `useSearchParams` Suspense warnings in build output (H5).
- Full-app smoke via `./scripts/dev.sh` then drive PR review flow at :3000.
