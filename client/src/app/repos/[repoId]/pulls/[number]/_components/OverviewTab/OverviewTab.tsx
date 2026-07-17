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
  onViewDiff?: () => void;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha, onViewDiff }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <div style={s.grid}>
        <IntentCard prId={prId} />
        <BlastTab
          prId={prId}
          repoFullName={repoFullName}
          headSha={headSha}
          onViewDiff={onViewDiff}
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
