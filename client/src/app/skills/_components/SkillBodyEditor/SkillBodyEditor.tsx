/* SkillBodyEditor — a line-numbered Markdown editor with a filename header,
   an "unsaved" badge (dirty vs. the saved body), and a live token estimate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import { estimateTokens } from "../../../../lib/tokens";
import { s } from "./styles";

const LINE_HEIGHT = 20;

export function SkillBodyEditor({
  filename,
  value,
  onChange,
  dirty,
}: {
  filename: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lineCount = Math.max(value.split("\n").length, 1);

  // Keep the line-number gutter aligned with the textarea while scrolling.
  const onScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.FileText size={13} style={{ color: "var(--text-muted)" }} />
        <span className="mono" style={s.filename}>
          {filename}
        </span>
        {dirty && <Badge color="var(--warn)" bg="var(--warn-bg)">{t("config.unsaved")}</Badge>}
        <span style={s.tokens}>{t("config.tokens", { count: estimateTokens(value) })}</span>
      </div>
      <div style={s.editorRow}>
        <div ref={gutterRef} style={s.gutter} aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ height: LINE_HEIGHT }}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          className="mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={onScroll}
          spellCheck={false}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
