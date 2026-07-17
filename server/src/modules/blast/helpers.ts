import type {
  BlastEndpointRef,
  BlastIndexBadge,
  BlastResponse,
  BlastSymbolImpact,
  ChangedSymbol,
  ChangeDetectionMode,
  ChatMessage,
  PriorPull,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, EndpointRefRow, IndexState } from '../repo-intel/types.js';
import { isJunkPath } from '../repo-intel/constants.js';
import { MAX_CALLERS_PER_SYMBOL } from './constants.js';

/**
 * Pure mapping of the repo-intel facade's `BlastResult` + `IndexState` (plus
 * `blast/service.ts`'s own change-detection/status/endpoint-BFS work) into
 * the `BlastResponse` HTTP contract. No DB, no fs, no network — `service.ts`
 * is the only caller. Never re-implements the facade's symbols → callers →
 * endpoints/crons algorithm, only reshapes its output.
 *
 * `result` is expected to already be filtered to the surviving (line-level
 * intersected, or unfiltered on file-level fallback) changed symbols —
 * `service.ts` does that filtering before calling in, since it owns the diff
 * parsing (`diff.ts`) this mapper stays pure over.
 *
 * Also drops endpoints/crons whose SOURCE file is test/mock/fixture/config
 * junk (`isJunkPath`, shared with `getTopFilesByRank`) — a read-time filter,
 * not a re-index, so noisy `file_facts` rows stay persisted and this is the
 * only place they're excluded from a response.
 */

export interface BlastMapOptions {
  /** How `result.changedSymbols` were selected — passed straight through. */
  changeDetectionMode?: ChangeDetectionMode;
  /**
   * Badge status computed by `service.ts` (unavailable/degraded/partial/full —
   * see its header comment). Defaults to `indexState.status` verbatim for
   * callers (tests) that don't care about the override.
   */
  status?: BlastIndexBadge['status'];
  /** Changed files absent from the index / unresolved deleted-renamed files. */
  missingFiles?: string[] | null;
  /** `getReachableEndpointRefs` output — BFS-derived endpoint/file/depth rows. */
  endpointRefs?: EndpointRefRow[];
  /** Already-shaped `PriorPull`s (`service.ts` maps the raw rows — see `mapPriorPull`). */
  priorPulls?: PriorPull[];
}

/** A prior-PR row shape this module needs — a narrow local interface (not the
 *  Drizzle/repository row type) so this file stays DB-free and independently
 *  testable, mirroring `intent/helpers.ts`/`smart-diff/helpers.ts`. */
interface PriorPullSourceRow {
  number: number;
  title: string;
  author: string;
  openedAt: Date | null;
}

/** Raw prior-PR row + the PR's repo `owner/name` → the `PriorPull` contract shape. */
export function mapPriorPull(row: PriorPullSourceRow, repoFullName: string): PriorPull {
  return {
    number: row.number,
    title: row.title,
    author: row.author,
    opened_at: row.openedAt ? row.openedAt.toISOString() : null,
    url: `https://github.com/${repoFullName}/pull/${row.number}`,
  };
}

/** Badge fields off `IndexState`, with the blast-computed status/missing_files. */
function mapIndexBadge(
  indexState: IndexState,
  status: BlastIndexBadge['status'],
  missingFiles: string[] | null,
): BlastResponse['index'] {
  return {
    status,
    degraded: indexState.degraded ?? false,
    reason: indexState.degradedReason ?? indexState.reason ?? null,
    files_indexed: indexState.filesIndexed,
    files_skipped: indexState.filesSkipped,
    last_indexed_sha: indexState.lastIndexedSha,
    updated_at: indexState.updatedAt.toISOString(),
    missing_files: missingFiles && missingFiles.length > 0 ? missingFiles : null,
  };
}

