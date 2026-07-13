import { describe, it, expect } from 'vitest';
import { verifyEvidence, buildSkillDraft, type FileContent } from '../src/modules/conventions/helpers.js';
import type { ConventionCandidate, ConventionProposal } from '@devdigest/shared';

/**
 * Hermetic unit coverage for the conventions module's two pure helpers: the
 * code-side EVIDENCE GATE (`verifyEvidence`) and the merged skill-body assembler
 * (`buildSkillDraft`). Neither touches the DB / LLM / fs — both are driven with
 * literal inputs.
 */

/** A real file the gate reads from — line numbers matter for the range check. */
const FOO_SRC = [
  'export async function loadUser(id) {', // 1
  '  try {', //                              2
  '    return await db.find(id);', //        3
  '  } catch (err) {', //                    4
  "    throw new AppError('nope', err);", // 5
  '  }', //                                  6
  '}', //                                    7
].join('\n');

const files: FileContent[] = [{ path: 'src/foo.ts', content: FOO_SRC }];

/** Convenience: a proposal with sane defaults, overridable per-test. */
function proposal(overrides: Partial<ConventionProposal>): ConventionProposal {
  return {
    category: 'error-handling',
    rule: 'Wrap async DB reads in try/catch and rethrow as AppError',
    evidence_path: 'src/foo.ts',
    evidence_snippet: "throw new AppError('nope', err);",
    evidence_start_line: 5,
    evidence_end_line: 5,
    confidence: 0.9,
    ...overrides,
  };
}

describe('verifyEvidence', () => {
  it('keeps a proposal whose snippet appears within the cited line range', () => {
    expect(verifyEvidence(proposal({}), files)).toBe(true);
  });

  it('drops a proposal whose snippet is absent from the file', () => {
    const bogus = proposal({
      evidence_snippet: 'const total = sum(a, b);',
      evidence_start_line: 3,
      evidence_end_line: 3,
    });
    expect(verifyEvidence(bogus, files)).toBe(false);
  });

  it('drops a proposal whose cited file content is null/missing', () => {
    const nullFiles: FileContent[] = [{ path: 'src/foo.ts', content: null }];
    expect(verifyEvidence(proposal({}), nullFiles)).toBe(false);
    // Also drop when the cited path was never read at all.
    expect(verifyEvidence(proposal({ evidence_path: 'src/nope.ts' }), files)).toBe(false);
  });

  it('drops a proposal whose snippet is real but sits far outside the cited range', () => {
    // Snippet exists in the file (line 5) but the citation points at line 1 →
    // the line-window check (± a few lines) must reject it.
    const misline = proposal({ evidence_start_line: 1, evidence_end_line: 1 });
    expect(verifyEvidence(misline, files)).toBe(false);
  });

  it('normalizes whitespace so a reflowed, multi-line snippet still matches', () => {
    // Snippet collapses two source lines and squashes indentation; with no line
    // range cited, only the whitespace-tolerant substring check runs.
    const reflowed = proposal({
      evidence_snippet: 'try {    return await   db.find(id);',
      evidence_start_line: null,
      evidence_end_line: null,
    });
    expect(verifyEvidence(reflowed, files)).toBe(true);
  });
});

describe('buildSkillDraft', () => {
  /** Convenience: an accepted candidate with sane defaults. */
  function candidate(overrides: Partial<ConventionCandidate>): ConventionCandidate {
    return {
      id: crypto.randomUUID(),
      category: 'error-handling',
      rule: 'Rethrow caught errors as AppError',
      evidence_path: 'src/foo.ts',
      evidence_snippet: "throw new AppError('nope', err);",
      evidence_start_line: 5,
      evidence_end_line: 5,
      confidence: 0.9,
      status: 'accepted',
      edited: false,
      ...overrides,
    };
  }

  const accepted: ConventionCandidate[] = [
    candidate({
      category: 'error-handling',
      rule: 'Rethrow caught errors as AppError',
      evidence_path: 'src/foo.ts',
      evidence_start_line: 5,
    }),
    candidate({
      category: 'async',
      rule: 'Await DB reads directly instead of chaining .then',
      evidence_path: 'src/foo.ts',
      evidence_start_line: 3,
    }),
    candidate({
      category: 'data-access',
      rule: 'Access the database only through the db facade',
      evidence_path: 'src/db/client.ts',
      evidence_start_line: 12,
    }),
  ];

  const draft = buildSkillDraft(accepted, 'Payments API');

  it("names the draft '<repo-slug>-conventions'", () => {
    expect(draft.name).toMatch(/-conventions$/);
    expect(draft.name).toBe('payments-api-conventions');
  });

  it('carries the extracted skill type + source', () => {
    expect(draft.type).toBe('convention');
    expect(draft.source).toBe('extracted');
  });

  it('renders every rule with a "Detected in" citation', () => {
    for (const c of accepted) {
      expect(draft.body).toContain(c.rule);
    }
    expect(draft.body).toContain('Detected in `src/foo.ts:5`');
    expect(draft.body).toContain('Detected in `src/foo.ts:3`');
    expect(draft.body).toContain('Detected in `src/db/client.ts:12`');
    // Categories become section headings.
    expect(draft.body).toContain('## error-handling');
    expect(draft.body).toContain('## async');
    expect(draft.body).toContain('## data-access');
  });

  it('exposes evidence_files as the UNIQUE set of cited paths', () => {
    expect([...draft.evidence_files].sort()).toEqual(['src/db/client.ts', 'src/foo.ts']);
  });

  it('reports the number of conventions in the description', () => {
    expect(draft.description).toContain('3');
    expect(draft.description).toContain('Payments API');
  });
});
