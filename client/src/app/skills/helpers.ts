import type { IconName } from "@devdigest/ui";
import type { Skill, SkillSource, SkillType } from "@devdigest/shared";

/** Skill types, as plain values. Do NOT import the zod `SkillType` enum as a
 *  runtime value in client code — it drags the vendored `@devdigest/shared`
 *  barrel (with `.js` re-exports Next can't resolve) into the bundle. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Kebab-case slug check, mirroring the server's `SkillSlug` contract. */
export const isValidSlug = (s: string): boolean => s.length > 0 && s.length <= 64 && SLUG_RE.test(s);

/** Accent color per skill type (badge text). */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/** Icon marking where a skill came from. */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "GitBranch",
  community: "Globe",
  imported_url: "Upload",
};

/** Case-insensitive filter over a skill's slug + description. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}
