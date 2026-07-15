import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_PATTERNS,
  SMART_DIFF_ROLE_ORDER,
  SPLIT_MIN_SEGMENTS,
  SPLIT_TOO_BIG_LINES,
  WIRING_PATTERNS,
} from './constants.js';

/**
 * Pure Smart Diff composition helpers — no DB, no fs, no network. Modeled on
 * `modules/intent/helpers.ts`: local structural interfaces stand in for a
 * Drizzle row so this file never imports one.
 *
 * `pseudocode_summary` MUST stay `null` in every `SmartDiffFile` this module
 * produces — that is a locked product decision (no LLM call, ever), NOT an
 * omission to "fill in later" here.
 */

/** The subset of a `pr_files` row this module needs (no DB row import). */
export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

/** The subset of a `findings` row this module needs (no DB row import). */
export interface SmartDiffInputFinding {
  file: string;
  start_line: number;
}

/**
 * Classify a PR file path into a risk role. Lowercases once, then first
 * pattern match wins in order boilerplate → wiring → core (default). See
 * `constants.ts` for the pattern lists — this function never inlines one.
 */
export function classifyFile(path: string): SmartDiffRole {
  const lower = path.toLowerCase();
  if (BOILERPLATE_PATTERNS.some((p) => lower.includes(p))) return 'boilerplate';
  if (WIRING_PATTERNS.some((p) => lower.includes(p))) return 'wiring';
  return 'core';
}

/**
 * Finding start-lines for one PR file: exact `file` match against `path`,
 * `start_line` only (never the end of the range — a wide range would
 * explode the array and the UI anchors on the start line anyway), deduped
 * and sorted ascending. A finding whose `file` matches no PR file is
 * dropped silently.
 */
export function findingLinesFor(path: string, findings: SmartDiffInputFinding[]): number[] {
  const lines = new Set<number>();
  for (const f of findings) {
    if (f.file === path) lines.add(f.start_line);
  }
  return [...lines].sort((a, b) => a - b);
}

/**
 * Build all three role groups, always all three (even empty) — a stable
 * shape the client can render without existence checks. Within a group,
 * sort by (finding_lines.length desc, additions+deletions desc, path asc):
 * risk first, then churn, path as the deterministic tiebreak.
 */
export function buildGroups(
  files: SmartDiffInputFile[],
  findings: SmartDiffInputFinding[],
): SmartDiffGroup[] {
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>(
    SMART_DIFF_ROLE_ORDER.map((role) => [role, []]),
  );

  for (const file of files) {
    const role = classifyFile(file.path);
    const smartDiffFile: SmartDiffFile = {
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLinesFor(file.path, findings),
    };
    byRole.get(role)?.push(smartDiffFile);
  }

  return SMART_DIFF_ROLE_ORDER.map((role) => {
    const groupFiles = (byRole.get(role) ?? []).slice().sort((a, b) => {
      if (b.finding_lines.length !== a.finding_lines.length) {
        return b.finding_lines.length - a.finding_lines.length;
      }
      const churnA = a.additions + a.deletions;
      const churnB = b.additions + b.deletions;
      if (churnB !== churnA) return churnB - churnA;
      return a.path.localeCompare(b.path);
    });
    return { role, files: groupFiles };
  });
}

/** First path segment; a repo-root-level file (no `/`) groups as `"root"`. */
function firstSegment(path: string): string {
  const idx = path.indexOf('/');
  return idx === -1 ? 'root' : path.slice(0, idx);
}

/**
 * Split suggestion: `total_lines` over ALL files; `too_big` when it exceeds
 * `SPLIT_TOO_BIG_LINES`. When `too_big`, group non-boilerplate files by
 * first path segment and propose one split per segment (sorted by file
 * count desc, then name asc) — but only when there are
 * `>= SPLIT_MIN_SEGMENTS` segments, else `proposed_splits: []`. When
 * `!too_big`, always `proposed_splits: []`. Never null.
 */
export function buildSplitSuggestion(files: SmartDiffInputFile[]): SmartDiff['split_suggestion'] {
  const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const too_big = total_lines > SPLIT_TOO_BIG_LINES;

  if (!too_big) {
    return { too_big, total_lines, proposed_splits: [] };
  }

  const bySegment = new Map<string, string[]>();
  for (const file of files) {
    if (classifyFile(file.path) === 'boilerplate') continue;
    const segment = firstSegment(file.path);
    const list = bySegment.get(segment);
    if (list) list.push(file.path);
    else bySegment.set(segment, [file.path]);
  }

  if (bySegment.size < SPLIT_MIN_SEGMENTS) {
    return { too_big, total_lines, proposed_splits: [] };
  }

  const proposed_splits = [...bySegment.entries()]
    .map(([name, filePaths]) => ({ name, files: filePaths }))
    .sort((a, b) => {
      if (b.files.length !== a.files.length) return b.files.length - a.files.length;
      return a.name.localeCompare(b.name);
    });

  return { too_big, total_lines, proposed_splits };
}

/** Compose the full `SmartDiff` from PR files + the overlay findings. */
export function composeSmartDiff(
  files: SmartDiffInputFile[],
  findings: SmartDiffInputFinding[],
): SmartDiff {
  return {
    groups: buildGroups(files, findings),
    split_suggestion: buildSplitSuggestion(files),
  };
}
