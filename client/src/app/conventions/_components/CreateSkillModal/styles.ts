import type { CSSProperties } from "react";

export const s = {
  pane: { display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 } as CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
  } as CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 10 } as CSSProperties,
  enabledLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } as CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } as CSSProperties,
  loading: { padding: "24px 0", textAlign: "center" as const, color: "var(--text-muted)", fontSize: 13 } as CSSProperties,
};
