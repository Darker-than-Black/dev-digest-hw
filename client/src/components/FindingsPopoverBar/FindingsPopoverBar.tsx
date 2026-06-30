/* FindingsPopoverBar — severity counters that open a click popover listing that
   severity's findings (title · category · file:line · confidence · rationale).
   Clicking a finding navigates to it. Used on both the PR list (lazy-fetched
   findings) and the PR detail page (findings in hand).

   The panel is portalled to <body> with fixed positioning so it is never clipped
   by an ancestor `overflow: hidden` (the PR-list table card has one). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  SeverityCounters,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  Icon,
  SEV,
  type SeverityCounts,
  type Sev,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "./styles";

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

function FindingRow({ f, onSelect }: { f: FindingRecord; onSelect: () => void }) {
  const [h, setH] = React.useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onSelect}
      style={s.row(h)}
    >
      <div style={s.rowTitleLine}>
        <SeverityBadge severity={f.severity as Severity} compact />
        <span style={s.rowTitle}>{f.title}</span>
        <CategoryTag category={f.category as Category} />
      </div>
      <div style={s.rowMeta}>
        <span className="mono" style={s.rowFile}>
          {f.file}:{lineLabel(f)}
        </span>
        <ConfidenceNum value={f.confidence} />
      </div>
      <div style={s.rowSnippet}>{f.rationale}</div>
    </button>
  );
}

export function FindingsPopoverBar({
  counts,
  findings,
  loading,
  onOpenSeverity,
  onSelectFinding,
  hideZero,
}: {
  counts: SeverityCounts;
  /** Findings to draw the popover from. `undefined` ⇒ not loaded yet (list). */
  findings?: FindingRecord[];
  loading?: boolean;
  /** Fired when a severity popover opens — host can lazy-load `findings`. */
  onOpenSeverity?: (sev: Sev) => void;
  onSelectFinding: (f: FindingRecord) => void;
  hideZero?: boolean;
}) {
  const [openSev, setOpenSev] = React.useState<Sev | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const place = React.useCallback(() => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
  }, []);

  React.useEffect(() => {
    if (!openSev) return;
    place();
    const onDocDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (barRef.current?.contains(tgt) || panelRef.current?.contains(tgt)) return;
      setOpenSev(null);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpenSev(null);
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [openSev, place]);

  const toggle = (sev: Sev) => {
    // Compute from current state in the handler (not inside the setState updater)
    // so the parent's onOpenSeverity isn't invoked during render.
    const next = openSev === sev ? null : sev;
    setOpenSev(next);
    if (next) onOpenSeverity?.(next);
  };

  const active = openSev ? new Set<Sev>([openSev]) : undefined;
  const list = openSev ? (findings ?? []).filter((f) => f.severity === openSev) : [];
  const isLoading = !!loading && findings === undefined;

  return (
    // stopPropagation: on the PR list the row itself is clickable — keep counter
    // and popover clicks from navigating the row.
    <div ref={barRef} style={s.bar} onClick={(e) => e.stopPropagation()}>
      <SeverityCounters counts={counts} active={active} onToggle={toggle} hideZero={hideZero} />
      {openSev &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{ ...s.panel, top: pos.top, left: pos.left }}
            role="dialog"
            aria-label={`${SEV[openSev].label} findings`}
          >
            <div style={s.panelHeader}>
              <Icon.AlertOctagon size={13} style={{ color: SEV[openSev].c }} />
              {isLoading
                ? "Loading…"
                : `${list.length} ${SEV[openSev].label} finding${list.length === 1 ? "" : "s"}`}
            </div>
            {isLoading ? (
              <div style={s.empty}>
                <Icon.RefreshCw size={14} style={{ animation: "ddspin 1s linear infinite" }} />
              </div>
            ) : list.length === 0 ? (
              <div style={s.empty}>No findings.</div>
            ) : (
              <div style={s.rows}>
                {list.map((f) => (
                  <FindingRow
                    key={f.id}
                    f={f}
                    onSelect={() => {
                      setOpenSev(null);
                      onSelectFinding(f);
                    }}
                  />
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
