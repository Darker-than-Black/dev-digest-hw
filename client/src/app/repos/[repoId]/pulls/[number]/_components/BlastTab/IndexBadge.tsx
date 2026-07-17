/* IndexBadge — surfaces the repo-intel index's freshness so the tab never
   silently shows an empty map on an unindexed/partially-indexed repo: always
   renders a status pill, and a reason line whenever the index isn't `full`
   (falling back to generic copy if the facade didn't send one). */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { BlastIndexBadge } from "@devdigest/shared";
import { STATUS_ICON, STATUS_COLOR } from "./constants";
import { s } from "./styles";

export function IndexBadge({ index }: { index: BlastIndexBadge }) {
  const t = useTranslations("blast");
  return (
    <div style={s.badgeRow}>
      <Badge icon={STATUS_ICON[index.status]} color={STATUS_COLOR[index.status]} bg="var(--bg-hover)">
        {t(`index.status.${index.status}`)}
      </Badge>
      {index.status !== "full" && (
        <div style={s.badgeText}>
          <span style={s.badgeReason}>{index.reason || t("index.reasonFallback")}</span>
        </div>
      )}
    </div>
  );
}
