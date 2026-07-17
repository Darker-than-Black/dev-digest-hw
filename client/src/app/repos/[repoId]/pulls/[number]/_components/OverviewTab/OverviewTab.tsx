"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastTab } from "../BlastTab";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
  /** The PR's changed file paths — Blast Radius uses this to tell an in-diff
     caller/symbol/endpoint (in-app scroll via `onFocusFile`) from an
     off-diff one (GitHub link fallback instead). */
  diffFiles: string[];
  /** Jump to the Files-changed tab, focused on a file(+line when known). */
  onFocusFile?: (file: string, line?: number | null) => void;
}

export function OverviewTab({
  prBody,
  prId,
  repoFullName,
  headSha,
  diffFiles,
  onFocusFile,
}: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <div style={s.grid}>
        <IntentCard prId={prId} />
        <BlastTab
          prId={prId}
          repoFullName={repoFullName}
          headSha={headSha}
          diffFiles={diffFiles}
          onFocusFile={onFocusFile}
        />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
