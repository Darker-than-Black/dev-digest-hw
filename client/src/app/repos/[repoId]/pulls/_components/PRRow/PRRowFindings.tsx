/* PRRowFindings — the FINDINGS cell on a PR list row. Shows the per-severity
   counters; clicking a severity opens a popover of that severity's findings
   (lazy-fetched the first time it opens), each navigating to the finding on the
   PR detail page. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { FindingsPopoverBar } from "@/components/FindingsPopoverBar";
import { usePrReviews } from "@/lib/hooks/reviews";
import type { SeverityCounts } from "@devdigest/ui";

export function PRRowFindings({
  prId,
  prNumber,
  repoId,
  counts,
}: {
  prId: string | null | undefined;
  prNumber: number;
  repoId: string;
  counts: SeverityCounts;
}) {
  // Lazy: don't fetch findings until the popover is opened once (avoids N row
  // fetches on list mount). usePrReviews is enabled only once `armed` is true.
  const [armed, setArmed] = React.useState(false);
  const { data } = usePrReviews(armed ? prId : null);
  const findings = React.useMemo(
    () => (armed && data ? data.flatMap((r) => r.findings) : undefined),
    [armed, data],
  );
  const router = useRouter();

  return (
    <FindingsPopoverBar
      counts={counts}
      findings={findings}
      loading={armed && !data}
      onOpenSeverity={() => setArmed(true)}
      onSelectFinding={(f) =>
        router.push(`/repos/${repoId}/pulls/${prNumber}?tab=findings&finding=${f.id}`)
      }
      hideZero
    />
  );
}
