import type { FindingRecord, ReviewRecord } from '@devdigest/shared';

/**
 * Response shaping — the "concise structured response" principle. Return only the
 * fields needed to act on a review, not the raw contract dump (one full dump can
 * burn tens of thousands of tokens). `detailed` opts into the heavier fields.
 */
export function shapeFinding(f: FindingRecord, detailed: boolean) {
  return {
    file: f.file,
    start_line: f.start_line,
    severity: f.severity,
    title: f.title,
    suggestion: f.suggestion ?? undefined,
    ...(detailed
      ? {
          category: f.category,
          confidence: f.confidence,
          kind: f.kind ?? undefined,
          rationale: f.rationale,
        }
      : {}),
  };
}

/** { agent, verdict, score, summary, findings[] } — one review, compacted. */
export function shapeReview(rev: ReviewRecord, detailed: boolean) {
  return {
    agent: rev.agent_name ?? rev.agent_id,
    verdict: rev.verdict,
    score: rev.score,
    summary: rev.summary,
    findings: rev.findings.map((f) => shapeFinding(f, detailed)),
  };
}
