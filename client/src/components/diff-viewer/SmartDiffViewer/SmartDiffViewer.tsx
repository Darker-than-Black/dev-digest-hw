/* SmartDiffViewer — the risk-ordered ("reviewer-ordered") diff panel: a
   split-suggestion banner (only when the PR is flagged too_big) followed by
   the core/wiring/boilerplate group sections, each overlaying the last
   review's findings. Presentational — calls no data hook; the DiffTab
   container (Item 6) owns fetching `smartDiff`/`review` and passes them in. */
"use client";

import React from "react";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { findingsByLine } from "@/lib/smart-diff";
import type { DiffCommentApi } from "../comments";
import { s } from "../styles";
import { SplitSuggestionBanner } from "../SplitSuggestionBanner";
import { SmartDiffGroupSection } from "../SmartDiffGroupSection";

export interface SmartDiffViewerProps {
  smartDiff: SmartDiffResponse;
  files: PrFile[];
  review: ReviewRecord | null;
  commenting?: DiffCommentApi;
}

export function SmartDiffViewer({ smartDiff, files, review, commenting }: SmartDiffViewerProps) {
  // The by-path join: SmartDiffFile has no `patch` field by design (decision
  // 2) — the client already holds every patch via PrFile, joined here.
  const patches = React.useMemo(() => new Map(files.map((f) => [f.path, f.patch ?? null])), [files]);

  const findingsFor = React.useCallback(
    (path: string): FindingRecord[] => Array.from(findingsByLine(review, path).values()).flat(),
    [review],
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
          />
        ))}
    </div>
  );
}
