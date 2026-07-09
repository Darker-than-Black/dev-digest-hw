import type { CSSProperties } from "react";

export const s = {
  wrap: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "28px 24px 64px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } as CSSProperties,
  header: { display: "flex", flexDirection: "column", gap: 14 } as CSSProperties,
  titleRow: { display: "flex", alignItems: "flex-start", gap: 12 } as CSSProperties,
  titleCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } as CSSProperties,
  title: { fontSize: 20, fontWeight: 700, lineHeight: 1.3 } as CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)" } as CSSProperties,
  actionRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const } as CSSProperties,
  counter: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    fontVariantNumeric: "tabular-nums",
  } as CSSProperties,
  spacer: { flex: 1 } as CSSProperties,
  list: { display: "flex", flexDirection: "column" } as CSSProperties,
  emptyWrap: { padding: "48px 24px", display: "flex", justifyContent: "center" } as CSSProperties,
};
