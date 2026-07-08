// Import from the primitives sub-barrel, NOT the @devdigest/ui root barrel:
// the root barrel re-exports charts/* (recharts), which crashes when evaluated
// in this Server Component's RSC graph.
import { Skeleton } from "@/vendor/ui/primitives";

/* Route-level loading fallback. Also provides the Suspense boundary the App
   Router needs around pages that read `useSearchParams()` (PR list/detail,
   agent editor) — without it those subtrees de-opt to full client rendering. */
export default function Loading() {
  return (
    <div
      style={{
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      <Skeleton height={28} width={420} />
      <Skeleton height={16} width={300} />
      <Skeleton height={200} />
    </div>
  );
}
