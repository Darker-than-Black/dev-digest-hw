/* BlastTab — Blast Radius: changed symbols → downstream callers → affected
   endpoints/crons/prior PRs, read off the repo-intel index (zero tokens by
   default). Container tier: owns the `useBlast` query + the local Explain/
   view/sort/expand-all UI state; sub-components (IndexBadge, SymbolRow,
   FactChips, StatChips, AffectedEndpoints, PriorPulls, BlastGraph) are
   render-only. Never a blank screen — an unindexed/degraded repo still
   renders the badge + reason instead of an empty tab, and a truly-missing
   index (`unavailable`) gets its own dedicated state instead of a misleading
   "0 impact". */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Button, Chip, Checkbox, Icon, Skeleton } from "@devdigest/ui";
import { useBlast } from "@/lib/hooks/blast";
import { IndexBadge } from "./IndexBadge";
import { SymbolRow } from "./SymbolRow";
import { StatChips } from "./StatChips";
import { AffectedEndpoints } from "./AffectedEndpoints";
import { PriorPulls } from "./PriorPulls";
import { BlastGraph } from "./BlastGraph";
import { sortImpacts, nextSort, type ImpactSort, type SortKey } from "./sort";
import { EXPLAIN_ICON } from "./constants";
import { s } from "./styles";

type ViewMode = "tree" | "graph";

interface BlastTabProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
  /** The PR's changed file paths — tells an in-diff caller/symbol/endpoint
     (in-app scroll via `onFocusFile`) from an off-diff one (GitHub link
     fallback instead; most callers live outside the diff). */
  diffFiles: string[];
  /** Jump to the Files-changed tab, focused on a file(+line when known). */
  onFocusFile?: (file: string, line?: number | null) => void;
}

export function BlastTab({ prId, repoFullName, headSha, diffFiles, onFocusFile }: BlastTabProps) {
  const t = useTranslations("blast");
  const [explain, setExplain] = useState(false);
  const [view, setView] = useState<ViewMode>("tree");
  const [sort, setSort] = useState<ImpactSort | null>(null);
  // `expandAll` is what the header checkbox shows; `expandNonce` is the
  // "signal" each SymbolRow watches to snap to it (bumping the nonce, not
  // just the boolean, is what lets clicking the SAME state twice in a row —
  // e.g. expand-all after some rows were manually re-collapsed — still apply).
  const [expandAll, setExpandAll] = useState(false);
  const [expandNonce, setExpandNonce] = useState(0);
  const { data, isLoading, isFetching } = useBlast(prId, { explain });

  function handleExpandAllChange(next: boolean) {
    setExpandAll(next);
    setExpandNonce((n) => n + 1);
  }

  function handleSort(key: SortKey) {
    setSort((current) => nextSort(current, key));
  }

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

  const { index, change_detection_mode, changed_symbols, impacts, counts, prior_pulls, explanation } =
    data;

  // A truly-missing index (never built / unreadable) is distinct from a
  // degraded/partial one that still has *some* data: never render the
  // zero-count stat row in this state — that reads as "nothing breaks",
  // which is exactly the misleading impression the spec calls out.
  if (index.status === "unavailable") {
    return (
      <Card>
        <SectionLabel icon="Activity">{t("title")}</SectionLabel>
        <IndexBadge index={index} />
        <p style={s.emptyHint}>{t("index.unavailableBody")}</p>
      </Card>
    );
  }

  const noDownstream = changed_symbols.length === 0;
  // Explain is now allowed on a degraded/partial index too (server change) —
  // only a truly missing PR id or nothing-to-explain blocks it.
  const explainDisabled = !prId || noDownstream;
  const diffFileSet = new Set(diffFiles);

  return (
    <Card>
      <SectionLabel
        icon="Activity"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {view === "tree" && !noDownstream && (
              <Checkbox checked={expandAll} onChange={handleExpandAllChange} label={t("expandAllLabel")} />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Chip active={view === "tree"} onClick={() => setView("tree")}>
                {t("view.tree")}
              </Chip>
              <Chip active={view === "graph"} onClick={() => setView("graph")}>
                {t("view.graph")}
              </Chip>
            </div>
            <Button
              kind="ghost"
              size="sm"
              icon={EXPLAIN_ICON}
              onClick={() => setExplain(true)}
              disabled={explainDisabled}
              loading={explain && isFetching}
            >
              {explain && isFetching ? t("explain.loading") : t("explain.action")}
            </Button>
          </div>
        }
      >
        {t("title")}
      </SectionLabel>

      {/* Only surface the index badge when it's NOT full — a healthy index
          stays out of the way (matches the design's clean header). */}
      {index.status !== "full" && <IndexBadge index={index} />}

      {/* File-level fallback: every symbol in a touched file is flagged
          "changed" rather than just the ones whose lines the diff actually
          touched — call out the reduced precision instead of silently
          over-reporting impact. */}
      {change_detection_mode === "file-level" && (
        <p style={s.precisionNotice}>
          <Icon.Info size={13} />
          {t("fileLevelNotice")}
        </p>
      )}

      <StatChips counts={counts} sort={sort} onSort={handleSort} />

      {noDownstream ? (
        <p style={s.emptyHint}>{t("noDownstream", { count: changed_symbols.length })}</p>
      ) : view === "tree" ? (
        <>
          <div style={s.symbolList}>
            {sortImpacts(impacts, sort).map((impact, i) => (
              <SymbolRow
                key={`${impact.symbol.file}:${impact.symbol.name}`}
                impact={impact}
                index={i}
                expandSignal={{ expanded: expandAll, nonce: expandNonce }}
                repoFullName={repoFullName}
                headSha={headSha}
                diffFiles={diffFileSet}
                onFocusFile={onFocusFile}
              />
            ))}
          </div>
          <AffectedEndpoints
            endpoints={data.endpoints}
            repoFullName={repoFullName}
            headSha={headSha}
            diffFiles={diffFileSet}
            onFocusFile={onFocusFile}
          />
          <PriorPulls pulls={prior_pulls} />
        </>
      ) : (
        <BlastGraph impacts={impacts} />
      )}

      {/* Explain was clicked and the query has SETTLED (not mid-fetch) — always
          render something once it has, even when `explanation` came back null
          (the server explicitly can — and does — resolve it to null on any
          LLM failure so the read itself never fails). Silently rendering
          nothing here read as a broken button, not a completed-but-empty
          result. */}
      {explain && !isFetching && (
        <div style={s.section}>
          <SectionLabel icon={EXPLAIN_ICON}>{t("explain.title")}</SectionLabel>
          {explanation ? (
            <p style={s.explanation}>{explanation}</p>
          ) : (
            <p style={s.emptyHint}>{t("explain.unavailable")}</p>
          )}
        </div>
      )}
    </Card>
  );
}
