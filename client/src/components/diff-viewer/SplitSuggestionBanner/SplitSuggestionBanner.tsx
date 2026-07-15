/* SplitSuggestionBanner — argues about the PR as a whole ("this is big,
   consider splitting it"), so it sits above the per-file group layout rather
   than inside one group. Renders nothing when the PR isn't flagged too_big. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Badge, Icon, disclosureProps } from "@devdigest/ui";
import type { ProposedSplit, SmartDiff } from "@devdigest/shared";
import { s, chevronFor } from "../styles";

export interface SplitSuggestionBannerProps {
  split: SmartDiff["split_suggestion"];
}

export function SplitSuggestionBanner({ split }: SplitSuggestionBannerProps) {
  const t = useTranslations("shell");
  if (!split.too_big) return null;

  return (
    <Card style={s.splitCard}>
      <div style={s.splitHeader}>
        <Icon.AlertTriangle size={15} style={{ color: "var(--warn)" }} />
        <span style={s.splitTitle}>{t("diffViewer.smartDiff.split.title")}</span>
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("diffViewer.smartDiff.split.totalLines", { count: split.total_lines })}
        </Badge>
      </div>
      {split.proposed_splits.map((p) => (
        <SplitRow key={p.name} split={p} />
      ))}
    </Card>
  );
}

function SplitRow({ split }: { split: ProposedSplit }) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(false);
  return (
    <div style={s.splitRow}>
      <div {...disclosureProps(() => setOpen((o) => !o), open)} style={s.splitRowHeader}>
        <Icon.ChevronRight size={12} style={chevronFor(open)} />
        <Icon.GitBranch size={13} style={{ color: "var(--text-muted)" }} />
        <span className="mono" style={s.splitRowName}>
          {split.name}
        </span>
        <Badge>{t("diffViewer.smartDiff.split.splitFiles", { count: split.files.length })}</Badge>
      </div>
      {open && (
        <div style={s.splitFileList}>
          {split.files.map((f) => (
            <span key={f} className="mono" style={s.splitFilePath}>
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
