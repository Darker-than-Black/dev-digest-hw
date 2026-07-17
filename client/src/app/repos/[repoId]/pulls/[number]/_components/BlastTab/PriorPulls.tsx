/* PriorPulls — "Prior PRs touching these files" collapsible block, below the
   symbol tree. Real history (no AI note): number, title (linked to GitHub
   when `url` is known), author + opened date, newest first (server order).
   Hidden entirely when there's no history — never an empty section. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, disclosureProps } from "@devdigest/ui";
import type { PriorPull } from "@devdigest/shared";
import { s } from "./styles";

/** `opened_at` is an ISO string from the server — render a short local date,
   falling back to the raw string (never throwing) if it doesn't parse. */
function formatOpenedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PriorPulls({ pulls }: { pulls: PriorPull[] }) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(true);

  if (pulls.length === 0) return null;

  return (
    <div style={s.section}>
      <button {...disclosureProps(() => setOpen((o) => !o), open)} style={s.priorPullsHeader}>
        <Icon.ChevronRight
          size={14}
          style={{
            transform: open ? "rotate(90deg)" : undefined,
            transition: "transform .12s",
            color: "var(--text-muted)",
          }}
        />
        <Icon.History size={13} style={{ color: "var(--text-muted)" }} />
        <span style={s.priorPullsTitle}>{t("priorPulls.title", { count: pulls.length })}</span>
      </button>

      {open && (
        <ul style={s.priorPullsList}>
          {pulls.map((p) => {
            const date = formatOpenedAt(p.opened_at);
            return (
              <li key={p.number} style={s.priorPullsRow}>
                <div style={s.priorPullsRowMain}>
                  <span className="tnum" style={s.priorPullsNumber}>
                    #{p.number}
                  </span>
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={s.priorPullsLink}
                    >
                      {p.title}
                    </a>
                  ) : (
                    <span style={s.priorPullsLink}>{p.title}</span>
                  )}
                </div>
                <div style={s.priorPullsMeta}>
                  {date ? t("priorPulls.meta", { author: p.author, date }) : p.author}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
