/* mermaid.ts — pure builder for the Graph view's `flowchart LR`, colocated so
   it's hermetically unit-testable with no React/DOM/mermaid dependency.
   Three-column layout (matches the target mock): changed symbol → its
   callers → the endpoints reachable through those callers. Endpoints fan out
   from EVERY caller of their symbol (the contract only records which changed
   symbol reaches an endpoint, not which specific caller — a caller is
   usually itself the route handler, so this is a readable approximation, not
   a precise call chain). A symbol with endpoints but no capped-in callers
   falls back to a direct symbol → endpoint edge so the endpoint is never
   dropped from the graph. Node ids are hashed from a stable key so the same
   symbol/caller/endpoint reached through multiple impacts still dedupes to
   one node; labels are quoted + escaped since raw parens/slashes
   (`rateLimit()`, `/api/public/x`) break mermaid's unquoted node-text syntax. */
import type { BlastSymbolImpact } from "@devdigest/shared";

// Keep the diagram readable (skill guidance: ~20 nodes) — a file-level
// fallback can flag dozens of "changed" symbols, and callers are already
// capped at 20 server-side, so both need a client-side visual cap too.
const MAX_SYMBOLS = 6;
const MAX_CALLERS_PER_SYMBOL = 5;
const MAX_ENDPOINTS_PER_SYMBOL = 4;

export const CHANGED_CLASS = "changed";
export const CALLER_CLASS = "caller";
export const ENDPOINT_CLASS = "endpoint";

// Mermaid's `classDef` style list is COMMA-separated — a `var(...)`/
// `color-mix(...)` value's OWN internal commas broke that parse (the graph
// silently failed to render, `MermaidDiagram` treating it as invalid input).
// Plain hex only, no functions: approximates the app's dark-theme tokens
// (`--accent`/`--accent-text`, `--bg-hover`/`--border-strong`/`--text-secondary`,
// `--ok`) since `MermaidDiagram` always renders mermaid's own `dark` theme
// regardless of the app's light/dark setting — CSS custom properties aren't
// an option here either way.
const CLASS_DEFS = [
  `classDef ${CHANGED_CLASS} fill:#24304a,stroke:#3b82f6,color:#93bbfc`,
  `classDef ${CALLER_CLASS} fill:#242424,stroke:#3a3a3a,color:#999999`,
  `classDef ${ENDPOINT_CLASS} fill:#123328,stroke:#10b981,color:#10b981`,
];

/** Mermaid node ids must be alnum/underscore — a stable slug from a unique key
   (not the label, which may collide or contain unsafe chars). */
function nodeId(prefix: string, key: string): string {
  const slug = key
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${prefix}_${slug || "x"}`;
}

/** Quote + escape a node label so arbitrary code/path text (`rateLimit()`,
   `/api/public/x`) renders literally instead of breaking the node shape. */
function label(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, "#quot;")}"`;
}

export interface BlastGraph {
  chart: string;
  /** True when the symbol/caller/endpoint set was capped for readability. */
  truncated: boolean;
}

/** Builds a `flowchart LR`: changed-symbol nodes → their caller nodes →
   the endpoint nodes reachable through those callers. Same `impacts` data
   the tree view already has — no new fetch, no re-derivation of the blast
   algorithm. A symbol with NEITHER callers nor endpoints has nothing to
   draw — it would render as a floating node with no edges at all — so it's
   dropped before the `MAX_SYMBOLS` cap, not after: capping the raw list
   first could crowd out every meaningful symbol with empty ones ahead of it
   in file-rank order. */
export function buildBlastGraph(impacts: BlastSymbolImpact[]): BlastGraph {
  const graphable = impacts.filter((i) => i.callers.length > 0 || i.endpoints.length > 0);
  const lines: string[] = ["flowchart LR"];
  const declared = new Set<string>();
  const edges = new Set<string>();
  let truncated = graphable.length > MAX_SYMBOLS;

  function declare(id: string, text: string, open: string, close: string, cls: string): void {
    if (declared.has(id)) return;
    declared.add(id);
    lines.push(`  ${id}${open}${label(text)}${close}:::${cls}`);
  }

  function edge(from: string, to: string): void {
    const key = `${from}->${to}`;
    if (edges.has(key)) return;
    edges.add(key);
    lines.push(`  ${from} --> ${to}`);
  }

  for (const impact of graphable.slice(0, MAX_SYMBOLS)) {
    const symId = nodeId("sym", `${impact.symbol.file}:${impact.symbol.name}`);
    declare(symId, impact.symbol.name, "[", "]", CHANGED_CLASS);

    if (impact.callers.length > MAX_CALLERS_PER_SYMBOL) truncated = true;
    const callerIds: string[] = [];
    for (const caller of impact.callers.slice(0, MAX_CALLERS_PER_SYMBOL)) {
      const callerId = nodeId("caller", `${caller.file}:${caller.symbol}`);
      declare(callerId, caller.symbol, "(", ")", CALLER_CLASS);
      edge(symId, callerId);
      callerIds.push(callerId);
    }

    if (impact.endpoints.length > MAX_ENDPOINTS_PER_SYMBOL) truncated = true;
    for (const ep of impact.endpoints.slice(0, MAX_ENDPOINTS_PER_SYMBOL)) {
      const epId = nodeId("ep", `${ep.method}:${ep.path}`);
      declare(epId, `${ep.method} ${ep.path}`, "([", "])", ENDPOINT_CLASS);
      if (callerIds.length > 0) {
        for (const callerId of callerIds) edge(callerId, epId);
      } else {
        // No caller node reaches this symbol (capped out, or genuinely
        // none) — connect the symbol directly so the endpoint still shows.
        edge(symId, epId);
      }
    }
  }

  return { chart: [...lines, ...CLASS_DEFS].join("\n"), truncated };
}
