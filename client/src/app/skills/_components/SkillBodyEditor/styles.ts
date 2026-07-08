import type { CSSProperties } from "react";

const LINE_HEIGHT = 20;
const mono = "var(--font-mono)";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } as CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } as CSSProperties,
  filename: { fontSize: 12.5, color: "var(--text-secondary)" } as CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
  editorRow: { display: "flex", maxHeight: 460, minHeight: 260 } as CSSProperties,
  gutter: {
    flexShrink: 0,
    padding: "12px 10px 12px 12px",
    textAlign: "right" as const,
    fontFamily: mono,
    fontSize: 12.5,
    lineHeight: `${LINE_HEIGHT}px`,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    userSelect: "none" as const,
  } as CSSProperties,
  textarea: {
    flex: 1,
    resize: "none" as const,
    border: "none",
    outline: "none",
    padding: "12px 14px",
    fontFamily: mono,
    fontSize: 12.5,
    lineHeight: `${LINE_HEIGHT}px`,
    color: "var(--text-primary)",
    background: "transparent",
    tabSize: 2,
  } as CSSProperties,
};
