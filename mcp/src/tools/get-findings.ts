import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ReviewRecord } from '@devdigest/shared';
import { api } from '../http.js';
import { resolveRepoId, resolvePrId } from '../resolve.js';
import { shapeReview } from '../shape.js';
import { defineTool, jsonResult } from './_result.js';

/**
 * get_findings — concise verdict + findings for an already-completed run on a PR.
 * Flat args (repo, pr) resolved to the internal uuid. detailed=true adds the
 * heavier per-finding fields.
 */
export function registerGetFindings(server: McpServer): void {
  defineTool(
    server,
    'get_findings',
    {
      title: 'Get PR review findings',
      description:
        'Get the verdict and findings already produced for a pull request (from a prior run_agent_on_pr).',
    },
    {
      repo: z.string().describe('Repository as "owner/name".'),
      pr: z.number().int().describe('Pull-request number.'),
      detailed: z
        .boolean()
        .optional()
        .describe('Include rationale/category/confidence per finding. Default false (compact).'),
    },
    async (args) => {
      const { repo, pr, detailed } = args as { repo: string; pr: number; detailed?: boolean };
      const repoId = await resolveRepoId(repo);
      const prId = await resolvePrId(repoId, pr);
      const reviews = z
        .array(ReviewRecord)
        .parse(await api(`/pulls/${encodeURIComponent(prId)}/reviews`));
      return jsonResult(reviews.map((rev) => shapeReview(rev, detailed ?? false)));
    },
  );
}
