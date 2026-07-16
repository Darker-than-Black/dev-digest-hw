import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff classification constants — data + types ONLY, zero logic.
 *
 * `classifyFile` (helpers.ts) is a deliberately simple, deterministic,
 * lowercase-substring classifier — same style as repo-intel's
 * `JUNK_PATH_PATTERNS` (`repo-intel/service.ts`) and `EXCLUDED_DIRS`
 * (`repo-intel/constants.ts`), but NOT imported from there (cross-module
 * reach is forbidden — repo-intel is consumed only via its `service.ts`
 * facade, and these patterns aren't on that facade).
 *
 * This file is the ONLY place a reviewer should tune classification /
 * ordering behaviour. Never inline a pattern literal in `helpers.ts`.
 *
 * Match order (see `classifyFile`): boilerplate → wiring → core (first
 * match wins, default `'core'`). `package-lock.json` is listed before any
 * bare `package` rule so a lock file is never mistaken for a plain
 * `package.json` match (and vice versa — both are boilerplate anyway, but
 * the ordering keeps the intent explicit for future edits).
 */

/** The single source of truth for group order in `SmartDiffResponse.groups`. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

/**
 * Boilerplate: lock files, `package.json`, generated/vendored directories,
 * snapshots, minified/derived artifacts, migration metadata, and docs.
 * Lowercase substring match against the lowercased path.
 */
export const BOILERPLATE_PATTERNS = [
  // Lock files
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'cargo.lock',
  'poetry.lock',
  'go.sum',
  // Manifest (grouped under Boilerplate per the UI reference)
  'package.json',
  // Generated / vendored directories
  '/dist/',
  '/build/',
  '/.next/',
  '/out/',
  '/coverage/',
  '/node_modules/',
  '/vendor/',
  // Snapshots
  '__snapshots__/',
  '.snap',
  // Minified / derived
  '.min.js',
  '.map',
  '.d.ts',
  // Migration metadata
  '/migrations/meta/',
  // Docs
  '.md',
] as const;

/**
 * Wiring: barrels, config files, registries/entry points, and tests.
 * Lowercase substring match against the lowercased path.
 */
export const WIRING_PATTERNS = [
  // Barrels
  '/index.ts',
  '/index.tsx',
  // Configs
  '.config.',
  'tsconfig',
  '.env',
  'docker-compose',
  'dockerfile',
  '.github/',
  // Registries / entry points
  '/routes.ts',
  // Tests
  '.test.',
  '.spec.',
  '__tests__/',
] as const;

/**
 * Tunable: total `additions + deletions` across the PR above which
 * `split_suggestion.too_big` fires.
 */
export const SPLIT_TOO_BIG_LINES = 400;

/**
 * Tunable: minimum distinct top-level path segments required among
 * non-boilerplate files before a split is actually proposed (below this,
 * `proposed_splits` stays empty even when `too_big` is true).
 */
export const SPLIT_MIN_SEGMENTS = 2;
