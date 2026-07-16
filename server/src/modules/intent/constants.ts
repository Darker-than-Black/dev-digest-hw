import type { FeatureModelId } from '@devdigest/shared';

/**
 * Intent layer constants. The classifier + spec compressor both resolve their
 * model via the `review_intent` feature-model setting (Settings UI, already
 * wired end-to-end).
 */

/** Feature-model slot resolved via `resolveFeatureModel`. */
export const INTENT_FEATURE_ID: FeatureModelId = 'review_intent';

/**
 * Token budget for the gathered spec (inline body + repo plan file + linked
 * issue, combined). Above this, `condenseSpec` summarizes it with a second
 * cheap LLM call before it reaches `deriveIntent`.
 */
export const SPEC_TOKEN_CAP = 4000;

/**
 * Hard character cap used as the degrade path when `condenseSpec` itself
 * fails (or its LLM call errors) — a blunt truncate that never throws.
 */
export const MAX_SPEC_CHARS = 8000;
