import type { CSSProperties } from "react";

const card = (active: boolean, enabled: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  marginBottom: 10,
  borderRadius: 10,
  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  background: active ? "var(--bg-hover)" : "var(--bg-surface)",
  cursor: "pointer",
  opacity: enabled ? 1 : 0.6,
  transition: "border-color 0.12s ease, background 0.12s ease",
});

export const s = {
  card,
  headerRow: { display: "flex", alignItems: "center", gap: 10 } as CSSProperties,
  iconBox: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--bg-elevated)",
    color: "var(--accent)",
    flexShrink: 0,
  } as CSSProperties,
  name: {
    flex: 1,
    minWidth: 0,
    fontFamily: "var(--font-mono)",
    fontSize: 13.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as CSSProperties,
  description: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  } as CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8 } as CSSProperties,
  sourceRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-muted)",
  } as CSSProperties,
};
