import { z } from 'zod';
import { ChangedSymbol } from './brief.js';

/**
 * Blast Radius — shared contract for `GET /pulls/:id/blast`.
 *
 * The layered map the `blast/` back-end module produces by reading the
 * `repo-intel` facade (never re-derived here): changed symbols → downstream
 * callers → affected HTTP endpoints / crons, plus the index-freshness badge
 * so the client can render "partial/degraded" instead of a blank screen.
 * `ChangedSymbol` is reused as-is from `brief.ts` (`{ name, file, kind }`).
 */

// ---- Index badge — surfaces `repo-intel`'s IndexState so the tab never
// silently shows an empty map when the index is missing/partial. ----
export const BlastIndexBadge = z.object({
  status: z.enum(['full', 'partial', 'degraded', 'failed']),
  degraded: z.boolean(),
  reason: z.string().nullish(),
  files_indexed: z.number().int(),
  files_skipped: z.number().int(),
  last_indexed_sha: z.string(),
  updated_at: z.string().nullish(),
});
export type BlastIndexBadge = z.infer<typeof BlastIndexBadge>;

// ---- One caller of a changed symbol. `rank` is the file-rank percentile of
// the caller's file (0 on the degraded/ripgrep path, which has no persistent
// rank yet). ----
export const BlastCallerRef = z.object({
  symbol: z.string(),
  file: z.string(),
  line: z.number().int(),
  rank: z.number(),
});
export type BlastCallerRef = z.infer<typeof BlastCallerRef>;

// ---- One changed symbol's downstream impact: its callers, plus the
// endpoints/crons reachable through those callers. ----
export const BlastSymbolImpact = z.object({
  symbol: ChangedSymbol,
  callers: z.array(BlastCallerRef),
  endpoints: z.array(z.string()),
  crons: z.array(z.string()),
});
export type BlastSymbolImpact = z.infer<typeof BlastSymbolImpact>;

// ---- The full response. `endpoints`/`crons` are the flat, deduped unions
// across all impacts (feed the stat-chip row); `counts` feeds the
// "N symbols · N callers · N endpoints · N crons" summary line.
// `explanation` is null unless `?explain=true` was passed and resolved. ----
export const BlastResponse = z.object({
  index: BlastIndexBadge,
  changed_symbols: z.array(ChangedSymbol),
  impacts: z.array(BlastSymbolImpact),
  endpoints: z.array(z.string()),
  crons: z.array(z.string()),
  counts: z.object({
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
  explanation: z.string().nullish(),
});
export type BlastResponse = z.infer<typeof BlastResponse>;
