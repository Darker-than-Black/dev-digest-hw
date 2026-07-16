/**
 * Pure, framework-free helpers for the Smart Diff overlay (Files-changed tab).
 * No React, no data fetching — see `lib/hooks/reviews.ts`'s `useSmartDiff` for
 * the query, and `components/diff-viewer/SmartDiff*` for the UI that consumes
 * these. `import type` only from `@devdigest/shared` — a runtime value import
 * bundles the vendored barrel and breaks the webpack build (client/insights.md).
 */
import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";

/**
 * Findings from EVERY `kind === 'review'` row. Multi-agent review is
 * first-class here — each agent's pass is its own review row — so picking
 * only the newest row would show one agent's findings and hide the rest.
 *
 * This MIRRORS the server's `SmartDiffService.getSmartDiff` rule
 * (`server/src/modules/smart-diff/service.ts`, which builds `finding_lines`
 * the same way) and the two MUST stay in lockstep: the server decides which
 * lines get an anchor, this decides which get a pill. There is deliberately
 * no shared runtime helper across the client/server package boundary (a
 * runtime import from `@devdigest/shared` would bundle the vendored barrel
 * and break the webpack build), so any change here has to edit both by hand.
 */
export function reviewFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  return (reviews ?? []).filter((r) => r.kind === "review").flatMap((r) => r.findings);
}

/**
 * Group findings for one file by `start_line` — the shape the per-line
 * severity pills and per-file "N findings" counts are built from. Exact
 * `file` match only (mirrors the server's `findingLinesFor`).
 */
export function findingsByLine(
  findings: FindingRecord[],
  path: string,
): Map<number, FindingRecord[]> {
  const map = new Map<number, FindingRecord[]>();
  for (const f of findings) {
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
