"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Chip } from "@devdigest/ui";
import { DiffViewer, SmartDiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff, usePrReviews } from "@/lib/hooks/reviews";
import { lastReview } from "@/lib/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("shell");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  // Smart Diff (risk-ordered layout + last-review overlay). Ephemeral view
  // preference, not shareable state — plain useState, not searchParams.
  const smartDiffQuery = useSmartDiff(prId);
  const { data: reviewsData } = usePrReviews(prId);
  const review = lastReview(reviewsData);
  const [smartOrder, setSmartOrder] = React.useState(true);
  const smartDiffUnavailable = smartDiffQuery.isLoading || smartDiffQuery.isError;

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
          review={review}
          commenting={commenting}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
