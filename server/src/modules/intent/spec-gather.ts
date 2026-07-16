import { z } from 'zod';
import type { Provider } from '@devdigest/shared';
import { wrapUntrusted, INJECTION_GUARD } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { parseIssueRef, parsePlanPaths, safeRepoPath } from './helpers.js';
import { MAX_SPEC_CHARS, SPEC_TOKEN_CAP } from './constants.js';

/**
 * gatherSpec — combines the classifier's spec context from THREE best-effort
 * sources (Locked product decision #3): the PR body itself, a linked plan/spec
 * file in the repo clone, and a linked GitHub issue. Never throws: an
 * unavailable source is skipped, not fatal. Long combined specs are condensed
 * with a second cheap LLM call before being handed to `deriveIntent`.
 */

const CondensedSpec = z.object({ summary: z.string() });

/**
 * Second, cheap LLM call: summarize a long combined spec down to scope-relevant
 * bullets, using the SAME resolved `review_intent` model. Best-effort — any
 * failure degrades to a hard truncate, never throws.
 */
async function condenseSpec(
  container: Container,
  provider: Provider,
  model: string,
  rawSpec: string,
): Promise<string> {
  try {
    const llm = await container.llm(provider);
    const res = await llm.completeStructured({
      model,
      schema: CondensedSpec,
      schemaName: 'CondensedSpec',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Summarize the project spec/plan/issue text inside the ' +
            '<untrusted>…</untrusted> block down to the scope-relevant bullet ' +
            'points a PR intent classifier needs: what the work is meant to ' +
            'accomplish and its boundaries. Be concise.\n\n' +
            INJECTION_GUARD,
        },
        // The spec is author/attacker-controlled (PR body + repo file + issue) —
        // wrap it so the condenser treats it as data, not instructions.
        { role: 'user', content: wrapUntrusted('spec', rawSpec) },
      ],
    });
    return res.data.summary;
  } catch {
    return rawSpec.slice(0, MAX_SPEC_CHARS);
  }
}

export interface GatherSpecInput {
  repoId: string;
  repo: { owner: string; name: string };
  body: string;
}

export async function gatherSpec(
  container: Container,
  { repoId, repo, body }: GatherSpecInput,
  feature: { provider: Provider; model: string },
): Promise<string> {
  const parts: string[] = [];

  // (a) inline — the PR body itself.
  if (body.trim().length > 0) parts.push(body);

  // (b) repo file — a plan/spec path referenced in the body, read from the
  // local clone. Best-effort: readFiles never throws, returns null content
  // when repo-intel is disabled/uncloned or the file doesn't exist.
  const planPaths = parsePlanPaths(body).filter(safeRepoPath);
  if (planPaths.length > 0) {
    try {
      const files = await container.repoIntel.readFiles(repoId, planPaths);
      for (const f of files) {
        if (f.content !== null) parts.push(`--- ${f.path} ---\n${f.content}`);
      }
    } catch {
      // never fail intent derivation because a spec source is unavailable
    }
  }

  // (c) GitHub issue — the `#123` linked issue's title + body. Best-effort:
  // container.github() throws when no token is configured; getIssue can 404.
  const issueNumber = parseIssueRef(body);
  if (issueNumber !== undefined) {
    try {
      const gh = await container.github();
      const issue = await gh.getIssue(repo, issueNumber);
      parts.push(`--- issue #${issue.number}: ${issue.title} ---\n${issue.body ?? ''}`);
    } catch {
      // no GitHub token configured / offline / issue not found — skip
    }
  }

  const rawSpec = parts.join('\n\n');
  if (rawSpec.trim().length === 0) return '';

  const tokenCount = container.tokenizer.count(rawSpec);
  if (tokenCount > SPEC_TOKEN_CAP) {
    return condenseSpec(container, feature.provider, feature.model, rawSpec);
  }
  return rawSpec;
}
