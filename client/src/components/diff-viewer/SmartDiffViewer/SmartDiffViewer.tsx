/* SmartDiffViewer — the risk-ordered ("reviewer-ordered") diff panel: a
   split-suggestion banner (only when the PR is flagged too_big) followed by
   the core/wiring/boilerplate group sections, each overlaying every review
   run's findings. Presentational — calls no data hook; the DiffTab
   container owns fetching `smartDiff`/`findings` and passes them in. */
"use client";

import React from "react";
import type { FindingRecord, PrFile, SmartDiffResponse } from "@devdigest/shared";
import { findingsByLine } from "@/lib/smart-diff";
import type { DiffCommentApi } from "../comments";
import { s } from "../styles";
import { SplitSuggestionBanner } from "../SplitSuggestionBanner";
import { SmartDiffGroupSection } from "../SmartDiffGroupSection";

export interface SmartDiffViewerProps {
  smartDiff: SmartDiffResponse;
  files: PrFile[];
  /** Every review run's findings — see `reviewFindings` in `lib/smart-diff`. */
  findings: FindingRecord[];
  commenting?: DiffCommentApi;
  /** Threaded through to SmartDiffFileCard — see its prop docs. */
  focusTarget?: { file: string; line: number | null; nonce: number } | null;
  onOpenFinding?: (findingId: string) => void;
}

export function SmartDiffViewer({
  smartDiff,
  files,
  findings,
  commenting,
  focusTarget,
  onOpenFinding,
}: SmartDiffViewerProps) {
  // The by-path join: SmartDiffFile has no `patch` field by design (decision
  // 2) — the client already holds every patch via PrFile, joined here.
  const patches = React.useMemo(() => new Map(files.map((f) => [f.path, f.patch ?? null])), [files]);

  const findingsFor = React.useCallback(
    (path: string): FindingRecord[] => Array.from(findingsByLine(findings, path).values()).flat(),
    [findings],
  );

  return (
    <div style={s.list}>
      <SplitSuggestionBanner split={smartDiff.split_suggestion} />
      {smartDiff.groups
        .filter((g) => g.files.length > 0)
        .map((g) => (
          <SmartDiffGroupSection
            key={g.role}
            group={g}
            patches={patches}
            findingsFor={findingsFor}
            commenting={commenting}
            focusTarget={focusTarget}
            onOpenFinding={onOpenFinding}
          />
        ))}
    </div>
  );
}
