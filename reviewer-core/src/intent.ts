import type { ChatMessage, LLMProvider } from '@devdigest/shared';
import { Intent } from '@devdigest/shared';
import { wrapUntrusted, INJECTION_GUARD } from './prompt.js';

/**
 * deriveIntent — a separate, cheap LLM call that classifies a PR's intent/scope
 * from METADATA ONLY (title, body, a linked spec/issue, and a headers-only file
 * list). NOT a code review: this call never sees diff bodies.
 *
 * Pure, like the rest of the engine: the only side effect is the injected
 * `LLMProvider`. All author-controlled segments (title/body/issueSpec/fileList)
 * are wrapped via `wrapUntrusted()` before they reach the prompt.
 */

export interface DeriveIntentInput {
  /** Injected LLM provider (resolved by the caller from the feature-model setting). */
  llm: LLMProvider;
  /** Model id understood by the injected provider. */
  model: string;
  /** PR title (trusted framing, but still author-controlled — wrapped). */
  title: string;
  /** PR body/description. */
  body?: string;
  /** Combined spec text gathered by the caller (inline body / repo plan file / linked issue). */
  issueSpec?: string;
  /** Headers-only file list (path + `@@ … @@` hunk headers, NO diff bodies). */
  fileList: string;
  /** OpenRouter session id — groups this call with the review it precedes. */
  sessionId?: string;
}

export interface DeriveIntentOutcome {
  intent: Intent;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  raw: unknown;
}

const SYSTEM_PROMPT =
  "You classify a pull request's INTENT and SCOPE from its metadata only — " +
  'you are NOT reviewing code and will not see the diff. Given the PR title, ' +
  'description, an optional linked spec/issue, and a list of changed file paths ' +
  '(with hunk headers, no code), produce:\n' +
  '  - intent: one or two sentences stating what this PR is trying to accomplish.\n' +
  '  - in_scope: a short bullet list of what the PR SHOULD be judged on.\n' +
  '  - out_of_scope: a short bullet list of adjacent concerns that are explicitly ' +
  'NOT part of this change (e.g. unrelated files, follow-up work, pre-existing issues).\n' +
  'Base your answer only on the material given below; do not invent claims not ' +
  'supported by it.\n\n' +
  INJECTION_GUARD;

/** Build the (untrusted-wrapped) user message for one derive call. */
function buildUserMessage(input: DeriveIntentInput): string {
  const sections: string[] = [];
  sections.push(`## PR title\n${wrapUntrusted('title', input.title)}`);
  if (input.body && input.body.trim().length > 0) {
    sections.push(`## PR description\n${wrapUntrusted('pr-description', input.body)}`);
  }
  if (input.issueSpec && input.issueSpec.trim().length > 0) {
    sections.push(`## Linked spec / issue\n${wrapUntrusted('issue-spec', input.issueSpec)}`);
  }
  sections.push(`## Changed files (headers only, no code)\n${wrapUntrusted('file-list', input.fileList)}`);
  return sections.join('\n\n');
}

export async function deriveIntent(input: DeriveIntentInput): Promise<DeriveIntentOutcome> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(input) },
  ];

  const res = await input.llm.completeStructured<Intent>({
    model: input.model,
    schema: Intent,
    schemaName: 'Intent',
    messages,
    temperature: 0,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return {
    intent: res.data,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    raw: res.raw,
  };
}
