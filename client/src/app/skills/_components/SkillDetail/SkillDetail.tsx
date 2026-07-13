/* SkillDetail — the right-hand panel: header (slug, type, version, Run on evals)
   + Config / Preview / Evals(stub) / Stats(stub) / Versions tabs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TYPE_COLOR } from "../../helpers";
import { SKILL_TABS, STUB_ICON } from "./constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { StubTab } from "./_components/StubTab";
import { s } from "./styles";

export function SkillDetail({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  const t = useTranslations("skills");
  const tabs = SKILL_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }));

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <span style={s.title}>{skill.name}</span>
        <Badge color={TYPE_COLOR[skill.type]}>{t(`type.${skill.type}`)}</Badge>
        <Badge color="var(--text-secondary)" mono icon="GitBranch">
          v{skill.version}
        </Badge>
        <div style={{ marginLeft: "auto" }}>
          <Button kind="secondary" size="sm" icon="Play" disabled title={t("page.runOnEvals")}>
            {t("page.runOnEvals")}
          </Button>
        </div>
      </div>

      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 28px" />
      </div>

      <div style={s.body}>
        {tab === "config" && <ConfigTab key={skill.id} skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
        {tab === "evals" && (
          <StubTab icon={STUB_ICON.evals} title={t("stub.evals.title")} body={t("stub.evals.body")} />
        )}
        {tab === "stats" && (
          <StubTab icon={STUB_ICON.stats} title={t("stub.stats.title")} body={t("stub.stats.body")} />
        )}
      </div>
    </div>
  );
}
