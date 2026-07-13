# Front-End Fundamentals — Examples

Repo-aligned code for each SKILL.md rule. Paths refer to `@devdigest/web` (`client/src`).

## 1. Where components live

```
src/app/repos/[repoId]/pulls/
├── page.tsx                 # thin server route entry
├── constants.ts             # feature constants (poll intervals, labels)
└── _components/
    ├── PRRow/               # route-local, PascalCase folder
    │   ├── PRRow.tsx
    │   └── constants.ts
    └── FilterBar/
        └── FilterBar.tsx
```

Promote only on the 2nd consumer:

```tsx
// ❌ importing one route's private component into another route
import { PRRow } from "@/app/repos/[repoId]/pulls/_components/PRRow/PRRow";

// ✅ once reused, move it up to shared, then import from there
// src/components/pr/PRRow.tsx
import { PRRow } from "@/components/pr/PRRow";
```

## 2. How to split — container vs presentational

```tsx
// Container: data + wiring. Lives in _components, calls the hook.
function PullsView({ repoId }: { repoId: string }) {
  const { data, isLoading, error } = usePulls(repoId);   // hook from lib/hooks
  if (isLoading) return <PullsSkeleton />;
  if (error) return <ErrorState error={error} />;
  if (!data?.length) return <EmptyState label="No open PRs" />;
  return <PullsList pulls={data} />;                       // presentational
}

// Presentational: props → UI, zero data access.
function PullsList({ pulls }: { pulls: PrMeta[] }) {
  return <ul>{pulls.map((p) => <PRRow key={p.id} pr={p} />)}</ul>;
}
```

Route entry stays thin:

```tsx
// src/app/repos/[repoId]/pulls/page.tsx
export default async function PullsPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return <PullsView repoId={repoId} />;
}
```

## 3. Passing components — props vs children vs slots

```tsx
// Data varies → props
<PRRow pr={pull} />

// Structure varies → children (generic wrapper doesn't know its contents)
<Card>
  <FindingSummary finding={f} />
</Card>

// Multiple structural holes → named element props, not boolean soup
<Modal
  title="Delete repo"
  body={<ConfirmText name={repo.name} />}
  footer={<><Button onClick={close}>Cancel</Button><Button danger onClick={del}>Delete</Button></>}
/>
```

## 4. Business logic placement — three layers

```ts
// Layer 1 — pure function, framework-free.  src/lib/github-urls.ts
export function prUrl(owner: string, repo: string, number: number) {
  return `https://github.com/${owner}/${repo}/pull/${number}`;
}
```

```ts
// Layer 2 — custom hook, the only place data is fetched.  src/lib/hooks/core.ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";                     // all HTTP via lib/api.ts

export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["pulls", repoId],
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    refetchInterval: 60_000,
  });
}
```

```tsx
// Layer 3 — component renders, never fetches.
function PRRow({ pr }: { pr: PrMeta }) {
  return <a href={prUrl(pr.owner, pr.repo, pr.number)}>{pr.title}</a>;
}
```

```ts
// ❌ never do this in a component
useEffect(() => { fetch(`/api/pulls`).then(...) }, []);  // fetch belongs in a hook via lib/api.ts
```

## 5. Constants & config

```ts
// src/app/repos/[repoId]/pulls/constants.ts — colocated, named
export const PULLS_POLL_MS = 60_000;
export const PULLS_PAGE_SIZE = 25;
```

```tsx
// ✅ user-facing copy is next-intl, not a constant
import { useTranslations } from "next-intl";
const t = useTranslations("pulls");
return <h1>{t("title")}</h1>;

// ❌ hardcoded copy in a component
return <h1>Open pull requests</h1>;
```

```ts
// env: only NEXT_PUBLIC_* is exposed to the browser
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
// ❌ never: process.env.GITHUB_SECRET in client code
```

## 6. Client vs server state boundary

```tsx
function PullsView({ repoId }: { repoId: string }) {
  const { data } = usePulls(repoId);          // server state → TanStack Query
  const [query, setQuery] = useState("");     // ephemeral UI → local state
  const filtered = data?.filter((p) => p.title.includes(query));  // derive, don't store
  // filters that should be shareable/bookmarkable → searchParams instead of useState
  return <>{/* ... */}</>;
}

// mutation invalidates by key — server stays source of truth
export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Repo>("/repos", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });
}
```

## 7. Typing props

```tsx
// ✅ explicit props type, no React.FC
interface PRRowProps {
  pr: PrMeta;
  onSelect?: (id: string) => void;
}
function PRRow({ pr, onSelect }: PRRowProps) { /* ... */ }

// HTML passthrough
type ButtonProps = React.ComponentProps<"button"> & { variant?: "primary" | "danger" };

// reuse server shapes via Zod inference — don't redeclare
import type { Finding } from "@devdigest/shared";   // = z.infer<typeof Finding>
```

## 8. A11y & Web-Vitals

```tsx
// icon-only control needs a label; live region announces async results
<IconBtn aria-label="Refresh repo" onClick={refresh}><RefreshIcon /></IconBtn>
<div aria-live="polite">{isLoading ? "Loading reviews…" : `${count} reviews`}</div>

// reserve space to protect CLS while data loads
{isLoading ? <div className="h-40" /> : <Chart data={data} />}
```
