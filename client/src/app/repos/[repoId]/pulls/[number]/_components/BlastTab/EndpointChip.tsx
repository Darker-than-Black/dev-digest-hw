/* EndpointChip — one endpoint pill: method + path. An endpoint whose file is
   part of THIS PR's diff jumps in-app to the Files-changed tab (its own file
   card — endpoints aren't line-indexed by the repo index, so it's a
   file-level focus, not a line one); anything else deep-links out to the
   GitHub blob at the PR's head sha. Shared by FactChips (per-symbol) and
   AffectedEndpoints (the full flat list) so the two never drift apart. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastEndpointRef } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function EndpointChip({
  endpoint,
  repoFullName,
  headSha,
  diffFiles,
  onFocusFile,
}: {
  endpoint: BlastEndpointRef;
  repoFullName: string | null;
  headSha: string;
  diffFiles: Set<string>;
  onFocusFile?: (file: string, line?: number | null) => void;
}) {
  const t = useTranslations("blast");
  const label = `${endpoint.method} ${endpoint.path}`;
  const content = (
    <>
      <Icon.Globe size={12} />
      {label}
    </>
  );

  if (diffFiles.has(endpoint.location.repository_path) && onFocusFile) {
    return (
      <button
        type="button"
        className="mono"
        style={s.endpointChip}
        onClick={() => onFocusFile(endpoint.location.repository_path, endpoint.location.line ?? null)}
        aria-label={t("endpoint.ariaFocus", { method: endpoint.method, path: endpoint.path })}
      >
        {content}
      </button>
    );
  }

  const href = repoFullName
    ? githubBlobUrl(repoFullName, headSha, endpoint.location.repository_path)
    : undefined;

  return href ? (
    <a
      className="mono"
      style={s.endpointChip}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("endpoint.aria", { method: endpoint.method, path: endpoint.path })}
    >
      {content}
    </a>
  ) : (
    <span className="mono" style={s.endpointChip}>
      {content}
    </span>
  );
}
