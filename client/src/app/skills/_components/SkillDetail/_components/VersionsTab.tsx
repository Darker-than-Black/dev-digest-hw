/* Skill Versions tab — immutable body history with per-version Diff + Restore.
   Restoring writes an old body back as a new current version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { diffLines } from "diff";
import { Badge, Button, Modal, Skeleton, EmptyState } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useToast } from "../../../../../lib/toast";
import { useSkillVersions, useRestoreSkillVersion } from "../../../../../lib/hooks/skills";
import { s } from "../styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);

  if (isLoading) return <div style={s.tabWrap}><Skeleton height={72} /><Skeleton height={72} /></div>;
  if (!versions || versions.length === 0) {
    return (
      <div style={s.tabWrap}>
        <EmptyState icon="History" title={t("versions.title")} body={t("versions.noVersions")} />
      </div>
    );
  }

  const doRestore = (v: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version: v }))) return;
    restore.mutate(
      { id: skill.id, version: v },
      { onSuccess: (data) => toast.success(t("versions.restored", { version: data.version })) },
    );
  };

  return (
    <div style={s.tabWrap}>
      <div style={s.versionsHead}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge color="var(--text-secondary)">{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      <div style={s.versionList}>
        {versions.map((v) => {
          const current = v.version === skill.version;
          return (
            <div key={v.version} style={s.versionRow}>
              <span style={s.versionTag}>v{v.version}</span>
              <span style={s.versionDate}>{new Date(v.created_at).toLocaleString()}</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                {current ? (
                  <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                    {t("versions.current")}
                  </Badge>
                ) : (
                  <>
                    <Button kind="ghost" size="sm" icon="FileText" onClick={() => setDiffOf(v)}>
                      {t("versions.diff")}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
                      onClick={() => doRestore(v.version)}
                      disabled={restore.isPending}
                    >
                      {t("versions.restore")}
                    </Button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {diffOf && (
        <Modal width={1000} title={t("versions.diffTitle", { version: diffOf.version })} onClose={() => setDiffOf(null)}>
          <pre className="mono" style={s.diffPre}>
            {diffLines(diffOf.body, skill.body).map((part, i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  whiteSpace: "pre-wrap",
                  background: part.added ? "var(--ok-bg)" : part.removed ? "var(--crit-bg)" : "transparent",
                  color: part.added ? "var(--ok)" : part.removed ? "var(--crit)" : "var(--text-secondary)",
                }}
              >
                {part.value
                  .replace(/\n$/, "")
                  .split("\n")
                  .map((line) => `${part.added ? "+" : part.removed ? "-" : " "} ${line}`)
                  .join("\n")}
              </span>
            ))}
          </pre>
        </Modal>
      )}
    </div>
  );
}
