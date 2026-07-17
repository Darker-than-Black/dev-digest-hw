import type { CSSProperties } from "react";

/** Co-located styles for BlastTab + its sub-components. */
export const s = {
  statRow: {
    display: "flex",
    gap: 4,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  /** Lighter, icon+text treatment (mock parity) — a plain button instead of
     the old heavy bordered `Badge` pill, since these are now sort controls. */
  statChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "background .12s, color .12s",
  } satisfies CSSProperties,
  statChipActive: {
    color: "var(--text-primary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  badgeRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 16,
  } satisfies CSSProperties,
  badgeText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  badgeReason: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  precisionNotice: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 16,
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    gap: 6,
    marginBottom: 16,
  } satisfies CSSProperties,
  symbolList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  symbolCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  symbolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
  } satisfies CSSProperties,
  disclosureBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolCallerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  symbolBody: {
    padding: "0 12px 14px 34px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  callerList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    // flex-start (not center) because callerPath below can now WRAP to a
    // second line on a long path — center would float the connector/icon to
    // the wrapped block's middle instead of its first line.
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
  } satisfies CSSProperties,
  callerConnector: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 13,
    color: "var(--text-muted)",
    flexShrink: 0,
    lineHeight: 1,
  } satisfies CSSProperties,
  callerRelationIcon: {
    display: "inline-flex",
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  /** A flex item's default min-width is `auto` (its own content width) — a
     long `file:line` would otherwise push the row wider than the card
     instead of wrapping. `minWidth: 0` lets it shrink; `overflowWrap` breaks
     the path (not just at spaces, which mono paths have none of). */
  callerPath: {
    minWidth: 0,
    flex: "1 1 auto",
    overflowWrap: "anywhere",
    textAlign: "left",
  } satisfies CSSProperties,
  emptyHint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  endpointChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--accent-text, #7aa2f7)",
    background: "color-mix(in srgb, var(--accent, #4f7cff) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--accent, #4f7cff) 30%, transparent)",
    // `chipRow`'s flexWrap only wraps chips ONTO new rows — a single chip
    // whose own path is longer than the row still needs to wrap internally,
    // or it overflows past the card edge same as the caller-path bug above.
    maxWidth: "100%",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  cronChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--warn, #e0a458)",
    background: "color-mix(in srgb, var(--warn, #e0a458) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--warn, #e0a458) 30%, transparent)",
    maxWidth: "100%",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  section: {
    marginTop: 20,
  } satisfies CSSProperties,
  explanation: {
    fontSize: 13.5,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    marginTop: 0,
  } satisfies CSSProperties,
  graphLegend: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 10,
  } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    flexShrink: 0,
  } satisfies CSSProperties,
  priorPullsHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  } satisfies CSSProperties,
  priorPullsTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  priorPullsList: {
    listStyle: "none",
    margin: "10px 0 0",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  priorPullsRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    paddingLeft: 22,
  } satisfies CSSProperties,
  priorPullsRowMain: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  } satisfies CSSProperties,
  priorPullsNumber: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  priorPullsLink: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  priorPullsMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
