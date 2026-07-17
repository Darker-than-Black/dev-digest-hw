import { describe, it, expect } from "vitest";
import type { BlastSymbolImpact } from "@devdigest/shared";
import { sortImpacts, withEmptyRowsAtEnd, nextSort } from "./sort";

function impact(name: string, callersTotal: number, endpoints = 0, crons = 0): BlastSymbolImpact {
  return {
    symbol: { name, file: `${name}.ts`, kind: "function" },
    callers: [],
    callers_total: callersTotal,
    callers_truncated: false,
    endpoints: Array.from({ length: endpoints }, (_, i) => ({
      method: "GET",
      path: `/x${i}`,
      location: { repository_path: `${name}.ts`, line: null },
      source_symbols: [name],
      depth: 1,
    })),
    crons: Array.from({ length: crons }, (_, i) => `cron-${name}-${i}`),
  };
}

describe("withEmptyRowsAtEnd", () => {
  it("sinks zero-caller symbols to the end, preserving relative order otherwise", () => {
    const impacts = [impact("empty", 0), impact("low", 2), impact("high", 10)];
    const result = withEmptyRowsAtEnd(impacts).map((i) => i.symbol.name);
    expect(result).toEqual(["low", "high", "empty"]);
  });

  it("is a no-op when no symbol is empty", () => {
    const impacts = [impact("a", 1), impact("b", 2)];
    expect(withEmptyRowsAtEnd(impacts).map((i) => i.symbol.name)).toEqual(["a", "b"]);
  });
});

describe("sortImpacts", () => {
  const impacts = [impact("empty", 0), impact("low", 2), impact("high", 10)];

  it("falls back to withEmptyRowsAtEnd when sort is null", () => {
    expect(sortImpacts(impacts, null).map((i) => i.symbol.name)).toEqual(["low", "high", "empty"]);
  });

  it("sorts by callers_total descending", () => {
    const result = sortImpacts(impacts, { key: "callers", dir: "desc" });
    expect(result.map((i) => i.symbol.name)).toEqual(["high", "low", "empty"]);
  });

  it("sorts by callers_total ascending", () => {
    const result = sortImpacts(impacts, { key: "callers", dir: "asc" });
    expect(result.map((i) => i.symbol.name)).toEqual(["empty", "low", "high"]);
  });

  it("sorts by symbol name", () => {
    const named = [impact("zeta", 1), impact("alpha", 1)];
    expect(sortImpacts(named, { key: "symbols", dir: "asc" }).map((i) => i.symbol.name)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("sorts by endpoint/cron counts", () => {
    const mixed = [impact("a", 1, 0, 3), impact("b", 1, 5, 0)];
    expect(sortImpacts(mixed, { key: "endpoints", dir: "desc" }).map((i) => i.symbol.name)).toEqual([
      "b",
      "a",
    ]);
    expect(sortImpacts(mixed, { key: "crons", dir: "desc" }).map((i) => i.symbol.name)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("nextSort", () => {
  it("starts a new key at desc", () => {
    expect(nextSort(null, "callers")).toEqual({ key: "callers", dir: "desc" });
  });

  it("flips direction on a repeat click of the same key", () => {
    expect(nextSort({ key: "callers", dir: "desc" }, "callers")).toEqual({
      key: "callers",
      dir: "asc",
    });
    expect(nextSort({ key: "callers", dir: "asc" }, "callers")).toEqual({
      key: "callers",
      dir: "desc",
    });
  });

  it("resets to desc when switching to a different key", () => {
    expect(nextSort({ key: "callers", dir: "asc" }, "endpoints")).toEqual({
      key: "endpoints",
      dir: "desc",
    });
  });
});
