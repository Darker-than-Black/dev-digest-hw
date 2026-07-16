import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { reviewFindings, findingsByLine, topSeverity } from "./smart-diff";

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "issue",
    file: "server/src/service.ts",
    start_line: 10,
    end_line: 10,
    rationale: "because",
    confidence: 0.8,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Agent",
    kind: "review",
    verdict: "comment",
    summary: "s",
    score: 80,
    model: "m",
    created_at: "2026-07-01T00:00:00.000Z",
    findings: [],
    ...o,
  };
}

describe("reviewFindings", () => {
  it("collects findings from EVERY review run, not just the newest", () => {
    // The real multi-agent shape that broke the old "newest row only" rule:
    // the newest agent's pass found nothing, while an older Security pass
    // found the blocker. Its finding must still surface.
    const newestEmpty = review({
      id: "r3",
      agent_name: "API Contract Reviewer",
      created_at: "2026-07-15T13:41:01.000Z",
      findings: [],
    });
    const security = review({
      id: "r2",
      agent_name: "Security Reviewer",
      created_at: "2026-07-15T13:40:27.000Z",
      findings: [finding({ id: "sec1", severity: "CRITICAL" })],
    });
    const general = review({
      id: "r1",
      agent_name: "General Reviewer",
      created_at: "2026-07-15T13:38:55.000Z",
      findings: [finding({ id: "gen1" })],
    });
    // Server returns newest-first.
    expect(reviewFindings([newestEmpty, security, general]).map((f) => f.id)).toEqual([
      "sec1",
      "gen1",
    ]);
  });

  it("skips kind:'summary' rows", () => {
    const summary = review({ id: "r2", kind: "summary", findings: [finding({ id: "sum1" })] });
    const target = review({ id: "r1", kind: "review", findings: [finding({ id: "f1" })] });
    expect(reviewFindings([summary, target]).map((f) => f.id)).toEqual(["f1"]);
  });

  it("returns an empty array when there are no reviews", () => {
    expect(reviewFindings(undefined)).toEqual([]);
    expect(reviewFindings([])).toEqual([]);
  });
});

describe("findingsByLine", () => {
  it("groups findings for one file by start_line, ignoring other files", () => {
    const findings = [
      finding({ id: "f1", file: "a.ts", start_line: 3 }),
      finding({ id: "f2", file: "a.ts", start_line: 3 }),
      finding({ id: "f3", file: "a.ts", start_line: 9 }),
      finding({ id: "f4", file: "b.ts", start_line: 3 }),
    ];
    const map = findingsByLine(findings, "a.ts");
    expect(map.get(3)?.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(map.get(9)?.map((f) => f.id)).toEqual(["f3"]);
    expect(map.has(undefined as unknown as number)).toBe(false);
    expect(map.size).toBe(2);
  });

  it("groups findings from different agents on the same line together", () => {
    // Two agents flagging one line is normal in multi-agent review — both
    // belong on that line's pill, and `topSeverity` picks the loudest.
    const map = findingsByLine(
      [
        finding({ id: "sec1", file: "a.ts", start_line: 5, severity: "CRITICAL" }),
        finding({ id: "perf1", file: "a.ts", start_line: 5, severity: "SUGGESTION" }),
      ],
      "a.ts",
    );
    expect(map.get(5)?.map((f) => f.id)).toEqual(["sec1", "perf1"]);
    expect(topSeverity(map.get(5)!)).toBe("CRITICAL");
  });

  it("returns an empty map when there are no findings", () => {
    expect(findingsByLine([], "a.ts").size).toBe(0);
  });
});

describe("topSeverity", () => {
  it("picks CRITICAL over WARNING and SUGGESTION", () => {
    expect(
      topSeverity([
        finding({ severity: "SUGGESTION" }),
        finding({ severity: "CRITICAL" }),
        finding({ severity: "WARNING" }),
      ]),
    ).toBe("CRITICAL");
  });

  it("picks WARNING over SUGGESTION when there's no CRITICAL", () => {
    expect(topSeverity([finding({ severity: "SUGGESTION" }), finding({ severity: "WARNING" })])).toBe(
      "WARNING",
    );
  });
});
