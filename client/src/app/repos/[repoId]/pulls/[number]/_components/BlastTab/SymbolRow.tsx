/* SymbolRow — one changed symbol's downstream impact, expandable to its
   caller list (file:line) plus the endpoints/crons reachable through it. A
   caller/endpoint in this PR's diff (`diffFiles`) jumps in-app to the
   Files-changed tab, focused + scrolled to it (`onFocusFile`); everything
   else deep-links out to the GitHub blob at the PR's head sha instead — most
   callers live OUTSIDE the diff, so the in-app tab usually can't show them.
   Expanded by default ONLY for the first symbol (index 0) when it has
   callers — auto-expanding every symbol with callers got noisy on PRs with
   several changed symbols, so only the top-ranked one opens for free.
   `expandSignal` lets the header's expand/collapse-ALL control override that
   per-row: a bumped `nonce` snaps this row's state to `expanded`, then the
   row is freely toggleable again via its own chevron — same "openNonce"
   pattern as `ReviewRunAccordion`'s open-by-finding-id. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink, disclosureProps } from "@devdigest/ui";
import type { BlastSymbolImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { RELATION_ICON } from "./constants";
import { FactChips } from "./FactChips";
import { s } from "./styles";

/** Append `()` to function/method names so the tree reads as code (design). */
function displayName(name: string, kind: string): string {
  return /func|method/i.test(kind) ? `${name}()` : name;
}

export function SymbolRow({
  impact,
  index,
  repoFullName,
  headSha,
  expandSignal,
  diffFiles,
  onFocusFile,
}: {
  impact: BlastSymbolImpact;
  /** Position within the impacts list — only index 0 auto-expands. */
  index: number;
  repoFullName: string | null;
  headSha: string;
  expandSignal?: { expanded: boolean; nonce: number };
  /** The PR's changed file paths — a caller in this set gets an in-app
     focus+scroll; anything else falls back to a GitHub link. */
  diffFiles: Set<string>;
  /** Jump to the Files-changed tab, focused on a file(+line when known). */
  onFocusFile?: (file: string, line?: number | null) => void;
}) {
  const t = useTranslations("blast");
  const { symbol, callers, callers_total, callers_truncated, endpoints, crons } = impact;
  const [expanded, setExpanded] = useState(index === 0 && callers.length > 0);
  const lastNonce = useRef(expandSignal?.nonce ?? 0);

  useEffect(() => {
    if (expandSignal && expandSignal.nonce !== lastNonce.current) {
      lastNonce.current = expandSignal.nonce;
      setExpanded(expandSignal.expanded);
    }
  }, [expandSignal]);

  // Callers is always shown; endpoints/crons only join in when there are
  // any, so a symbol with no downstream facts doesn't read "0 endpoints".
  const metaParts = [t("callerCount", { count: callers_total })];
  if (endpoints.length > 0) metaParts.push(t("symbolEndpointCount", { count: endpoints.length }));
  if (crons.length > 0) metaParts.push(t("symbolCronCount", { count: crons.length }));

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
        {/* The symbol's own declaration IS in the diff by definition (that's
            how it's "changed") — always an in-app focus, never a GitHub
            fallback. No line: `ChangedSymbol` doesn't carry one. */}
        <MonoLink onClick={() => onFocusFile?.(symbol.file, null)}>
          {displayName(symbol.name, symbol.kind)}
        </MonoLink>
        <span style={{ flex: 1 }} />
        <span className="tnum" style={s.symbolCallerCount}>
          {metaParts.join(" · ")}
        </span>
      </div>

      {expanded && (
        <div style={s.symbolBody}>
          {callers.length > 0 ? (
            <>
              <ul style={s.callerList}>
                {callers.map((c, i) => {
                  const RelationIcon = Icon[RELATION_ICON[c.relation]];
                  // Callers usually live OUTSIDE this PR's diff (they weren't
                  // themselves changed) — only the ones that happen to be in
                  // a changed file get the in-app focus+scroll; everything
                  // else falls back to the GitHub blob link, same as before.
                  const inDiff = diffFiles.has(c.file);
                  return (
                    <li key={`${c.file}:${c.line}:${i}`} style={s.callerRow}>
                      <span style={s.callerConnector} aria-hidden>
                        └
                      </span>
                      <span title={t(`relation.${c.relation}`)} style={s.callerRelationIcon}>
                        <RelationIcon size={12} />
                      </span>
                      {inDiff && onFocusFile ? (
                        <MonoLink style={s.callerPath} onClick={() => onFocusFile(c.file, c.line)}>
                          {c.file}:{c.line}
                        </MonoLink>
                      ) : (
                        <MonoLink
                          style={s.callerPath}
                          href={
                            repoFullName
                              ? githubBlobUrl(repoFullName, headSha, c.file, c.line)
                              : undefined
                          }
                        >
                          {c.file}:{c.line}
                        </MonoLink>
                      )}
                    </li>
                  );
                })}
              </ul>
              {callers_truncated && (
                <p style={s.emptyHint}>
                  {t("callersTruncated", { shown: callers.length, total: callers_total })}
                </p>
              )}
            </>
          ) : (
            <p style={s.emptyHint}>{t("noCallers")}</p>
          )}
          <FactChips
            endpoints={endpoints}
            crons={crons}
            repoFullName={repoFullName}
            headSha={headSha}
            diffFiles={diffFiles}
            onFocusFile={onFocusFile}
          />
        </div>
      )}
    </div>
  );
}
