import React from "react";
import { SeverityBadge } from "./Badge";

/** The three real severities, in fixed display order (no INFO on the list). */
const ORDER = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
export type Sev = (typeof ORDER)[number];

export type SeverityCounts = Record<Sev, number>;

/**
 * SeverityCounters — renders `n CRITICAL · n WARNING · n SUGGESTION` from a
 * per-severity count map, reusing `SeverityBadge`.
 *
 * - Display-only (default): pass `counts` only.
 * - Interactive filter: pass `active` (selected set) + `onToggle`. Each severity
 *   becomes a toggle button (`aria-pressed`); when anything is selected, the
 *   unselected ones dim. An empty `active` set means "all shown".
 */
export function SeverityCounters({
  counts,
  active,
  onToggle,
  hideZero,
}: {
  counts: SeverityCounts;
  active?: Set<Sev>;
  onToggle?: (s: Sev) => void;
  hideZero?: boolean;
}) {
  const interactive = typeof onToggle === "function";
  const hasSelection = (active?.size ?? 0) > 0;
  const shown = ORDER.filter((sev) => !hideZero || counts[sev] > 0);

  if (shown.length === 0) return null;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {shown.map((sev, i) => {
        const badge = <SeverityBadge severity={sev} count={counts[sev]} compact />;
        const node = interactive ? (
          <button
            key={sev}
            type="button"
            aria-pressed={active?.has(sev) ?? false}
            onClick={() => onToggle!(sev)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              borderRadius: 5,
              // Dim the unselected severities once a filter is active.
              opacity: hasSelection && !active?.has(sev) ? 0.4 : 1,
              transition: "opacity .1s",
            }}
          >
            {badge}
          </button>
        ) : (
          <span key={sev} style={{ display: "inline-flex" }}>
            {badge}
          </span>
        );
        return (
          <React.Fragment key={sev}>
            {i > 0 && <span style={{ color: "var(--text-muted)", userSelect: "none" }}>·</span>}
            {node}
          </React.Fragment>
        );
      })}
    </div>
  );
}
