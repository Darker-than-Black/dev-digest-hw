import type { FeatureModelId } from '@devdigest/shared';

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