/** `"GET /foo"` → `{ method: 'GET', path: '/foo' }`. No space → method `'ANY'`. */
function parseEndpointString(raw: string): { method: string; path: string } {
  const idx = raw.indexOf(' ');
  if (idx === -1) return { method: 'ANY', path: raw };
  return { method: raw.slice(0, idx).toUpperCase(), path: raw.slice(idx + 1) };
}

/**
 * `source_symbols` for an endpoint at `locationFile`: changed symbols DECLARED
 * in that file (depth-0, the endpoint lives in a changed file itself) unioned
 * with changed symbols whose (precise, reference-graph) callers include that
 * file. Endpoints reached ONLY via the file-level import-graph BFS (not via
 * any symbol's own file or caller list) get `[]` here — we know the endpoint
 * is reachable from the PR, but not honestly attributable to one changed
 * symbol, so we don't guess (documented limitation, not a bug).
 */
function computeSourceSymbols(
  locationFile: string,
  changedSymbols: ChangedSymbol[],
  callersBySymbol: Map<string, BlastCallerRow[]>,
): string[] {
  const names = new Set<string>();
  for (const s of changedSymbols) {
    if (s.file === locationFile) {
      names.add(s.name);
      continue;
    }
    const callers = callersBySymbol.get(s.name) ?? [];
    if (callers.some((c) => c.file === locationFile)) names.add(s.name);
  }
  return [...names];
}

