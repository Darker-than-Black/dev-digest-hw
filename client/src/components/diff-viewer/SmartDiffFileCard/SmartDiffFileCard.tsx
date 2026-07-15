/* SmartDiffFileCard — one collapsible file in the Smart Diff panel: header
   (path, +/- stat, red dot + "N findings" badge) and, when open, its parsed
   lines with a per-line severity gutter/pill overlay on flagged lines.
   Structural model: FileCard.tsx — this is the Smart-Diff-aware sibling that
   additionally overlays the last review's findings and supports jump-to-line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, SeverityBadge, SEV, disclosureProps } from "@devdigest/ui";
import type { FindingRecord, SmartDiffFile, SmartDiffRole } from "@devdigest/shared";
import { topSeverity } from "@/lib/smart-diff";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor, findingLineWrap } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old) — mirrors FileCard.tsx. */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Group an already-file-scoped findings array by `start_line` for the
   per-line gutter/pill overlay (the flat `findings` prop is already exactly
   this file's findings — see `SmartDiffViewer`'s `findingsFor`). */
function groupByLine(findings: FindingRecord[]): Map<number, FindingRecord[]> {
  const map = new Map<number, FindingRecord[]>();
  for (const f of findings) {
    const list = map.get(f.start_line) ?? [];
    list.push(f);
    map.set(f.start_line, list);
  }
  return map;
}

export interface SmartDiffFileCardProps {
  file: SmartDiffFile;
  patch: string | null;
  role: SmartDiffRole;
  findings: FindingRecord[];
  defaultOpen: boolean;
  commenting?: DiffCommentApi;
}

export function SmartDiffFileCard({
  file,
  patch,
  role,
  findings,
  defaultOpen,
  commenting,
}: SmartDiffFileCardProps) {
  const t = useTranslations("shell");
  // `defaultOpen` is computed once by the parent group section (one place —
  // see SmartDiffGroupSection) and only consumed as the initial value here.
  const [open, setOpen] = React.useState(defaultOpen);
  const lines = React.useMemo(() => parsePatch(patch), [patch]);
  const byLine = React.useMemo(() => groupByLine(findings), [findings]);

  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const hasFindings = findings.length > 0;

  // Mirrors FindingsTab.tsx's navigate-to-finding pattern: open the card, then
  // scroll + flash the first flagged line once it's had a tick to render.
  const jumpToFirstFinding = React.useCallback(() => {
    const firstLine = file.finding_lines[0];
    if (firstLine == null) return;
    setOpen(true);
    window.setTimeout(() => {
      const el = document.querySelector(`[data-diff-line="${file.path}:${firstLine}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("dd-finding-flash");
      window.setTimeout(() => el.classList.remove("dd-finding-flash"), 1500);
    }, 320);
  }, [file.path, file.finding_lines]);

  return (
    <div data-role={role} style={s.fileCard}>
      <div {...disclosureProps(() => setOpen((o) => !o), open)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        {hasFindings && <Badge dot color="var(--crit)" bg="transparent" style={{ padding: 0 }} />}
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {hasFindings && (
          <button
            type="button"
            aria-label={t("diffViewer.smartDiff.findingCount", { count: findings.length })}
            style={s.findingsBadgeBtn}
            onClick={(e) => {
              e.stopPropagation();
              jumpToFirstFinding();
            }}
          >
            <SeverityBadge severity={topSeverity(findings)} count={findings.length} compact />
          </button>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const key = ln.kind === "hunk" ? `h${i}` : `${ln.kind}-${ln.newNo ?? ln.oldNo}`;
              const lineFindings = ln.newNo != null ? byLine.get(ln.newNo) : undefined;
              const codeLine = (
                <CodeLine
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                />
              );
              if (!lineFindings || lineFindings.length === 0) {
                return <React.Fragment key={key}>{codeLine}</React.Fragment>;
              }
              const color = SEV[topSeverity(lineFindings)].c;
              return (
                <div
                  key={key}
                  data-diff-line={`${file.path}:${ln.newNo}`}
                  style={findingLineWrap(color)}
                >
                  {codeLine}
                  <span style={s.smartFindingPill}>
                    <SeverityBadge severity={topSeverity(lineFindings)} compact />
                  </span>
                </div>
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
