/**
 * Pure, framework-free helpers for the Smart Diff overlay (Files-changed tab).
 * No React, no data fetching — see `lib/hooks/reviews.ts`'s `useSmartDiff` for
 * the query, and `components/diff-viewer/SmartDiff*` for the UI that consumes
 * these. `import type` only from `@devdigest/shared` — a runtime value import
 * bundles the vendored barrel and breaks the webpack build (client/insights.md).
 */
import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";

/**
 * The newest `kind === 'review'` row (`usePrReviews` returns reviews newest-
 * first, per the server's `ORDER BY created_at DESC`). This MIRRORS the
 * server's `SmartDiffService.getSmartDiff` last-review rule
 * (`server/src/modules/smart-diff/service.ts`) and the two MUST stay in
 * lockstep — there is deliberately no shared runtime helper across the
 * client/server package boundary (a runtime import from `@devdigest/shared`
 * would bundle the vendored barrel and break the webpack build), so any future
 * change to the "last review" rule has to edit both places by hand.
 */
export function lastReview(reviews: ReviewRecord[] | undefined): ReviewRecord | null {
  return reviews?.find((r) => r.kind === "review") ?? null;
}

/**
 * Group a review's findings for one file by `start_line` — the shape the
 * per-line severity pills and per-file "N findings" counts are built from.
 * Exact `file` match only (mirrors the server's `findingLinesFor`).
 */
export function findingsByLine(
  review: ReviewRecord | null,
  path: string,
): Map<number, FindingRecord[]> {
  const map = new Map<number, FindingRecord[]>();
  if (!review) return map;
  for (const f of review.findings) {
    if (f.file !== path) continue;
    const list = map.get(f.start_line) ?? [];
    list.push(f);
    map.set(f.start_line, list);
  }
  return map;
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

/**
 * Highest severity among a set of findings (CRITICAL > WARNING > SUGGESTION),
 * for the collapsed-row "N findings" pill. Callers only invoke this with a
 * non-empty array (the badge itself only renders when `findings.length > 0`);
 * an empty array falls back to `SUGGESTION` rather than throwing.
 */
export function topSeverity(findings: FindingRecord[]): Severity {
  let top: Severity = "SUGGESTION";
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[top]) top = f.severity;
  }
  return top;
}
