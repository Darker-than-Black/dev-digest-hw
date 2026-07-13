---
name: ui-architecture
version: 1.0.0
description: "Front-end architecture & structure best practices for the DevDigest web app (Next.js 15 App Router · React 19 · TanStack Query · Zod · next-intl). Use when deciding where a component should live, how to split it, where business logic and constants belong, folder structure, prop/composition design, client-vs-server state, TypeScript prop typing, and a11y/Web-Vitals baselines. For React anti-patterns (hooks misuse, derive-don't-store, keys, memoization) see react-best-practices; for Next.js RSC/routing specifics see next-best-practices; for tests see react-testing-library."
---

# Front-End Fundamentals — Architecture & Structure

Structural decisions for `@devdigest/web`: *where* code goes and *how* it's shaped.
Code examples → [examples.md](examples.md). Sources → [references/sources.md](references/sources.md).

## Scope & cross-links

This skill owns **structure/architecture**. It does NOT repeat these sibling skills — defer to them:

- `react-best-practices` — hooks misuse, derive-don't-store, render factories, keys, memoization, conditional rendering
- `next-best-practices` — RSC boundaries, `page.tsx`/`layout.tsx` conventions, metadata, route handlers
- `react-testing-library` — component/hook tests (Vitest + jsdom)
- `typescript-expert` — advanced type-level programming

## Severity Levels

- **CRITICAL** — breaks repo conventions or causes real bugs / rework
- **HIGH** — hurts scalability, testability, or performance
- **MEDIUM** — hurts maintainability / DX

---

## 1. Where components live (CRITICAL)

Four tiers, promote **only** when reused. Imports flow one direction: `vendor/ui` → `components` → `app`.

| Tier | Path | For |
|------|------|-----|
| Route-local | `src/app/**/_components/` | UI used by exactly one route |
| Shared app | `src/components/<feature>/` | Reused across ≥2 routes, app-specific |
| Design system | `src/vendor/ui/{primitives,kit,shell}` | Generic, reusable UI (`@devdigest/ui`) |
| Route entry | `src/app/**/page.tsx` | Server component; thin, delegates to `_components` |

- Start route-local in `_components/`. Promote to `src/components/` on the **2nd** consumer, not before.
- One PascalCase folder per non-trivial component (`_components/PRRow/`), with its own `constants.ts`, hooks, tests colocated.
- NEVER import from a route's `_components/` into another route — promote it first.
- NEVER edit UI primitives in `node_modules` — they're vendored under `src/vendor/ui`; edit there.

## 2. How to split components (HIGH)

- Split when a component exceeds ~200 lines, takes >5–7 props, or a chunk is reused.
- **Container vs presentational**: container = data + wiring (calls hooks); presentational = props → UI, no data calls.
- Route `page.tsx` stays thin: fetch/params → hand to a `View` component in `_components/`.
- Extract helpers OUTSIDE the component body (module scope or `src/lib/`).

## 3. Passing components — props vs children vs slots (HIGH)

- **Data varies → props.** **Structure varies → `children`.** Unsure → prefer composition.
- Multiple structural holes → named element props (`header={<X/>}`, `footer={<Y/>}`), not many booleans.
- Generic wrappers (Card, Modal, Drawer) take `children`; don't hardcode their contents.
- For families (Tabs, Dropdown) prefer compound components over config-object props.
- Avoid deep prop drilling — lift content up / pass `children` before reaching for Context.

## 4. Business logic placement (CRITICAL)

Three layers, each independently testable:

1. **Pure functions** → `src/lib/*.ts` (e.g. `github-urls.ts`, `model-label.ts`). Framework-free, no React. Unit-test directly.
2. **Custom hooks** → `src/lib/hooks/*.ts` (`"use client"`). React glue: state, effects, TanStack Query. Every data fetch is a hook here.
3. **Components** → render only; call hooks, map data to JSX. No branching business rules inline.

- ALL API access goes through `src/lib/api.ts`; NEVER `fetch` in a component (repo rule).
- Validate/shape data at the boundary with Zod contracts from `@devdigest/shared` (`src/vendor/shared/contracts`).
- Keep hooks in domain files (`hooks/reviews.ts`, `hooks/agents.ts`), re-exported via `hooks/index.ts`.

## 5. Constants & config in separate files (MEDIUM)

- No magic numbers/strings in JSX — hoist to a colocated `constants.ts` (repo already does this per feature).
- Scope constants to their user: feature `constants.ts` beside the component; truly global in `src/lib/`.
- **User-facing copy is NOT a constant** — it lives in `messages/<locale>/*.json` (next-intl). No hardcoded strings in components.
- Env config: only `NEXT_PUBLIC_*` reaches the browser (e.g. `NEXT_PUBLIC_API_BASE`). NEVER put secrets in client code.
- Feature flags / tunables (poll intervals, page sizes) as named constants, not inline literals.

## 6. Client vs server state boundary (HIGH)

- **Server data** (repos, PRs, reviews) → TanStack Query hook. Never mirror it into `useState`.
- **URL state** (filters, pagination, selected tab) → `searchParams`, not component state.
- **Ephemeral UI** (open/hover/input draft) → local `useState`, colocated.
- **Cross-tree shared** (theme, auth, repo context) → Context for dependency injection only (see `lib/theme.tsx`, `lib/repo-context.tsx`).
- Query keys are arrays namespaced by domain + id (`["pulls", repoId]`); invalidate by key on mutation.

## 7. Typing props with TypeScript (MEDIUM)

- Define props as an `interface`/`type`; export it if reused. Optional vs required is deliberate.
- Do NOT use `React.FC` (implicit `children`, awkward generics). Type props explicitly.
- Extend HTML elements via `ComponentProps<'button'>` for passthrough; `PropsWithChildren` when only adding `children`.
- Variant components → discriminated unions over many optional booleans.
- Reuse `@devdigest/shared` Zod-inferred types (`z.infer`) instead of redeclaring server shapes.

## 8. A11y & Web-Vitals baseline (HIGH)

- Semantic HTML first (`<button>`, `<nav>`, `<main>`, headings in order); ARIA only when semantics fall short.
- Icon-only controls need `aria-label`; dynamic regions need `aria-live`; modals trap focus + Escape closes.
- Target WCAG 2.2 AA; 24×24px tap targets; visible focus indicators.
- Core Web Vitals budgets: **INP ≤200ms · LCP ≤2.5s · CLS <0.1**. Reserve space for async content to avoid layout shift.

## Sources

Full curated, grouped source list → [references/sources.md](references/sources.md).
