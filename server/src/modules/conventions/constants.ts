import type { FeatureModelId } from '@devdigest/shared';

/**
 * L02 — conventions module constants. Sampling roots + prompt token caps live
 * here so the extract pipeline (service.ts / prompt.ts) stays declarative.
 */

/** Feature-model slot resolved via `resolveFeatureModel` (default openai/gpt-5.4). */
export const CONVENTIONS_FEATURE_ID: FeatureModelId = 'conventions';

/** How many top-ranked code files to sample (via repoIntel.getConventionSamples). */
export const SAMPLE_FILE_COUNT = 12;

/**
 * Concrete clone-root config filenames to gather EXPLICITLY — `getConventionSamples`
 * (→ getTopFilesByRank) drops configs/tests via `isJunkPath`, so they must be read
 * by name. `readFiles` returns `content: null` for any that don't exist, so listing
 * every common variant is harmless (missing ones are filtered out downstream).
 */
export const CONFIG_FILENAMES: readonly string[] = [
  // ESLint (legacy .eslintrc*)
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  // ESLint (flat config)
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  // TypeScript
  'tsconfig.json',
  // Prettier
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
];

/**
 * Per-file character cap fed to the prompt. Files longer than this are truncated
 * (a ~4 chars/token heuristic keeps one file well under a few thousand tokens).
 */
export const MAX_FILE_CHARS = 12_000;

/**
 * Total character budget across all sampled files. Once exceeded, remaining files
 * are skipped so the prompt stays bounded regardless of how many files were read.
 */
export const MAX_TOTAL_CHARS = 120_000;
