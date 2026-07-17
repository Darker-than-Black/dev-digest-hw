import type { IconName } from "@devdigest/ui";
import type { BlastIndexBadge } from "@devdigest/shared";

/** Icon + color per `index.status` — the badge never renders a blank state,
   even on `degraded`/`failed` (see IndexBadge). */
export const STATUS_ICON: Record<BlastIndexBadge["status"], IconName> = {
  full: "CheckCircle",
  partial: "AlertTriangle",
  degraded: "AlertTriangle",
  failed: "XCircle",
};

export const STATUS_COLOR: Record<BlastIndexBadge["status"], string> = {
  full: "var(--ok)",
  partial: "var(--warn)",
  degraded: "var(--warn)",
  failed: "var(--crit)",
};

export const EXPLAIN_ICON = "Sparkles" as const;
export const ENDPOINT_ICON = "Globe" as const;
export const CRON_ICON = "Clock" as const;
export const CALLERS_ICON = "Users" as const;
