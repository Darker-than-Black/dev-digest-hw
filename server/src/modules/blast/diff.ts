/**
 * Pure unified-diff parsing over `pr_files.patch` — no I/O, no facade calls.
 * `pr_files` stores only `path`/`additions`/`deletions`/`patch` (no
 * `status`/`previous_path` column), so `detectFileChange` is a best-effort
 * text sniff of that same patch string, not a structured signal.
 */

export interface ChangedLineRange {
  startLine: number;
  endLine: number;
}

// `@@ -a,b +c,d @@` — `b`/`d` default to 1 when omitted (single-line hunk).
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a unified-diff patch into its NEW-side (post-change) changed-line
 * ranges — one per `@@ ... @@` hunk header. A hunk whose new-side count is 0
 * (pure deletion, nothing added on the new side) contributes no range.
 * `null`/empty/hunk-less patches → `[]`.
 */
export function parseChangedLines(patch: string | null): ChangedLineRange[] {
  if (!patch) return [];
  const ranges: ChangedLineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER_RE.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] !== undefined ? Number(m[2]) : 1;
    if (count <= 0) continue;
    ranges.push({ startLine: start, endLine: start + count - 1 });
  }
  return ranges;
}

export interface FileChangeFlags {
  deleted: boolean;
  renamed: boolean;
}

/**
 * Best-effort deleted/renamed detection from the stored patch text —
 * `+++ /dev/null` or a `deleted file mode` header for deletions, `rename
 * from`/`rename to` headers for renames. `null`/empty patch → both `false`
 * (can't tell; the caller treats that as "couldn't resolve" via the missing
 * file-rank check instead).
 */
export function detectFileChange(patch: string | null): FileChangeFlags {
  if (!patch) return { deleted: false, renamed: false };
  const deleted = /^\+\+\+ \/dev\/null/m.test(patch) || /^deleted file mode/m.test(patch);
  const renamed = /^rename from /m.test(patch) && /^rename to /m.test(patch);
  return { deleted, renamed };
}
