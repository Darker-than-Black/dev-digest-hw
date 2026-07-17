/* BlastTab — Blast Radius: changed symbols → downstream callers → affected
   endpoints/crons, read off the repo-intel index (zero tokens by default).
   Container tier: owns the `useBlast` query + the local Tree/Graph and
   Explain UI state; sub-components (IndexBadge, SymbolRow, FactChips) are
   render-only. Never a blank screen — an unindexed/degraded repo still
   renders the badge + reason instead of an empty tab. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, IconBtn, Chip, Badge, Skeleton } from "@devdigest/ui";
import { useBlast } from "@/lib/hooks/blast";
import { IndexBadge } from "./IndexBadge";
import { SymbolRow } from "./SymbolRow";
import { EXPLAIN_ICON, ENDPOINT_ICON, CRON_ICON, CALLERS_ICON } from "./constants";
import { s } from "./styles";

type ViewMode = "tree" | "graph";

interface BlastTabProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
  /** Jump to the Files-changed tab for a changed symbol's own file. */
  onViewDiff?: () => void;
}

export function BlastTab({ prId, repoFullName, headSha, onViewDiff }: BlastTabProps) {
  const t = useTranslations("blast");
  const [explain, setExplain] = useState(false);
  const [view, setView] = useState<ViewMode>("tree");
  const { data, isLoading, isFetching } = useBlast(prId, { explain });

  if (isLoading) {
    return (
      <Card>
        <SectionLabel icon="Activity">{t("title")}</SectionLabel>
        <Skeleton height={80} />
      </Card>
    );
  }

  // Distinct from the loading branch above — a real fetch failure (network,
  // PR not found) lands here instead of skeletoning forever. The index's own
  // degraded/partial state is NOT this branch: that's still a successful 200
  // and is handled by IndexBadge inside the populated view below.
  if (!data) {
    return (
      <Card>
        <SectionLabel icon="Activity">{t("title")}</SectionLabel>
        <p style={s.emptyHint}>{t("unavailable")}</p>
      </Card>
    );
  }

  const { index, changed_symbols, impacts, counts, explanation } = data;
  const noDownstream = changed_symbols.length === 0;
  const explainDisabled = !prId || index.degraded || noDownstream;

  return (
    <Card>
      <SectionLabel
        icon="Activity"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Chip active={view === "tree"} onClick={() => setView("tree")}>
              {t("view.tree")}
            </Chip>
            <Chip active={view === "graph"} onClick={() => setView("graph")}>
              {t("view.graph")}
            </Chip>
            <IconBtn
              icon={EXPLAIN_ICON}
              label={explain && isFetching ? t("explain.loading") : t("explain.action")}
              onClick={() => setExplain(true)}
              disabled={explainDisabled}
              loading={explain && isFetching}
            />
          </div>
        }
      >
        {t("title")}
      </SectionLabel>

      {/* Only surface the index badge when it's NOT full — a healthy index
          stays out of the way (matches the design's clean header). */}
      {index.status !== "full" && <IndexBadge index={index} />}

      <div style={s.statRow}>
        <Badge icon="Layers">
          {counts.symbols} {t("stat.symbols")}
        </Badge>
        <Badge icon={CALLERS_ICON}>
          {counts.callers} {t("stat.callers")}
        </Badge>
        <Badge icon={ENDPOINT_ICON}>
          {counts.endpoints} {t("stat.endpoints")}
        </Badge>
        <Badge icon={CRON_ICON}>
          {counts.crons} {t("stat.crons")}
        </Badge>
      </div>

      {noDownstream ? (
        <p style={s.emptyHint}>{t("noDownstream", { count: changed_symbols.length })}</p>
      ) : view === "tree" ? (
        <div style={s.symbolList}>
          {impacts.map((impact) => (
            <SymbolRow
              key={`${impact.symbol.file}:${impact.symbol.name}`}
              impact={impact}
              repoFullName={repoFullName}
              headSha={headSha}
              onViewDiff={onViewDiff}
            />
          ))}
        </div>
      ) : (
        <div role="img" aria-label={t("graph.ariaLabel")} style={s.emptyHint}>
          {t("graph.empty")}
        </div>
      )}

      {explain && explanation && (
        <div style={s.section}>
          <SectionLabel icon={EXPLAIN_ICON}>{t("explain.title")}</SectionLabel>
          <p style={s.explanation}>{explanation}</p>
        </div>
      )}
    </Card>
  );
}
