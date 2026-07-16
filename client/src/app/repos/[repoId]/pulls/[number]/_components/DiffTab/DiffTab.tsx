"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Chip } from "@devdigest/ui";
import { DiffViewer, SmartDiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff, usePrReviews } from "@/lib/hooks/reviews";
import { reviewFindings } from "@/lib/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Cross-tab: a finding's file:line click (Findings tab) — `?tab=diff&finding=<id>`.
      Resolved to a file+line here (any run's findings, not just the last-review
      overlay) and forces Smart order so the target's anchor is visible. */
  focusFindingId?: string | null;
  /** Reverse cross-tab nav: a per-line severity pill click → open that finding
      in the Findings tab (`?tab=findings&finding=<id>`). Container-tier owns
      routing; the diff-viewer components below only call this callback. */
  onOpenFinding?: (findingId: string) => void;
}

export function DiffTab({ prId, filesCount, files, canComment, focusFindingId, onOpenFinding }: DiffTabProps) {
  const t = useTranslations("shell");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  // Smart Diff (risk-ordered layout + findings overlay). Ephemeral view
  // preference, not shareable state — plain useState, not searchParams.
  const smartDiffQuery = useSmartDiff(prId);
  const { data: reviewsData } = usePrReviews(prId);
  const [smartOrder, setSmartOrder] = React.useState(true);
  const smartDiffUnavailable = smartDiffQuery.isLoading || smartDiffQuery.isError;

  // Every run's findings — one source for both the overlay pills and the
  // file:line jump target. Multi-agent review means each agent's pass is its
  // own review row, so a "newest row only" rule would hide most findings
  // (mirrors the server's `SmartDiffService`, which builds `finding_lines`
  // from every review row too).
  const allFindings = React.useMemo(() => reviewFindings(reviewsData), [reviewsData]);
  const [focusTarget, setFocusTarget] = React.useState<{ file: string; line: number; nonce: number } | null>(null);
  React.useEffect(() => {
    if (!focusFindingId) return;
    const target = allFindings.find((f) => f.id === focusFindingId);
    if (!target) return;
    // Original order has no per-line pills/anchors rendered — force Smart
    // order back on so the target is actually visible.
    setSmartOrder(true);
    setFocusTarget((p) => ({ file: target.file, line: target.start_line, nonce: (p?.nonce ?? 0) + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFindingId, allFindings]);

  const commentCount = comments?.length ?? 0;
  const totals = files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 },
  );

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Chip
              active={smartOrder}
              disabled={smartDiffUnavailable}
              onClick={() => setSmartOrder(true)}
            >
              {t("diffViewer.smartDiff.order.smart")}
            </Chip>
            <Chip active={!smartOrder} onClick={() => setSmartOrder(false)}>
              {t("diffViewer.smartDiff.order.original")}
            </Chip>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        {t("diffViewer.filesChangedHeader", {
          count: filesCount,
          additions: totals.additions,
          deletions: totals.deletions,
        })}
      </SectionLabel>
      {/* The smart panel must never be the reason the tab shows nothing — fall
          back to the flat viewer whenever there's no smart-diff data yet
          (loading, error, or simply toggled off). */}
      {smartOrder && smartDiffQuery.data ? (
        <SmartDiffViewer
          smartDiff={smartDiffQuery.data}
          files={files}
          findings={allFindings}
          commenting={commenting}
          focusTarget={focusTarget}
          onOpenFinding={onOpenFinding}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
