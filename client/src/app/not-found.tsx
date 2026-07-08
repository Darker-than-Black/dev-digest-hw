// primitives sub-barrel (no charts/recharts) — this is a Server Component; the
// @devdigest/ui root barrel would pull recharts into the RSC graph and crash.
import { EmptyState } from "@/vendor/ui/primitives";

/* Root not-found fallback for unmatched routes. */
export default function NotFound() {
  return (
    <EmptyState
      icon="GitBranch"
      title="Page not found"
      body="This page doesn’t exist or may have moved."
    />
  );
}
