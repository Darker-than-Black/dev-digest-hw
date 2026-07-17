/* sort.ts — pure ordering rules for the symbol tree. No React, hermetically
   testable. Two concerns: the DEFAULT order (symbols with zero callers sink
   to the bottom, otherwise the facade's file-rank order is left alone) and
   the EXPLICIT order a user picks by clicking a stat chip (§ StatChips). */
import type { BlastSymbolImpact } from "@devdigest/shared";

export type SortKey = "symbols" | "callers" | "endpoints" | "crons";
export type SortDir = "asc" | "desc";

export interface ImpactSort {
  key: SortKey;
  dir: SortDir;
}

/** Sinks `callers_total === 0` symbols to the end, stable otherwise — the
   default tree order before any stat-chip sort is applied. */
export function withEmptyRowsAtEnd(impacts: BlastSymbolImpact[]): BlastSymbolImpact[] {
  const withCallers = impacts.filter((i) => i.callers_total > 0);
  const withoutCallers = impacts.filter((i) => i.callers_total === 0);
  return [...withCallers, ...withoutCallers];
}

const METRIC: Record<SortKey, (impact: BlastSymbolImpact) => number | string> = {
  symbols: (impact) => impact.symbol.name,
  callers: (impact) => impact.callers_total,
  endpoints: (impact) => impact.endpoints.length,
  crons: (impact) => impact.crons.length,
};

/** `sort: null` → default order (empty rows at the end). Otherwise sorts by
   the chosen stat chip's metric in the given direction; `Array.prototype.sort`
   is stable (ES2019+) so ties keep their relative order. */
export function sortImpacts(
  impacts: BlastSymbolImpact[],
  sort: ImpactSort | null,
): BlastSymbolImpact[] {
  if (!sort) return withEmptyRowsAtEnd(impacts);
  const metric = METRIC[sort.key];
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...impacts].sort((a, b) => {
    const av = metric(a);
    const bv = metric(b);
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return cmp * sign;
  });
}

/** First click on a stat chip sorts `desc` (highest impact first); a second
   click on the SAME chip flips to `asc`; clicking a DIFFERENT chip starts
   that metric over at `desc`. */
export function nextSort(current: ImpactSort | null, key: SortKey): ImpactSort {
  if (current?.key === key) {
    return { key, dir: current.dir === "desc" ? "asc" : "desc" };
  }
  return { key, dir: "desc" };
}
