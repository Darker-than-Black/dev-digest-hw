/* SymbolRow — one changed symbol's downstream impact, expandable to its
   caller list (file:line, deep-linking to the GitHub blob at the PR's head
   sha — callers usually live outside the diff, so the in-app Files-changed
   tab can't show them) plus the endpoints/crons reachable through it.
   Expanded by default when the symbol HAS callers, so the primary impact is
   visible without a click (matches the PR-detail design). */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink, disclosureProps } from "@devdigest/ui";
import type { BlastSymbolImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { FactChips } from "./FactChips";
import { s } from "./styles";

/** Append `()` to function/method names so the tree reads as code (design). */
function displayName(name: string, kind: string): string {
  return /func|method/i.test(kind) ? `${name}()` : name;
}

export function SymbolRow({
  impact,
  repoFullName,
  headSha,
  onViewDiff,
}: {
  impact: BlastSymbolImpact;
  repoFullName: string | null;
  headSha: string;
  /** Jump to the Files-changed tab — the symbol's own declaration IS in the diff. */
  onViewDiff?: () => void;
}) {
  const t = useTranslations("blast");
  const { symbol, callers, endpoints, crons } = impact;
  const [expanded, setExpanded] = useState(callers.length > 0);

  return (
    <div style={s.symbolCard}>
      <div style={s.symbolHeader}>
        {/* Chevron toggles expand; the name is a separate link to the diff, so
            the two affordances don't fight over the same click. */}
        <button
          {...disclosureProps(() => setExpanded((e) => !e), expanded)}
          style={s.disclosureBtn}
          aria-label={t(expanded ? "collapse" : "expand")}
        >
          <Icon.ChevronRight
            size={14}
            style={{
              transform: expanded ? "rotate(90deg)" : undefined,
              transition: "transform .12s",
              color: "var(--text-muted)",
            }}
          />
        </button>
        <Icon.Code size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <MonoLink onClick={onViewDiff}>{displayName(symbol.name, symbol.kind)}</MonoLink>
        <span style={{ flex: 1 }} />
        <span className="tnum" style={s.symbolCallerCount}>
          {t("callerCount", { count: callers.length })}
        </span>
      </div>

      {expanded && (
        <div style={s.symbolBody}>
          {callers.length > 0 ? (
            <ul style={s.callerList}>
              {callers.map((c, i) => (
                <li key={`${c.file}:${c.line}:${i}`} style={s.callerRow}>
                  <span style={s.callerConnector} aria-hidden>
                    └
                  </span>
                  <MonoLink
                    href={
                      repoFullName ? githubBlobUrl(repoFullName, headSha, c.file, c.line) : undefined
                    }
                  >
                    {c.file}:{c.line}
                  </MonoLink>
                </li>
              ))}
            </ul>
          ) : (
            <p style={s.emptyHint}>{t("noCallers")}</p>
          )}
          <FactChips endpoints={endpoints} crons={crons} />
        </div>
      )}
    </div>
  );
}
