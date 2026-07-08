import type { IconName } from "@devdigest/ui";

/** Skill-detail tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface SkillTab {
  key: string;
  labelKey: string;
}

/** Config / Preview / Versions are live; Evals + Stats are design stubs. */
export const SKILL_TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "tabs.config" },
  { key: "preview", labelKey: "tabs.preview" },
  { key: "evals", labelKey: "tabs.evals" },
  { key: "stats", labelKey: "tabs.stats" },
  { key: "versions", labelKey: "tabs.versions" },
];

export const SKILL_TAB_KEYS = SKILL_TABS.map((t) => t.key);

export const STUB_ICON: { evals: IconName; stats: IconName } = { evals: "Play", stats: "BarChart" };
