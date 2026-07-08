import type { CSSProperties } from "react";

export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } as CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  } as CSSProperties,
  title: { fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 700 } as CSSProperties,
  tabsBar: { borderBottom: "1px solid var(--border)", flexShrink: 0, marginTop: 12 } as CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto" } as CSSProperties,

  // ---- tab internals ----
  tabWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 28,
    maxWidth: 900,
  } as CSSProperties,
  tabHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" } as CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } as CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: -8 } as CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } as CSSProperties,
  enabledLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
  } as CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 12 } as CSSProperties,
  savedNote: { fontSize: 12.5, color: "var(--ok)" } as CSSProperties,

  previewCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 24,
    background: "var(--bg-surface)",
  } as CSSProperties,

  // ---- versions ----
  versionsHead: { display: "flex", alignItems: "center", gap: 10 } as CSSProperties,
  versionList: { display: "flex", flexDirection: "column", gap: 10 } as CSSProperties,
  versionRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } as CSSProperties,
  versionTag: {
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--accent)",
    padding: "3px 8px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
  } as CSSProperties,
  versionDate: { fontSize: 12.5, color: "var(--text-muted)" } as CSSProperties,
  diffPre: {
    fontSize: 12.5,
    lineHeight: 1.5,
    maxHeight: "60vh",
    overflow: "auto",
    margin: 0,
  } as CSSProperties,
};
