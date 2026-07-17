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

const SCROLL_RETRY_MS = 150;
const SCROLL_RETRY_ATTEMPTS = 10; // ~1.5s total — covers the smart-diff query
// still being in flight when the target anchor's effect first fires.

/** Scroll a `[data-diff-line]`/`[data-file-card]` anchor into view + flash
   it. The anchor may not exist YET on the first attempt — e.g. Smart order
   was just forced on but `useSmartDiff` hasn't resolved, so this file's
   `SmartDiffFileCard` (and its anchors) haven't mounted at all — so this
   retries for ~1.5s before giving up, rather than a single fixed-delay
   attempt that silently no-ops if the DOM isn't ready yet. Shared by the
   header badge's jumpToFirstFinding and the incoming cross-tab focusTarget
   effect below. */
function scrollAndFlash(selector: string, attempt = 0): void {
  const el = document.querySelector(selector);
  if (!el) {
    if (attempt < SCROLL_RETRY_ATTEMPTS) {
      window.setTimeout(() => scrollAndFlash(selector, attempt + 1), SCROLL_RETRY_MS);
    }
    return;
  }
  // `behavior:"auto"`, NOT `"smooth"`: a programmatic smooth scroll silently
  // no-ops on the app's nested `<main overflow:auto>` scroll container for
  // far/off-screen targets (verified: smooth left scrollTop at 0; auto jumps
  // correctly). Correctness of the jump beats the scroll animation.
  el.scrollIntoView({ behavior: "auto", block: "center" });
  el.classList.add("dd-finding-flash");
  window.setTimeout(() => el.classList.remove("dd-finding-flash"), 1500);
}

export interface SmartDiffFileCardProps {
  file: SmartDiffFile;
  patch: string | null;
  role: SmartDiffRole;
  findings: FindingRecord[];
  defaultOpen: boolean;
  commenting?: DiffCommentApi;
  /** Cross-tab: a finding's file:line click (Findings tab) resolved to a
      file+line to open/scroll/flash on arrival. Only acted on when it targets
      THIS file — every other file card no-ops. `nonce` re-fires on repeat
      clicks to the same finding. `line: null` = focus the FILE only (open +
      scroll the card into view), no per-line flash — used by Blast Radius's
      symbol/endpoint clicks, which know the file but have no line (endpoints
      aren't line-indexed; a changed symbol's own contract has no line field). */
  focusTarget?: { file: string; line: number | null; nonce: number } | null;
  /** Reverse cross-tab nav: a per-line severity pill click → open that
      finding in the Findings tab (`?tab=findings&finding=<id>`). */
  onOpenFinding?: (findingId: string) => void;
}

export function SmartDiffFileCard({
  file,
  patch,
  role,
  findings,
  defaultOpen,
  commenting,
  focusTarget,
  onOpenFinding,
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
    window.setTimeout(() => scrollAndFlash(`[data-diff-line="${file.path}:${firstLine}"]`), 320);
  }, [file.path, file.finding_lines]);

  // Incoming cross-tab jump (a finding's file:line click on the Findings tab,
  // or a Blast Radius caller/symbol/endpoint click). Only this file's card
  // acts when `focusTarget.file` matches; every other card's effect is a
  // no-op. Opens the card first (mirrors jumpToFirstFinding above) so a
  // collapsed file still reveals its target. A finding target always has a
  // `line` and works for ANY finding — including one from an older run with
  // no `finding_lines` entry — because every line with a `newNo` carries a
  // `data-diff-line` anchor now. `line: null` (file-only target) instead
  // scrolls the file card's own header into view via `data-file-card`.
  React.useEffect(() => {
    if (!focusTarget || focusTarget.file !== file.path) return;
    setOpen(true);
    const selector =
      focusTarget.line != null
        ? `[data-diff-line="${file.path}:${focusTarget.line}"]`
        : `[data-file-card="${file.path}"]`;
    window.setTimeout(() => scrollAndFlash(selector), 320);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.nonce, focusTarget?.file, focusTarget?.line, file.path]);

  return (
    <div data-role={role} data-file-card={file.path} style={s.fileCard}>
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
              // Every line with a new-side line number gets a jump-to-line
              // anchor, not only flagged ones — a finding from an older run
              // (not in this Smart Diff overlay's `finding_lines`) still needs
              // somewhere for its file:line click to land.
              const diffLineKey = ln.newNo != null ? `${file.path}:${ln.newNo}` : undefined;
              if (!lineFindings || lineFindings.length === 0) {
                return (
                  <CodeLine
                    key={key}
                    ln={ln}
                    path={file.path}
                    threads={threadsForLine(ln, matched)}
                    commenting={commenting}
                    dataDiffLine={diffLineKey}
                  />
                );
              }
              const topSev = topSeverity(lineFindings);
              const color = SEV[topSev].c;
              const pillFinding = lineFindings.find((f) => f.severity === topSev) ?? lineFindings[0]!;
              return (
                <div key={key} data-diff-line={diffLineKey} style={findingLineWrap(color)}>
                  <CodeLine
                    ln={ln}
                    path={file.path}
                    threads={threadsForLine(ln, matched)}
                    commenting={commenting}
                  />
                  <button
                    type="button"
                    aria-label={t("diffViewer.smartDiff.openFinding")}
                    style={s.smartFindingPillBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenFinding?.(pillFinding.id);
                    }}
                  >
                    <SeverityBadge severity={topSev} compact />
                  </button>
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
