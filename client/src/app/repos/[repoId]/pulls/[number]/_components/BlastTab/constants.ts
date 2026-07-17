import type { IconName } from "@devdigest/ui";
import type { BlastIndexBadge, CallerRelation } from "@devdigest/shared";

/** Icon + color per `index.status` — the badge never renders a blank state,
   even on `degraded`/`failed`/`unavailable` (see IndexBadge). `unavailable`
   gets its own icon (distinct from `failed`'s XCircle) so a truly-missing
   index reads differently from a build that ran and failed. */
export const STATUS_ICON: Record<BlastIndexBadge["status"], IconName> = {
  full: "CheckCircle",
  partial: "AlertTriangle",
  degraded: "AlertTriangle",
  failed: "XCircle",
  unavailable: "AlertOctagon",
};

export const STATUS_COLOR: Record<BlastIndexBadge["status"], string> = {
  full: "var(--ok)",
  partial: "var(--warn)",
  degraded: "var(--warn)",
  failed: "var(--crit)",
  unavailable: "var(--crit)",
};

/** Icon per caller `relation` — the index can't yet distinguish call-sites
   from import-only refs (`references` is the common default), but the icon
   still gives callers a visual hint once it can. */
export const RELATION_ICON: Record<CallerRelation, IconName> = {
  calls: "ArrowRight",
  imports: "Boxes",
  references: "Eye",
};

export const EXPLAIN_ICON = "Sparkles" as const;
export const ENDPOINT_ICON = "Globe" as const;
export const CRON_ICON = "Clock" as const;
export const CALLERS_ICON = "Users" as const;
