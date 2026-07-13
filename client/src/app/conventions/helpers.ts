import type { ConventionCandidate } from "@devdigest/shared";

/** Confidence at/above this reads as "high" (green); below is "medium" (amber). */
export const HIGH_CONFIDENCE = 0.75;

/** Bar/label color for a candidate's self-reported confidence. */
export function confidenceColor(confidence: number): string {
  return confidence >= HIGH_CONFIDENCE ? "var(--ok)" : "var(--warn)";
}

/** Convention `type` values the Create-skill modal offers, as plain values.
 *  Do NOT import the zod `SkillType` enum as a runtime value in client code — it
 *  drags the vendored `@devdigest/shared` barrel into the bundle. */
export const SKILL_TYPES = ["rubric", "convention", "security", "custom"] as const;

/** How many of the candidates are accepted (drives the "N of M accepted" counter). */
export function acceptedCount(candidates: ConventionCandidate[]): number {
  return candidates.filter((c) => c.status === "accepted").length;
}
