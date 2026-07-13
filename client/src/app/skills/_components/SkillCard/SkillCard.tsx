/* SkillCard — one row in the Skills list: slug, enable toggle, description,
   type + source badges. Click selects it into the detail panel. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle, disclosureProps } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { SOURCE_ICON, TYPE_COLOR } from "../../helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  return (
    <div {...(onClick ? disclosureProps(onClick) : {})} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <span style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </span>
        <span style={s.name} title={skill.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("card.deleteConfirm", { name: skill.name }))) del.mutate(skill.id);
          }}
          disabled={del.isPending}
          title={t("card.deleteTitle")}
          aria-label={t("card.deleteTitle")}
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={TYPE_COLOR[skill.type]}>{t(`type.${skill.type}`)}</Badge>
        <span style={s.sourceRow}>
          {React.createElement(Icon[SOURCE_ICON[skill.source]], { size: 12 })}
          {t(`source.${skill.source}`)}
        </span>
      </div>
    </div>
  );
}
