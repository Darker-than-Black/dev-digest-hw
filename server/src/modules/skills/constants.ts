/** Constants for the skills module. */
import type { SkillSource, SkillType } from '@devdigest/shared';

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default type/source for a skill created from scratch. */
export const DEFAULT_SKILL_TYPE: SkillType = 'custom';
export const DEFAULT_SKILL_SOURCE: SkillSource = 'manual';

// ---- Import safety caps (text-only; archive scripts/binaries are never run) --
/** Max upload the import endpoints accept (2 MB). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
/** Max entries read from a zip (bomb guard). */
export const MAX_ZIP_ENTRIES = 200;
/** Max total decompressed bytes read from a zip (bomb guard). */
export const MAX_ZIP_DECOMPRESSED_BYTES = 5 * 1024 * 1024;
