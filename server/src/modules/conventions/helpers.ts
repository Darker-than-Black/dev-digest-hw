import type { ConventionCandidate, ConventionProposal, ConventionSkillDraft } from '@devdigest/shared';

/**
 * L02 — pure, unit-testable helpers for the conventions module: the code-side
 * EVIDENCE GATE (`verifyEvidence`) and the merged skill-body assembler
 * (`buildSkillDraft`). Neither touches the DB, the LLM, or fs — both operate on
 * already-fetched inputs so a test can drive them directly.
 */

/** A file's raw content as returned by `repoIntel.readFiles` (null = unreadable/missing). */
export interface FileContent {
  path: string;
  content: string | null;
}

/** Collapse all runs of whitespace to single spaces + trim, for tolerant matching. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Lines are cited 1-based; allow a little slack around the cited range. */
const LINE_RANGE_PADDING = 3;

/**
 * EVIDENCE GATE. Returns true iff the proposal's citation is grounded in the
 * fetched file contents:
 *   - the cited `evidence_path` was read AND has non-null content, and
 *   - the whitespace-normalized `evidence_snippet` is a substring of that file, and
 *   - when a line range is cited, the snippet appears within (± a few lines of) it.
 * A false result → the candidate is dropped (never persisted).
 */
export function verifyEvidence(proposal: ConventionProposal, files: FileContent[]): boolean {
  const file = files.find((f) => f.path === proposal.evidence_path);
  if (!file || file.content === null) return false;

  const snippet = normalizeWhitespace(proposal.evidence_snippet);
  if (snippet.length === 0) return false;

  const haystack = normalizeWhitespace(file.content);
  if (!haystack.includes(snippet)) return false;

  // If a line range is cited, confirm the snippet sits within/near it.
  const start = proposal.evidence_start_line;
  const end = proposal.evidence_end_line;
  if (start != null) {
    const lines = file.content.split('\n');
    const from = Math.max(0, start - 1 - LINE_RANGE_PADDING);
    const to = Math.min(lines.length, (end ?? start) + LINE_RANGE_PADDING);
    const window = normalizeWhitespace(lines.slice(from, to).join('\n'));
    if (!window.includes(snippet)) return false;
  }

  return true;
}

/** Keep only proposals whose evidence passes the gate. */
export function filterGroundedProposals(
  proposals: ConventionProposal[],
  files: FileContent[],
): ConventionProposal[] {
  return proposals.filter((p) => verifyEvidence(p, files));
}

/** Slug used for the draft skill name — kebab-case, matching SkillSlug's shape. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'repo';
}

/** `path:line` citation string; omits the line when none was cited. */
function citation(c: ConventionCandidate): string {
  const line = c.evidence_start_line;
  return line != null ? `${c.evidence_path}:${line}` : c.evidence_path;
}

/**
 * Assemble ONE merged skill draft from the ACCEPTED candidates: a markdown body
 * grouped by category, each rule citing where it was `Detected in`. The result
 * is editable in the "Create skill" modal, then saved via the existing
 * POST /skills — this function persists nothing.
 */
export function buildSkillDraft(
  accepted: ConventionCandidate[],
  repoName: string,
): ConventionSkillDraft {
  // Stable category grouping in first-seen order.
  const byCategory = new Map<string, ConventionCandidate[]>();
  for (const c of accepted) {
    const key = c.category || 'general';
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(c);
    else byCategory.set(key, [c]);
  }

  const sections: string[] = [`# ${repoName} conventions`, ''];
  for (const [category, rules] of byCategory) {
    sections.push(`## ${category}`, '');
    for (const c of rules) {
      sections.push(`- ${c.rule} (Detected in \`${citation(c)}\`)`);
    }
    sections.push('');
  }
  const body = sections.join('\n').trimEnd() + '\n';

  const evidenceFiles = [...new Set(accepted.map((c) => c.evidence_path))];

  return {
    name: `${slugify(repoName)}-conventions`,
    description: `${accepted.length} house conventions extracted from ${repoName}`,
    type: 'convention',
    source: 'extracted',
    body,
    evidence_files: evidenceFiles,
  };
}
