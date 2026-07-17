/* FactChips — endpoint + cron pill rows under a symbol's callers. Endpoints
   render blue, crons amber (matching the PR-detail design). Uses custom pills
   rather than the generic Chip primitive so the whole pill is colour-tinted,
   not just its icon. */
"use client";

import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function FactChips({ endpoints, crons }: { endpoints: string[]; crons: string[] }) {
  if (endpoints.length === 0 && crons.length === 0) return null;
  return (
    <div style={s.chipRow}>
      {endpoints.map((e) => (
        <span key={`endpoint:${e}`} className="mono" style={s.endpointChip}>
          <Icon.Globe size={12} />
          {e}
        </span>
      ))}
      {crons.map((c) => (
        <span key={`cron:${c}`} className="mono" style={s.cronChip}>
          <Icon.Clock size={12} />
          {c}
        </span>
      ))}
    </div>
  );
}
