/* BlastGraph — Graph view: a `flowchart LR` rendered via the shared
   `MermaidDiagram` (changed symbol → its callers → the endpoints reachable
   through it), same `impacts` data the Tree view already has — no new
   fetch. `buildBlastGraph` (mermaid.ts) is pure/hermetic; this component
   just wires it to the renderer + the colour legend from the mock. */
"use client";

import { useTranslations } from "next-intl";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import type { BlastSymbolImpact } from "@devdigest/shared";
import { buildBlastGraph } from "./mermaid";
import { s } from "./styles";

const LEGEND = [
  { key: "changed", color: "var(--accent)" },
  { key: "callers", color: "var(--text-secondary)" },
  { key: "endpoints", color: "var(--ok)" },
] as const;

export function BlastGraph({ impacts }: { impacts: BlastSymbolImpact[] }) {
  const t = useTranslations("blast");
  const { chart, truncated } = buildBlastGraph(impacts);

  return (
    <div role="img" aria-label={t("graph.ariaLabel")}>
      <MermaidDiagram chart={chart} />
      <div style={s.graphLegend}>
        {LEGEND.map((item) => (
          <span key={item.key} style={s.legendItem}>
            <span aria-hidden style={{ ...s.legendDot, background: item.color }} />
            {t(`graph.legend.${item.key}`)}
          </span>
        ))}
      </div>
      {truncated && <p style={s.emptyHint}>{t("graph.truncated")}</p>}
    </div>
  );
}
