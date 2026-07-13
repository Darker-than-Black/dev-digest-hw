import type { CSSProperties } from "react";

export const s = {
  split: { display: "flex", height: "calc(100vh - 52px)" } as CSSProperties,
  listCol: {
    width: 360,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } as CSSProperties,
  listHead: { padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 12 } as CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } as CSSProperties,
  title: { fontSize: 18, fontWeight: 700, flex: 1 } as CSSProperties,
  search: { position: "relative" as const, display: "flex", alignItems: "center" } as CSSProperties,
  searchIcon: { position: "absolute" as const, left: 10, color: "var(--text-muted)" } as CSSProperties,
  searchInput: {
    width: "100%",
    padding: "8px 10px 8px 30px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  } as CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px" } as CSSProperties,
  detailCol: { flex: 1, display: "flex", minWidth: 0, minHeight: 0 } as CSSProperties,
  emptyWrap: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  } as CSSProperties,
};
