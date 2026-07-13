import { z } from 'zod';
import { ConventionProposal, type ChatMessage } from '@devdigest/shared';
import type { FileContent } from './helpers.js';
import { MAX_FILE_CHARS, MAX_TOTAL_CHARS } from './constants.js';

/**
 * L02 — the convention-extraction prompt. The model reads a bounded slice of the
 * repo's real source + config files and proposes de-facto coding conventions,
 * each with a verbatim `evidence_snippet` and cited `file:line`. Everything the
 * model returns is re-checked by the code-side evidence gate (`verifyEvidence`),
 * so the prompt optimizes for recall; precision is enforced downstream.
 */

/**
 * Structured-output root. OpenAI/Anthropic structured outputs need an OBJECT
 * root (not a bare array), so wrap the proposals in `{ candidates: [...] }`.
 */
export const ExtractionResponse = z.object({
  candidates: z.array(ConventionProposal),
});
export type ExtractionResponse = z.infer<typeof ExtractionResponse>;

const SYSTEM_PROMPT = [
  'You are a senior engineer extracting the de-facto CODING CONVENTIONS a repository already follows.',
  'You are given a sample of the repo: its lint/format/TypeScript config files and its most important source files.',
  '',
  'Infer concrete, enforceable house rules that the existing code demonstrably follows',
  '(e.g. error-handling style, async patterns, data-access layering, naming, imports).',
  'Prefer a few high-signal rules over many weak ones. Do NOT invent generic best-practices',
  'that the sample does not actually exhibit.',
  '',
  'For EACH rule return an object with:',
  '  - category: a short slug grouping the rule (e.g. "async", "error-handling", "data-access", "naming", "imports").',
  '  - rule: one imperative sentence stating the convention.',
  '  - evidence_path: the EXACT path (as given below) of a file that demonstrates the rule.',
  '  - evidence_snippet: a SHORT VERBATIM excerpt copied character-for-character from that file proving the rule.',
  '  - evidence_start_line / evidence_end_line: the 1-based line range of that snippet in the file (optional but preferred).',
  '  - confidence: 0..1, how strongly the sample supports the rule.',
  '',
  'CRITICAL: evidence_snippet must be copied verbatim from the cited file — do not paraphrase, reformat, or fabricate it.',
  'Any rule whose snippet cannot be found in the cited file will be discarded.',
].join('\n');

/** Truncate one file to the per-file cap, flagging when we cut it. */
function renderFile(path: string, content: string): string {
  const truncated = content.length > MAX_FILE_CHARS;
  const body = truncated ? content.slice(0, MAX_FILE_CHARS) : content;
  const note = truncated ? '\n… [truncated]' : '';
  return `----- FILE: ${path} -----\n${body}${note}`;
}

/**
 * Build the chat messages for one extraction call. Only files with non-null
 * content are included; oversized files are truncated and, once the total budget
 * is exhausted, remaining files are skipped so the prompt stays bounded.
 */
export function buildExtractPrompt(files: FileContent[]): ChatMessage[] {
  const blocks: string[] = [];
  let total = 0;
  for (const f of files) {
    if (f.content === null) continue;
    if (total >= MAX_TOTAL_CHARS) break;
    const block = renderFile(f.path, f.content);
    blocks.push(block);
    total += block.length;
  }

  const user = [
    'Here is the repository sample. Extract the coding conventions it follows.',
    '',
    blocks.join('\n\n'),
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}
