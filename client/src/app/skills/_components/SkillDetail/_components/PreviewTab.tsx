/* Skill Preview tab — the body rendered exactly as the reviewing agent sees it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "../styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.tabWrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      <div style={s.previewCard}>
        {skill.body.trim() ? (
          <Markdown>{skill.body}</Markdown>
        ) : (
          <span style={s.muted}>{t("preview.empty")}</span>
        )}
      </div>
    </div>
  );
}
