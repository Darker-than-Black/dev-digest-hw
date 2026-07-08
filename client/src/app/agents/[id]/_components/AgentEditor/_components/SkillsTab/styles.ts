import type { CSSProperties } from "react";

const row = (dragging: boolean, checked: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: checked ? "var(--bg-hover)" : "var(--bg-surface)",
  opacity: dragging ? 0.5 : 1,
  cursor: "grab",
});

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12, padding: 28, maxWidth: 820 } as CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } as CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } as CSSProperties,
  filter: { position: "relative" as const, marginLeft: "auto", display: "flex", alignItems: "center" } as CSSProperties,
  filterIcon: { position: "absolute" as const, left: 10, color: "var(--text-muted)" } as CSSProperties,
  filterInput: {
    width: 220,
    padding: "7px 10px 7px 30px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  } as CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)" } as CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } as CSSProperties,
  row,
  handle: { display: "inline-flex", color: "var(--text-muted)", cursor: "grab" } as CSSProperties,
  slug: { fontSize: 13, fontWeight: 500 } as CSSProperties,
};
