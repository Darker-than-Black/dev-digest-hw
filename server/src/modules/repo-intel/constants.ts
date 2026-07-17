/**
 * repo-intel constants. Phase-tagged: [T1] used now; [T2]/[T3]
 * exported early so the pipeline lands against a single source of truth.
 */

// --- Job kinds (registered on JobRunner; enqueued from repos/service.ts) ----
export const INDEX_JOB_KIND = 'repo-intel-index';
export const REFRESH_JOB_KIND = 'repo-intel-refresh';
/** Manual "re-analyze": fetch latest from origin + incremental reindex. */
export const RESYNC_JOB_KIND = 'repo-intel-resync';

// --- Walk / parse scope -----------------------------------------------------
/** [T1] Files we parse (diff-scoped in T1; whole walk in T2). */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** [T1] Directories never walked. `.gitignore` is layered on top in T2 walk. */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

// --- Read-time limits -------------------------------------------------------
/** [T1] Caller fan-out cap per changed symbol (ORDER BY rank DESC LIMIT N). */
export const MAX_CALLERS_PER_SYMBOL = 20;

/**
 * Blast-radius global SAFETY cap (T4, additive) — `tryPersistentBlast` no
 * longer slices callers down to `MAX_CALLERS_PER_SYMBOL` globally (that lost
 * per-symbol totals); it now returns every rank-sorted caller so `blast/`
 * can compute true per-symbol totals + apply its own per-symbol cap. This is
 * only a backstop against a pathological PR (huge fan-in across many changed
 * symbols) blowing up the response — generous on purpose, expected to never
 * bind in practice.
 */
export const MAX_CALLERS_GLOBAL_SAFETY_CAP = 500;

/**
 * Blast-radius reachable-endpoint BFS (`getReachableEndpointRefs`) node-visit
 * cap — bounds the reverse-import walk on a pathological/highly-connected
 * graph. When hit, the walk stops expanding but still returns whatever it
 * found (never throws, never blocks the read).
 */
export const ENDPOINT_REACHABILITY_NODE_CAP = 5000;

/**
 * [T1] Bumped whenever the AST extractor or symbol schema changes. A mismatch
 * with `repo_index_state.indexer_version` forces a full reindex.
 *
 * v2 (T3): graph + decl_file resolution + file_rank + repo-map landed, so every
 * T2 `partial` index must be rebuilt to gain the rank-driven data.
 */
export const INDEXER_VERSION = 2;

// --- [T2] Full-index limits (documented now, enforced in the pipeline) ------
export const MAX_INDEXED_FILES = 5000;
export const MAX_FILE_SIZE = 400 * 1024; // 400 KB
export const MAX_PARSE_MS_PER_FILE = 2000;
/** Soft self-watch budget (< JobRunner hard 120s) → finish as `partial`. */
export const INDEX_SOFT_BUDGET_MS = 110_000;

// --- [T3] Graph / hotness / repo-map ---------------------------------------
export const BFS_DEPTH = 2;
export const HOTNESS_WINDOW_DAYS = 180;
export const DEFAULT_REPO_MAP_TOKEN_BUDGET = 1500;
/** Signatures are trimmed to this many chars in the parse phase (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;

/**
 * Path kinds excluded from rank-driven file samples (conventions/onboarding)
 * AND from blast-radius endpoint/cron attribution (a test/mock file that
 * happens to contain a route-registration-looking line — `app.get(...)` in a
 * supertest fixture, say — is noise, not a real endpoint). Substring match on
 * the repo-relative path (kept deliberately simple + deterministic).
 * Originally `getTopFilesByRank`-only; exported (2026-07-17) so `blast/
 * helpers.ts` can reuse the SAME junk definition at read time rather than
 * maintaining a second list that could drift.
 */
export const JUNK_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

export function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  return JUNK_PATH_PATTERNS.some((p) => lower.includes(p));
}
