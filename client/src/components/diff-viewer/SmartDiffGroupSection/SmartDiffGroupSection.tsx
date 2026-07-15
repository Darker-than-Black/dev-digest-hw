/* SmartDiffGroupSection — one role section (core / wiring / boilerplate) of
   the Smart Diff panel: a coloured dot + role title/hint + file count header,
   then the group's file cards. Owns the single per-file `defaultOpen` rule so
   it's computed in exactly one place. */
"use client";

import { useTranslations } from "next-intl";
import type { FindingRecord, SmartDiffGroup } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES, BOILERPLATE_DEFAULT_OPEN, SMART_DIFF_ROLE_META } from "../constants";
import type { DiffCommentApi } from "../comments";
import { s } from "../styles";
import { SmartDiffFileCard } from "../SmartDiffFileCard";

export interface SmartDiffGroupSectionProps {
  group: SmartDiffGroup;
  patches: Map<string, string | null>;
  findingsFor: (path: string) => FindingRecord[];
  commenting?: DiffCommentApi;
}

export function SmartDiffGroupSection({ group, patches, findingsFor, commenting }: SmartDiffGroupSectionProps) {
  const t = useTranslations("shell");
  if (group.files.length === 0) return null;
  const meta = SMART_DIFF_ROLE_META[group.role];

  return (
    <div style={s.smartGroupSection}>
      <div style={s.smartGroupHeader}>
        <span aria-hidden style={{ ...s.smartGroupDot, background: meta.dot }} />
        <span style={s.smartGroupTitle}>{t(`diffViewer.smartDiff.role.${group.role}.title`)}</span>
        <span style={s.smartGroupHint}>{t(`diffViewer.smartDiff.role.${group.role}.hint`)}</span>
        <span style={s.smartGroupCount}>
          {t("diffViewer.smartDiff.fileCount", { count: group.files.length })}
        </span>
      </div>
      <div style={s.smartGroupFiles}>
        {group.files.map((file) => {
          const findings = findingsFor(file.path);
          const churn = file.additions + file.deletions;
          // A flagged file must never hide, in any group — that's the whole
          // point of the feature. Otherwise: core/wiring auto-expand under the
          // shared churn threshold; boilerplate starts collapsed.
          const defaultOpen =
            file.finding_lines.length > 0
              ? true
              : group.role === "boilerplate"
                ? BOILERPLATE_DEFAULT_OPEN
                : churn <= AUTO_EXPAND_MAX_LINES;
          return (
            <SmartDiffFileCard
              key={file.path}
              file={file}
              patch={patches.get(file.path) ?? null}
              role={group.role}
              findings={findings}
              defaultOpen={defaultOpen}
              commenting={commenting}
            />
          );
        })}
      </div>
    </div>
  );
}
