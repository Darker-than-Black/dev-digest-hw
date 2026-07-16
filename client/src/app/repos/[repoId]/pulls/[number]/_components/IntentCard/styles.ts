import type { CSSProperties } from "react";

/** Co-located styles for IntentCard. */
export const s = {
  intentText: {
    fontSize: 14,
    lineHeight: 1.55,
    fontStyle: "italic",
    color: "var(--text-primary)",
    marginTop: 0,
    marginBottom: 18,
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,
  scopeHeading: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginTop: 0,
    marginBottom: 8,
  } satisfies CSSProperties,
  scopeHeadingIn: {
    color: "var(--ok)",
  } satisfies CSSProperties,
  scopeHeadingOut: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  scopeList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  scopeItem: {
    display: "flex",
    gap: 8,
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  scopeItemIn: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  scopeItemOut: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  bullet: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  unavailable: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 0,
    marginBottom: 4,
  } satisfies CSSProperties,
  unavailableHint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginTop: 0,
  } satisfies CSSProperties,
} as const;
