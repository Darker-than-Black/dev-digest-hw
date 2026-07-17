import type { BlastIndexBadge, FeatureModelId } from '@devdigest/shared';

/**
 * Blast layer constants. The optional `?explain=true` paragraph resolves its
 * model via the `blast_explain` feature-model setting (Settings UI).
 */

/** Feature-model slot resolved via `resolveFeatureModel`. */
export const BLAST_EXPLAIN_FEATURE_ID: FeatureModelId = 'blast_explain';

/** Token budget for the one-paragraph explanation — kept short + cheap. */
export const EXPLAIN_MAX_TOKENS = 300;

/**
 * Caller fan-out cap PER changed symbol in the rendered map (step 2 of the
 * blast algorithm). Enforced here in the blast layer — not inherited from the
 * facade — so the invariant holds regardless of which facade path served the
 * result: the persistent path caps callers globally and the ripgrep/degraded
 * path doesn't cap at all. Mirrors the value the facade uses internally
 * (`repo-intel/constants.ts:MAX_CALLERS_PER_SYMBOL`), kept as its own constant
 * to avoid a cross-module import.
 */
export const MAX_CALLERS_PER_SYMBOL = 20;

/** How many "prior PRs touching these files" rows to surface, newest first. */
export const PRIOR_PULLS_LIMIT = 5;

/**
 * Badge statuses `?explain=true` is allowed to run on. `degraded` (stale
 * index / ripgrep fallback / safety-cap hit) and `partial` (some changed
 * files missing from the index) still have REAL impact data worth
 * summarizing — only `unavailable` (no data source at all) has nothing to
 * explain. Excluded from this set on purpose, not merely omitted.
 */
export const EXPLAINABLE_STATUSES: ReadonlySet<BlastIndexBadge['status']> = new Set([
  'full',
  'degraded',
  'partial',
]);
