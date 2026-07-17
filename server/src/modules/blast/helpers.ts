import type { BlastResponse, BlastSymbolImpact, ChangedSymbol, ChatMessage } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, IndexState } from '../repo-intel/types.js';
import { MAX_CALLERS_PER_SYMBOL } from './constants.js';

/**
 * Pure mapping of the repo-intel facade's `BlastResult` + `IndexState` into
 * the `BlastResponse` HTTP contract. No DB, no fs, no network — `service.ts`
 * is the only caller. Never re-implements the facade's symbols → callers →
 * endpoints/crons algorithm, only reshapes its output.
 *
 * `reachableEndpoints` (step 3) is the set of HTTP routes reachable from the
 * changed files by a 2-level import-graph walk — computed by the facade's
 * `getReachableEndpoints` and unioned into the flat top-level `endpoints`
 * here. Defaults to `[]` so the mapper stays usable/testable without it.
 */

/** Badge fields straight off `IndexState` — the facade's own freshness read. */
function mapIndexBadge(indexState: IndexState): BlastResponse['index'] {
  return {
    status: indexState.status,
    degraded: indexState.degraded ?? false,
    reason: indexState.degradedReason ?? indexState.reason ?? null,
    files_indexed: indexState.filesIndexed,
    files_skipped: indexState.filesSkipped,
    last_indexed_sha: indexState.lastIndexedSha,
    updated_at: indexState.updatedAt.toISOString(),
  };
}

export function mapToBlastResponse(
  result: BlastResult,
  indexState: IndexState,
  reachableEndpoints: string[] = [],
): BlastResponse {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // Group the facade's flat caller rows by the changed symbol they reach
  // (`viaSymbol`), preserving its existing rank order — never re-sorted here.
  const callersBySymbol = new Map<string, BlastCallerRow[]>();
  for (const caller of result.callers) {
    const bucket = callersBySymbol.get(caller.viaSymbol);
    if (bucket) bucket.push(caller);
    else callersBySymbol.set(caller.viaSymbol, [caller]);
  }

  const impacts: BlastSymbolImpact[] = changed_symbols.map((symbol) => {
    // Step-2 cap: at most MAX_CALLERS_PER_SYMBOL callers per changed symbol,
    // keeping the facade's existing rank order (highest rank first). Applied
    // in the blast layer so the invariant holds on every facade path.
    const callers = (callersBySymbol.get(symbol.name) ?? [])
      .slice(0, MAX_CALLERS_PER_SYMBOL)
      .map((c) => ({
        symbol: c.symbol,
        file: c.file,
        line: c.line,
        rank: c.rank,
      }));

    // Per-symbol endpoints/crons are only attributable on the persistent path
    // (`factsByFile` present) — union the facts of that symbol's caller
    // files. On the degraded path `factsByFile` is absent entirely (no
    // per-file fact source once we fall back to ripgrep), so every symbol's
    // endpoints/crons stay `[]`; only the flat top-level `endpoints` gets
    // populated below (from `impactedEndpoints`), and flat `crons` stays
    // `[]`. This asymmetry is intentional — the facade's documented contract,
    // not a bug.
    let endpoints: string[] = [];
    let crons: string[] = [];
    if (result.factsByFile) {
      const endpointSet = new Set<string>();
      const cronSet = new Set<string>();
      const callerFiles = new Set(callers.map((c) => c.file));
      for (const file of callerFiles) {
        const facts = result.factsByFile[file];
        if (!facts) continue;
        for (const e of facts.endpoints) endpointSet.add(e);
        for (const c of facts.crons) cronSet.add(c);
      }
      endpoints = [...endpointSet];
      crons = [...cronSet];
    }

    return { symbol, callers, endpoints, crons };
  });

  // Flat top-level endpoints = the facade's caller-file endpoints (step 3 as
  // computed off `references`) UNIONED with the 2-level import-graph reachable
  // routes (`reachableEndpoints`). Deduped, facade order first.
  const endpoints = [...new Set([...result.impactedEndpoints, ...reachableEndpoints])];
  const crons = result.factsByFile
    ? [...new Set(Object.values(result.factsByFile).flatMap((f) => f.crons))]
    : [];

  // Callers count reflects what's actually rendered — the sum of the per-symbol
  // capped lists, not the facade's raw (possibly larger) caller total.
  const callerCount = impacts.reduce((n, i) => n + i.callers.length, 0);

  return {
    index: mapIndexBadge(indexState),
    changed_symbols,
    impacts,
    endpoints,
    crons,
    counts: {
      symbols: changed_symbols.length,
      callers: callerCount,
      endpoints: endpoints.length,
      crons: crons.length,
    },
    explanation: null,
  };
}

/**
 * Prompt for the optional `?explain=true` paragraph — pure formatting, no
 * I/O. `service.ts` sends this to the resolved `blast_explain` model. Kept
 * compact (symbol/caller/endpoint names only, no line numbers) since it's a
 * cheap-model summary, not a grounded finding.
 */
export function buildExplainMessages(response: BlastResponse): ChatMessage[] {
  const lines = response.impacts.map((impact) => {
    const callerNames = impact.callers.map((c) => `${c.symbol} (${c.file})`).join(', ') || 'none';
    const endpointNames = impact.endpoints.join(', ') || 'none';
    const cronNames = impact.crons.join(', ') || 'none';
    return [
      `Symbol ${impact.symbol.name} (${impact.symbol.file}):`,
      `  callers: ${callerNames}`,
      `  endpoints: ${endpointNames}`,
      `  crons: ${cronNames}`,
    ].join('\n');
  });

  const body =
    lines.join('\n') ||
    'No downstream callers were found for the changed symbols in this PR.';

  return [
    {
      role: 'system',
      content:
        'You are a terse code-review assistant. Summarize the blast radius of a pull request in one short paragraph of plain prose (no markdown, no lists). Focus on what could break and why.',
    },
    { role: 'user', content: body },
  ];
}
