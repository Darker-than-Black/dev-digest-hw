/** Constants for the DiffViewer. */
import type { SmartDiffRole } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Smart Diff — dot colour + display order per role. Order mirrors the
 * server's `SMART_DIFF_ROLE_ORDER` (core → wiring → boilerplate); titles and
 * hints are copy, not constants — they live in `messages/en/shell.json` under
 * `diffViewer.smartDiff.role.*`.
 */
export const SMART_DIFF_ROLE_META: Record<SmartDiffRole, { dot: string; order: number }> = {
  core: { dot: "var(--crit)", order: 0 },
  wiring: { dot: "var(--warn)", order: 1 },
  boilerplate: { dot: "var(--text-muted)", order: 2 },
};

/** Boilerplate group sections start collapsed — a file inside with findings
   still force-opens (see SmartDiffGroupSection's per-file defaultOpen rule). */
export const BOILERPLATE_DEFAULT_OPEN = false;
