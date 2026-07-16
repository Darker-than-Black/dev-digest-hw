import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConventionCandidate, ExtractResult } from '@devdigest/shared';
import { api } from '../http.js';
import { resolveRepoId } from '../resolve.js';
import { defineTool, jsonResult } from './_result.js';

/**
 * get_conventions — read a repo's extracted coding conventions (the L02 feature).
 * Flat arg (repo) resolved to the internal uuid. extract=true re-runs the LLM
 * extraction pipeline (slower, synchronous) then returns the fresh candidates.
 */
export function registerGetConventions(server: McpServer): void {
  defineTool(
    server,
    'get_conventions',
    {
      title: 'Get repo conventions',
      description:
        "Get a repository's coding conventions (category, rule, confidence, status). extract=true re-derives them via LLM first.",
    },
    {
      repo: z.string().describe('Repository as "owner/name".'),
      extract: z
        .boolean()
        .optional()
        .describe('Re-run LLM convention extraction before returning. Slower. Default false.'),
    },
    async (args) => {
      const { repo, extract } = args as { repo: string; extract?: boolean };
      const id = encodeURIComponent(await resolveRepoId(repo));
      const candidates = extract
        ? ExtractResult.parse(await api(`/repos/${id}/conventions/extract`, { method: 'POST' }))
            .candidates
        : z.array(ConventionCandidate).parse(await api(`/repos/${id}/conventions`));

      const rows = candidates.map((c) => ({
        category: c.category,
        rule: c.rule,
        confidence: c.confidence,
        status: c.status,
      }));
      return jsonResult(rows);
    },
  );
}
