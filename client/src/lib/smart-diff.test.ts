import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { lastReview, findingsByLine, topSeverity } from "./smart-diff";

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

describe("lastReview", () => {
  it("picks the first kind:'review' row, skipping a newer kind:'summary' row", () => {
    const summary = review({ id: "r2", kind: "summary", created_at: "2026-07-02T00:00:00.000Z" });
    const target = review({ id: "r1", kind: "review", created_at: "2026-07-01T00:00:00.000Z" });
    // Server returns newest-first — summary (newer) precedes the review row.
    expect(lastReview([summary, target])).toBe(target);
  });

  it("returns null when there are no reviews", () => {
    expect(lastReview(undefined)).toBeNull();
    expect(lastReview([])).toBeNull();
  });
});

describe("findingsByLine", () => {
  it("groups a review's findings for one file by start_line, ignoring other files", () => {
    const r = review({
      findings: [
        finding({ id: "f1", file: "a.ts", start_line: 3 }),
        finding({ id: "f2", file: "a.ts", start_line: 3 }),
        finding({ id: "f3", file: "a.ts", start_line: 9 }),
        finding({ id: "f4", file: "b.ts", start_line: 3 }),
      ],
    });
    const map = findingsByLine(r, "a.ts");
    expect(map.get(3)?.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(map.get(9)?.map((f) => f.id)).toEqual(["f3"]);
    expect(map.has(undefined as unknown as number)).toBe(false);
    expect(map.size).toBe(2);
  });

  it("returns an empty map when there is no review", () => {
    expect(findingsByLine(null, "a.ts").size).toBe(0);
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
