/* RunCostBadge — per-run LLM cost, shown in the PR list COST column and the
   agent-runs timeline. One number, one format, both places.

   Rules (course design): completed run with data → cost; no data / running /
   failed → "—", NEVER "$0.00". Format = 3 significant figures ($0.012, not
   $0.01) so tiny runs stay legible. */
"use client";

import React from "react";

/**
 * Format a USD cost with 3 significant figures, trailing zeros stripped.
 *   0.0013   → "$0.0013"
 *   0.012345 → "$0.0123"
 *   0.06     → "$0.06"
 * `null`/`undefined` → "—" (no priced run; never a fake "$0.00").
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  return `$${Number(usd.toPrecision(3))}`;
}

export function RunCostBadge({
  usd,
  variant = "inline",
}: {
  usd: number | null | undefined;
  /** Reserved for future surfaces; only the inline mono span exists today. */
  variant?: "inline";
}) {
  void variant;
  const priced = usd != null;
  return (
    <span
      className="mono tnum"
      style={{ fontSize: 12, color: priced ? "var(--text-primary)" : "var(--text-muted)" }}
    >
      {formatCost(usd)}
    </span>
  );
}