export function mapToBlastResponse(
  result: BlastResult,
  indexState: IndexState,
  options: BlastMapOptions = {},
): BlastResponse {
  const {
    changeDetectionMode = 'file-level',
    status = indexState.status as BlastIndexBadge['status'],
    missingFiles = null,
    endpointRefs = [],
    priorPulls = [],
  } = options;

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

  // ---- Read-time junk-file filter ----
  // `file_facts`/`getReachableEndpointRefs` are indexed off EVERY parsed
  // file, including tests/mocks/fixtures — a supertest file that literally
  // writes `app.get('/foo', ...)` to mock a route indexes as a real endpoint
  // otherwise. Drop any endpoint/cron whose SOURCE file is junk (same
  // `isJunkPath` classification `getTopFilesByRank` already uses) before any
  // of it feeds location/dedup/attribution below — this is a read-time
  // filter only, not a re-index: the noisy rows stay in `file_facts`, we
  // just never surface them from this endpoint.
  const cleanEndpointRefs = endpointRefs.filter((r) => !isJunkPath(r.file));
  const cleanFactsByFile = result.factsByFile
    ? Object.fromEntries(
        Object.entries(result.factsByFile).filter(([file]) => !isJunkPath(file)),
      )
    : undefined;

  // ---- Endpoint location/depth resolution (union of the two facade sources) ----
  // 1. `endpointRefs` (BFS import-graph walk, `getReachableEndpointRefs`) —
  //    has a real hop-depth and reaching file. Preferred: keep the min depth.
  // 2. `factsByFile` (1-hop symbol-reference walk, persistent path only) —
  //    no BFS depth available, so a caller-file endpoint gets a best-effort
  //    depth of 1 (a caller of a changed symbol is one hop away) unless the
  //    BFS already placed it more precisely.
  const endpointLoc = new Map<string, { file: string; depth: number }>();
  for (const ref of cleanEndpointRefs) {
    const existing = endpointLoc.get(ref.endpoint);
    if (!existing || ref.depth < existing.depth) {
      endpointLoc.set(ref.endpoint, { file: ref.file, depth: ref.depth });
    }
  }
  if (cleanFactsByFile) {
    for (const [file, facts] of Object.entries(cleanFactsByFile)) {
      for (const endpoint of facts.endpoints) {
        if (!endpointLoc.has(endpoint)) endpointLoc.set(endpoint, { file, depth: 1 });
      }
    }
  }

  // The full set of endpoint strings the facade found, from either source.
  // Any name with no resolvable location — the fully-degraded/ripgrep path
  // (which never attributes endpoints to a file), OR an endpoint that only
  // ever came from a now-filtered junk file — is dropped from the
  // structured list — a fabricated location would be worse than omitting it,
  // and the degraded/ripgrep path already renders with a degraded/
  // unavailable badge.
  const endpointNames = new Set<string>([
    ...result.impactedEndpoints,
    ...cleanEndpointRefs.map((r) => r.endpoint),
  ]);

  const endpoints: BlastEndpointRef[] = [];
  const seenEndpointKey = new Set<string>();
  for (const name of endpointNames) {
    const loc = endpointLoc.get(name);
    if (!loc) continue;
    const { method, path } = parseEndpointString(name);
    const key = `${method} ${path}`;
    if (seenEndpointKey.has(key)) continue;
    seenEndpointKey.add(key);
    endpoints.push({
      method,
      path,
      location: { repository_path: loc.file, line: null },
      source_symbols: computeSourceSymbols(loc.file, changed_symbols, callersBySymbol),
      depth: loc.depth,
    });
  }

  const crons = cleanFactsByFile
    ? [...new Set(Object.values(cleanFactsByFile).flatMap((f) => f.crons))]
    : [];

  const impacts: BlastSymbolImpact[] = changed_symbols.map((symbol) => {
    const bucket = callersBySymbol.get(symbol.name) ?? [];
    // Step-2 cap: at most MAX_CALLERS_PER_SYMBOL callers per changed symbol,
    // keeping the facade's existing rank order (highest rank first). Applied
    // in the blast layer so the invariant holds on every facade path — the
    // facade itself no longer caps per-symbol (T4: it returns everything so
    // this total is TRUE, not an artifact of an earlier global slice).
    const callers = bucket.slice(0, MAX_CALLERS_PER_SYMBOL).map((c) => ({
      symbol: c.symbol,
      file: c.file,
      line: c.line,
      rank: c.rank,
      // The `references` index doesn't distinguish call-sites from
      // import-only refs, so every caller defaults to 'references' —
      // refine only if the index later separates them.
      relation: 'references' as const,
    }));

    const symbolEndpoints = endpoints.filter((e) => e.source_symbols.includes(symbol.name));

    // Per-symbol crons stay attributable via factsByFile of this symbol's
    // (capped) caller files — same asymmetry as before: `[]` on the
    // degraded/ripgrep path (no per-file fact source there). Reads the
    // junk-filtered map, so a cron "found" only in a test/mock caller file
    // never attributes to a symbol either.
    let symbolCrons: string[] = [];
    if (cleanFactsByFile) {
      const cronSet = new Set<string>();
      const callerFiles = new Set(callers.map((c) => c.file));
      for (const file of callerFiles) {
        const facts = cleanFactsByFile[file];
        if (!facts) continue;
        for (const c of facts.crons) cronSet.add(c);
      }
      symbolCrons = [...cronSet];
    }

    return {
      symbol,
      callers,
      callers_total: bucket.length,
      callers_truncated: bucket.length > MAX_CALLERS_PER_SYMBOL,
      endpoints: symbolEndpoints,
      crons: symbolCrons,
    };
  });

  // counts.callers = UNIQUE caller sites across the whole (rendered) result —
  // a caller reaching 2 changed symbols on the same file/line counts once,
  // not once per symbol it reaches.
  const callerSiteKeys = new Set<string>();
  for (const impact of impacts) {
    for (const c of impact.callers) callerSiteKeys.add(`${c.relation}|${c.file}|${c.line}|${c.symbol}`);
  }

  return {
    index: mapIndexBadge(indexState, status, missingFiles),
    change_detection_mode: changeDetectionMode,
    changed_symbols,
    impacts,
    endpoints,
    crons,
    prior_pulls: priorPulls,
    counts: {
      symbols: changed_symbols.length,
      callers: callerSiteKeys.size,
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
    const endpointNames =
      impact.endpoints.map((e) => `${e.method} ${e.path}`).join(', ') || 'none';
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
