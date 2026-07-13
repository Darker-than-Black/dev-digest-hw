/* ConventionCard — one extracted convention: the rule (inline-editable), the
   cited evidence as a monospace code block, a confidence bar, and Accept / Reject
   actions. Accepted candidates are highlighted. Wired to `useUpdateConvention`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, ProgressBar, Button } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useUpdateConvention } from "../../../../lib/hooks/conventions";
import { confidenceColor } from "../../helpers";
import { s } from "./styles";

/** Render `evidence_path` with the cited line range, e.g. `src/foo.ts:12-18`. */
function evidenceLabel(c: ConventionCandidate): string {
  if (c.evidence_start_line == null) return c.evidence_path;
  const end = c.evidence_end_line != null && c.evidence_end_line !== c.evidence_start_line
    ? `-${c.evidence_end_line}`
    : "";
  return `${c.evidence_path}:${c.evidence_start_line}${end}`;
}

export function ConventionCard({ candidate }: { candidate: ConventionCandidate }) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention();
  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";

  const [editing, setEditing] = React.useState(false);
  const [draftRule, setDraftRule] = React.useState(candidate.rule);

  const pct = Math.round(candidate.confidence * 100);
  const color = confidenceColor(candidate.confidence);

  const setStatus = (status: ConventionCandidate["status"]) =>
    update.mutate({ id: candidate.id, patch: { status } });

  const saveEdit = () => {
    const rule = draftRule.trim();
    if (rule && rule !== candidate.rule) {
      update.mutate({ id: candidate.id, patch: { rule } });
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftRule(candidate.rule);
    setEditing(false);
  };

  return (
    <div style={s.card(accepted)}>
      <div style={s.headerRow}>
        {editing ? (
          <textarea
            value={draftRule}
            onChange={(e) => setDraftRule(e.target.value)}
            rows={2}
            autoFocus
            style={s.ruleEdit}
          />
        ) : (
          <div style={s.rule}>
            {candidate.rule}
            {candidate.edited && (
              <span style={{ marginLeft: 8 }}>
                <Badge color="var(--text-muted)">{t("card.edited")}</Badge>
              </span>
            )}
          </div>
        )}
        <span style={s.category}>
          <Icon.Tag size={11} />
          {candidate.category}
        </span>
      </div>

      <div style={s.evidence}>
        <span style={s.evidencePath}>
          <Icon.Code size={12} />
          {evidenceLabel(candidate)}
        </span>
        <pre style={s.snippet}>{candidate.evidence_snippet}</pre>
      </div>

      <div style={s.confRow}>
        <div style={s.confLabelRow}>
          <span>{t("card.confidence")}</span>
          <span style={s.confValue(color)}>{pct}%</span>
        </div>
        <ProgressBar value={pct} color={color} />
      </div>

      <div style={s.actions}>
        {editing ? (
          <div style={s.editRow}>
            <Button kind="primary" size="sm" icon="Check" onClick={saveEdit} disabled={update.isPending}>
              {t("card.saveEdit")}
            </Button>
            <Button kind="ghost" size="sm" onClick={cancelEdit}>
              {t("card.cancelEdit")}
            </Button>
          </div>
        ) : (
          <>
            <Button
              kind={accepted ? "secondary" : "primary"}
              size="sm"
              icon="Check"
              onClick={() => setStatus("accepted")}
              disabled={update.isPending || accepted}
            >
              {accepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="Slash"
              onClick={() => setStatus("rejected")}
              disabled={update.isPending || rejected}
            >
              {t("card.reject")}
            </Button>
            <span style={s.spacer} />
            <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditing(true)}>
              {t("card.edit")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
