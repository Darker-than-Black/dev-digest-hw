import type { CSSProperties } from "react";

export const s = {
  pane: { display: "flex", flexDirection: "column", gap: 14, paddingTop: 16 } as CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } as CSSProperties,
  dropzone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: "32px 20px",
    borderRadius: 10,
    border: "1.5px dashed var(--border)",
    background: "var(--bg-surface)",
    cursor: "pointer",
    textAlign: "center" as const,
  } as CSSProperties,
  dropLabel: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } as CSSProperties,
  dropHint: { fontSize: 12, color: "var(--text-muted)", maxWidth: 360 } as CSSProperties,
  trust: {
    display: "flex",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } as CSSProperties,
  trustTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } as CSSProperties,
  trustBody: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.45 } as CSSProperties,
  ignored: { display: "flex", flexDirection: "column", gap: 6 } as CSSProperties,
  ignoredTitle: { fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
  ignoredList: { display: "flex", flexWrap: "wrap" as const, gap: 6 } as CSSProperties,
};
