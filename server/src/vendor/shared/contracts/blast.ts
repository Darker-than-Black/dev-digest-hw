import { z } from 'zod';
import { ChangedSymbol } from './brief.js';

/**
 * Blast Radius — shared contract for `GET /pulls/:id/blast`.
 *
 * The layered map the `blast/` back-end module produces by reading the
 * `repo-intel` facade (never re-derived here): changed symbols → downstream
 * callers → affected HTTP endpoints / crons, plus the index-freshness badge
 * so the client can render "partial/degraded/unavailable" instead of a blank
 * screen. `ChangedSymbol` is reused as-is from `brief.ts` (`{ name, file, kind }`).
 */

// ---- Index badge — surfaces `repo-intel`'s IndexState so the tab never
// silently shows an empty map when the index is missing/partial/stale.
// `unavailable` is a blast-layer status (index truly absent) distinct from the
// facade's own `full|partial|degraded|failed`. ----
export const BlastIndexBadge = z.object({
  status: z.enum(['full', 'partial', 'degraded', 'failed', 'unavailable']),
  degraded: z.boolean(),
  reason: z.string().nullish(),
  files_indexed: z.number().int(),
  files_skipped: z.number().int(),
  last_indexed_sha: z.string(),
  updated_at: z.string().nullish(),
  /** Changed files absent from the index (→ `partial`). Null when none. */
  missing_files: z.array(z.string()).nullish(),
});
export type BlastIndexBadge = z.infer<typeof BlastIndexBadge>;

// ---- How the changed symbols were detected. `line-level` = diff hunks
// intersected with symbol line ranges (precise). `file-level` = every symbol
// in a touched file (fallback when patch hunks or symbol ranges are missing);
// the UI flags the reduced precision. ----
export const ChangeDetectionMode = z.enum(['line-level', 'file-level']);
export type ChangeDetectionMode = z.infer<typeof ChangeDetectionMode>;

// ---- How a caller reaches a changed symbol. The current `references` index
// does not separate call-sites from import-only refs, so `references` is the
// default; refine when the index distinguishes them. ----
export const CallerRelation = z.enum(['calls', 'imports', 'references']);
export type CallerRelation = z.infer<typeof CallerRelation>;

// ---- One caller of a changed symbol. `rank` is the file-rank of the caller's
// file (0 on the degraded/ripgrep path, which has no persistent rank yet). ----
export const BlastCallerRef = z.object({
  symbol: z.string(),
  file: z.string(),
  line: z.number().int(),
  rank: z.number(),
  relation: CallerRelation,
});
export type BlastCallerRef = z.infer<typeof BlastCallerRef>;

// ---- One affected HTTP endpoint. `location.line` is null — the index stores
// endpoints per file, not per line (no re-index in scope). `source_symbols`
// are the changed symbols this endpoint is reachable from; `depth` is the
// minimum import-graph hop distance. ----
export const CodeLocation = z.object({
  repository_path: z.string(),
  line: z.number().int().nullish(),
});
export type CodeLocation = z.infer<typeof CodeLocation>;

export const BlastEndpointRef = z.object({
  method: z.string(),
  path: z.string(),
  location: CodeLocation,
  source_symbols: z.array(z.string()),
  depth: z.number().int(),
});
export type BlastEndpointRef = z.infer<typeof BlastEndpointRef>;

// ---- One changed symbol's downstream impact: its callers (capped, with the
// pre-cap total), plus the endpoints/crons reachable through them.
// `callers_total` is the count before the 20-cap; `callers_truncated` is true
// when more than the cap existed. ----
export const BlastSymbolImpact = z.object({
  symbol: ChangedSymbol,
  callers: z.array(BlastCallerRef),
  callers_total: z.number().int(),
  callers_truncated: z.boolean(),
  endpoints: z.array(BlastEndpointRef),
  crons: z.array(z.string()),
});
export type BlastSymbolImpact = z.infer<typeof BlastSymbolImpact>;

// ---- One prior PR whose changed files overlap this PR's — surfaces review
// history for the touched files. Real data (no AI note): number/title/author/
// date/link, newest first. ----
export const PriorPull = z.object({
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  opened_at: z.string().nullish(),
  url: z.string().nullish(),
});
export type PriorPull = z.infer<typeof PriorPull>;

// ---- The full response. `endpoints` is the flat, deduped (method + path)
// union across all impacts (feeds the stat-chip row + endpoint list); `crons`
// likewise. `counts` feeds the "N symbols · N callers · N endpoints · N crons"
// summary line — `callers` is the count of UNIQUE caller sites across the whole
// map, not the sum of the capped per-symbol lists. `explanation` is null unless
// `?explain=true` was passed and resolved. ----
export const BlastResponse = z.object({
  index: BlastIndexBadge,
  change_detection_mode: ChangeDetectionMode,
  changed_symbols: z.array(ChangedSymbol),
  impacts: z.array(BlastSymbolImpact),
  endpoints: z.array(BlastEndpointRef),
  crons: z.array(z.string()),
  prior_pulls: z.array(PriorPull),
  counts: z.object({
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
  explanation: z.string().nullish(),
});
export type BlastResponse = z.infer<typeof BlastResponse>;
