/* AffectedEndpoints — the FULL flat, deduped endpoint list (`data.endpoints`),
   not just the ones attributed to a symbol. Some endpoints are BFS-reachable
   from a changed file but not cleanly attributable to any single symbol, so
   they never appear in a per-symbol `FactChips` row — without this section
   the visible endpoint count silently undercounts `counts.endpoints`. Reuses
   `EndpointChip` so a given endpoint renders identically here and per-symbol. */
"use client";

import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { BlastEndpointRef } from "@devdigest/shared";
import { EndpointChip } from "./EndpointChip";
import { ENDPOINT_ICON } from "./constants";
import { s } from "./styles";

export function AffectedEndpoints({
  endpoints,
  repoFullName,
  headSha,
  diffFiles,
  onFocusFile,
}: {
  endpoints: BlastEndpointRef[];
  repoFullName: string | null;
  headSha: string;
  diffFiles: Set<string>;
  onFocusFile?: (file: string, line?: number | null) => void;
}) {
  const t = useTranslations("blast");
  if (endpoints.length === 0) return null;

  return (
    <div style={s.section}>
      <SectionLabel icon={ENDPOINT_ICON}>
        {t("affectedEndpoints.title", { count: endpoints.length })}
      </SectionLabel>
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
      </div>
    </div>
  );
}
