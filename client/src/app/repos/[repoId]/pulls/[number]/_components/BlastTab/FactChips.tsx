/* FactChips — endpoint + cron pill rows under a symbol's callers. Endpoints
   render blue, crons amber (matching the PR-detail design). Crons use a
   custom pill (colour-tints the whole chip, not just its icon); endpoints
   delegate to the shared `EndpointChip` (also used by the top-level
   "Affected endpoints" section, so the two never render differently). */
"use client";

import { Icon } from "@devdigest/ui";
import type { BlastEndpointRef } from "@devdigest/shared";
import { EndpointChip } from "./EndpointChip";
import { s } from "./styles";

export function FactChips({
  endpoints,
  crons,
  repoFullName,
  headSha,
  diffFiles,
  onFocusFile,
}: {
  endpoints: BlastEndpointRef[];
  crons: string[];
  repoFullName: string | null;
  headSha: string;
  diffFiles: Set<string>;
  onFocusFile?: (file: string, line?: number | null) => void;
}) {
  if (endpoints.length === 0 && crons.length === 0) return null;
  return (
    <div style={s.chipRow}>
      {endpoints.map((e) => (
        <EndpointChip
          key={`endpoint:${e.method}:${e.path}`}
          endpoint={e}
          repoFullName={repoFullName}
          headSha={headSha}
          diffFiles={diffFiles}
          onFocusFile={onFocusFile}
        />
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
