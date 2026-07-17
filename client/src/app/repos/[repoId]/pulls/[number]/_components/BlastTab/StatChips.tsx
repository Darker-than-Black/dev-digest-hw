/* StatChips — the "N symbols · N callers · N endpoints · N crons" summary
   row, doubling as the symbol tree's sort control (click a chip to sort by
   that metric; click again to flip direction — see sort.ts). Lighter,
   icon+text treatment (mock parity) instead of the old heavy bordered pill:
   plain buttons, a subtle highlight + direction arrow only on the active one. */
"use client";

import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { ENDPOINT_ICON, CRON_ICON } from "./constants";
import type { ImpactSort, SortKey } from "./sort";
import { s } from "./styles";

// Mock uses `<>` for symbols and `↳` for callers specifically (not the
// generic Layers/Users icons) — endpoints/crons reuse the same Globe/Clock
// icons as their chips elsewhere in this feature (FactChips, EndpointChip).
const CHIP_ICON: Record<SortKey, IconName> = {
  symbols: "Code",
  callers: "CornerDownRight",
  endpoints: ENDPOINT_ICON,
  crons: CRON_ICON,
};

const KEYS: SortKey[] = ["symbols", "callers", "endpoints", "crons"];

export function StatChips({
  counts,
  sort,
  onSort,
}: {
  counts: { symbols: number; callers: number; endpoints: number; crons: number };
  sort: ImpactSort | null;
  onSort: (key: SortKey) => void;
}) {
  const t = useTranslations("blast");

  return (
    <div style={s.statRow}>
      {KEYS.map((key) => {
        const Chip = Icon[CHIP_ICON[key]];
        const active = sort?.key === key;
        const DirIcon = active && sort.dir === "asc" ? Icon.ArrowUp : Icon.ArrowDown;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSort(key)}
            aria-pressed={active}
            style={active ? { ...s.statChip, ...s.statChipActive } : s.statChip}
          >
            <Chip size={13} />
            {counts[key]} {t(`stat.${key}`)}
            {active && <DirIcon size={11} />}
          </button>
        );
      })}
    </div>
  );
}
