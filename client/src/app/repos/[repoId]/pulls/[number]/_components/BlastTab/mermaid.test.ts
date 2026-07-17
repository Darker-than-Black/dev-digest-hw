import { describe, it, expect } from "vitest";
import type { BlastSymbolImpact } from "@devdigest/shared";
import { buildBlastGraph } from "./mermaid";

function impact(overrides: Partial<BlastSymbolImpact> = {}): BlastSymbolImpact {
  return {
    symbol: { name: "rateLimit", file: "server/src/mw.ts", kind: "function" },
    callers: [],
    callers_total: 0,
    callers_truncated: false,
    endpoints: [],
    crons: [],
    ...overrides,
  };
}

describe("buildBlastGraph", () => {
  it("starts with a flowchart LR header and is not truncated for a small graph", () => {
    const { chart, truncated } = buildBlastGraph([
      impact({ callers: [{ symbol: "c", file: "c.ts", line: 1, rank: 0.5, relation: "calls" }], callers_total: 1 }),
    ]);
    expect(chart.startsWith("flowchart LR")).toBe(true);
    expect(truncated).toBe(false);
  });

  it("drops a symbol with neither callers nor endpoints — nothing to draw, would float with no edges", () => {
    const withCaller = impact({
      symbol: { name: "hasCaller", file: "a.ts", kind: "function" },
      callers: [{ symbol: "c", file: "c.ts", line: 1, rank: 0.5, relation: "calls" }],
      callers_total: 1,
    });
    const empty = impact({ symbol: { name: "orphan", file: "b.ts", kind: "function" } });
    const { chart } = buildBlastGraph([withCaller, empty]);
    expect(chart).toContain('"hasCaller"');
    expect(chart).not.toContain('"orphan"');
  });

  it("filters empty symbols BEFORE the MAX_SYMBOLS cap, so they can't crowd out graphable ones later in the list", () => {
    const empties = Array.from({ length: 6 }, (_, i) =>
      impact({ symbol: { name: `orphan${i}`, file: `o${i}.ts`, kind: "function" } }),
    );
    const withCaller = impact({
      symbol: { name: "theOneThatMatters", file: "z.ts", kind: "function" },
      callers: [{ symbol: "c", file: "c.ts", line: 1, rank: 0.5, relation: "calls" }],
      callers_total: 1,
    });
    // 6 empty symbols (== MAX_SYMBOLS) ahead of the one real one in the list —
    // a naive slice(0, MAX_SYMBOLS) BEFORE filtering would drop it entirely.
    const { chart, truncated } = buildBlastGraph([...empties, withCaller]);
    expect(chart).toContain('"theOneThatMatters"');
    expect(truncated).toBe(false);
  });

  it("escapes parens/slashes in node labels so they render literally", () => {
    const { chart } = buildBlastGraph([
      impact({
        symbol: { name: "rateLimit()", file: "server/src/mw.ts", kind: "function" },
        callers: [
          { symbol: "checkout", file: "a.ts", line: 1, rank: 0.5, relation: "calls" },
        ],
        callers_total: 1,
        endpoints: [
          {
            method: "GET",
            path: "/api/public/x",
            location: { repository_path: "a.ts", line: null },
            source_symbols: ["rateLimit()"],
            depth: 1,
          },
        ],
      }),
    ]);
    // Labels are quoted, and internal quotes are escaped — the raw text
    // (parens, slashes) is otherwise passed through unescaped inside the
    // quotes, which is safe mermaid syntax.
    expect(chart).toContain('"rateLimit()"');
    expect(chart).toContain('"GET /api/public/x"');
  });

  it("dedupes a caller/endpoint reached from more than one changed symbol into one node", () => {
    const sharedCaller = { symbol: "shared", file: "shared.ts", line: 5, rank: 0.5, relation: "calls" as const };
    const { chart } = buildBlastGraph([
      impact({ symbol: { name: "a", file: "a.ts", kind: "function" }, callers: [sharedCaller], callers_total: 1 }),
      impact({ symbol: { name: "b", file: "b.ts", kind: "function" }, callers: [sharedCaller], callers_total: 1 }),
    ]);
    // The shared caller node is declared exactly once, even though it's
    // reached from two different changed symbols.
    const declarations = chart.split("\n").filter((line) => line.includes('"shared"'));
    expect(declarations).toHaveLength(1);
  });

  it("assigns the three legend classes to symbol/caller/endpoint nodes", () => {
    const { chart } = buildBlastGraph([
      impact({
        callers: [{ symbol: "c", file: "c.ts", line: 1, rank: 0.5, relation: "calls" }],
        callers_total: 1,
        endpoints: [
          {
            method: "POST",
            path: "/x",
            location: { repository_path: "c.ts", line: null },
            source_symbols: ["rateLimit"],
            depth: 1,
          },
        ],
      }),
    ]);
    expect(chart).toMatch(/:::changed/);
    expect(chart).toMatch(/:::caller/);
    expect(chart).toMatch(/:::endpoint/);
  });

  it("emits classDef lines as plain hex with no function-call commas (mermaid's style list is comma-separated)", () => {
    const { chart } = buildBlastGraph([impact()]);
    const classDefLines = chart.split("\n").filter((line) => line.trim().startsWith("classDef "));
    expect(classDefLines).toHaveLength(3);
    // No `var(...)`/`color-mix(...)` at all — the regression this guards
    // against: their internal commas broke mermaid's classDef style-list
    // parser, so `mermaid.parse` returned false and the graph never rendered.
    for (const line of classDefLines) {
      expect(line).not.toContain("var(");
      expect(line).not.toContain("color-mix(");
    }
    for (const line of classDefLines) {
      // Exactly 3 comma-separated `key:#hex` style declarations.
      const styleList = line.replace(/^\s*classDef \S+ /, "");
      const declarations = styleList.split(",");
      expect(declarations).toHaveLength(3);
      for (const decl of declarations) {
        expect(decl).toMatch(/^(fill|stroke|color):#[0-9a-f]{6}$/);
      }
    }
  });

  it("flags truncation when a symbol's caller list exceeds the graph cap", () => {
    const manyCallers = Array.from({ length: 8 }, (_, i) => ({
      symbol: `caller${i}`,
      file: `c${i}.ts`,
      line: i,
      rank: 0.5,
      relation: "calls" as const,
    }));
    const { truncated } = buildBlastGraph([
      impact({ callers: manyCallers, callers_total: manyCallers.length }),
    ]);
    expect(truncated).toBe(true);
  });
});
