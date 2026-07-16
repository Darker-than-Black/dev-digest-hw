import type { Intent, PrIntentRecord } from '@devdigest/shared';

/**
 * Pure helpers for the intent layer — no DB, no fs, no network. Path safety
 * (`safeRepoPath`) is the one SECURITY-CRITICAL piece: a plan-file path is
 * parsed from user-controlled PR body text and later handed to
 * `repoIntel.readFiles`, which does a plain `join(clonePath, path)` with NO
 * traversal guard of its own — so every path MUST pass this gate first.
 */

/** `closes #123` / `fixes #123` / `resolves #123` / bare `#123` (mirrors octokit.ts). */
const ISSUE_REF_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

/** First issue number referenced in the PR body, if any. */
export function parseIssueRef(body: string): number | undefined {
  const m = body.match(ISSUE_REF_RE);
  if (!m?.[1]) return undefined;
  return Number(m[1]);
}

/**
 * Repo-relative `.md` paths under `docs/`, `specs/`, or `plans/` referenced in
 * the body — as a plain path or inside an inline markdown link
 * `[text](docs/plans/foo.md)`. Matches only when the path starts right after a
 * delimiter (whitespace / `(` / `<` / `[` / start-of-string) so an absolute
 * path like `/docs/x.md` is NOT captured (its `docs` is preceded by `/`, not a
 * delimiter). This is a best-effort extraction, NOT the security boundary —
 * `safeRepoPath` below is the mandatory gate before any path reaches disk.
 */
const PLAN_PATH_RE = /(?:^|[\s([<])((?:docs|specs|plans)\/[\w\-./]+\.md)/gi;

export function parsePlanPaths(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(PLAN_PATH_RE)) {
    const path = m[1];
    if (path) out.add(path);
  }
  return [...out];
}

/**
 * SECURITY — reject any path that could escape the repo clone root:
 *   - any `..` path segment (traversal),
 *   - any absolute path (`/etc/passwd`),
 *   - any leading `/`.
 * `repoIntel.readFiles` joins this path onto the clone directory with no guard
 * of its own, and the path originates from user-controlled PR body text — a
 * missing/weak check here is a path-traversal read of arbitrary files on disk.
 */
export function safeRepoPath(p: string): boolean {
  if (!p || p.trim().length === 0) return false;
  if (p.startsWith('/')) return false;
  if (p.includes('\0')) return false;
  const segments = p.split('/');
  if (segments.some((seg) => seg === '..' || seg === '.')) return false;
  // Windows-style absolute / drive paths (defense in depth; clone paths are POSIX).
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\')) return false;
  return true;
}

/** The subset of a `pr_files` row `buildFileList` needs (no DB row import). */
export interface PrFileHeaders {
  path: string;
  patch?: string | null;
}

const HUNK_HEADER_RE = /^@@ .* @@.*$/gm;

/**
 * Headers-only file list: for each PR file, its path plus the `@@ … @@` hunk
 * header lines pulled from the stored `patch` (GitHub-provided, so the header
 * carries trailing function-context text). NO diff body (+/- lines) is ever
 * included. Deliberately does NOT go through `parseUnifiedDiff` — that parser
 * keeps only the four numeric fields and drops the trailing context text.
 */
export function buildFileList(prFiles: PrFileHeaders[]): string {
  const blocks: string[] = [];
  for (const f of prFiles) {
    const headers = f.patch ? [...f.patch.matchAll(HUNK_HEADER_RE)].map((m) => m[0]) : [];
    const block =
      headers.length > 0 ? `${f.path}\n${headers.join('\n')}` : f.path;
    blocks.push(block);
  }
  return blocks.join('\n\n');
}

/** Persisted-shape mapper: `Intent` + the `pr_id` it scopes. */
export function toPrIntentRecord(intent: Intent, prId: string): PrIntentRecord {
  return { ...intent, pr_id: prId };
}
