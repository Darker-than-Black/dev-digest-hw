import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ReviewRunResponse, RunSummary, ReviewRecord } from '@devdigest/shared';
import { api } from '../http.js';
import { config } from '../config.js';
import { resolveAgentId, resolveRepoId, resolvePrId } from '../resolve.js';
import { shapeReview } from '../shape.js';
import { defineTool, jsonResult } from './_result.js';

const DONE = new Set(['done', 'failed', 'cancelled']);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * run_agent_on_pr — the one write tool. Result, not operation: it creates the run,
 * WAITS for it to finish, and returns the ready findings in a single call. Flat
 * args (repo, pr, agent) are resolved to the internal uuids the API needs.
 */
export function registerRunAgentOnPr(server: McpServer): void {
  defineTool(
    server,
    'run_agent_on_pr',
    {
      title: 'Run a review agent on a PR (waits for results)',
      description:
        'Review a pull request with one agent, wait for it to finish, and return the verdict + findings. The only write tool.',
    },
    {
      repo: z.string().describe('Repository as "owner/name".'),
      pr: z.number().int().describe('Pull-request number.'),
      agent: z.string().describe('Agent name or id (get a valid one from list_agents).'),
      detailed: z
        .boolean()
        .optional()
        .describe('Include rationale/category/confidence per finding. Default false.'),
    },
    async (args) => {
      const { repo, pr, agent, detailed } = args as {
        repo: string;
        pr: number;
        agent: string;
        detailed?: boolean;
      };

      const agentId = await resolveAgentId(agent);
      const repoId = await resolveRepoId(repo);
      const prId = await resolvePrId(repoId, pr);

      // 1) Kick off the run (API creates the run row, executes in the background).
      const started = ReviewRunResponse.parse(
        await api(`/pulls/${encodeURIComponent(prId)}/review`, {
          method: 'POST',
          body: { agentId },
        }),
      );
      const target = started.runs.find((r) => r.agent_id === agentId) ?? started.runs[0];
      if (!target) {
        throw new Error(
          `The review did not start any run for agent "${agent}". Confirm the agent is enabled via list_agents.`,
        );
      }
      const runId = target.run_id;

      // 2) Poll run status until it settles or we hit the timeout budget.
      const maxIterations = Math.ceil(config.runTimeoutMs / config.runPollMs);
      let status: string | null = null;
      for (let i = 0; i < maxIterations; i++) {
        await sleep(config.runPollMs);
        const runs = z
          .array(RunSummary)
          .parse(await api(`/pulls/${encodeURIComponent(prId)}/runs`));
        const mine = runs.find((r) => r.run_id === runId);
        status = mine?.status ?? null;
        if (status && DONE.has(status)) {
          if (status !== 'done') {
            throw new Error(
              `Review run ${status}${mine?.error ? `: ${mine.error}` : ''}. Try run_agent_on_pr again, or a different agent.`,
            );
          }
          break;
        }
      }

      // 3a) Timed out while still running — return a non-error "still running"
      // result so the caller can poll get_findings later instead of blocking forever.
      if (status !== 'done') {
        return jsonResult({
          status: 'running',
          run_id: runId,
          hint: `Still running after ${Math.round(config.runTimeoutMs / 1000)}s. Call get_findings("${repo}", ${pr}) shortly to read the result.`,
        });
      }

      // 3b) Done — return the concise shaped review for our run.
      const reviews = z
        .array(ReviewRecord)
        .parse(await api(`/pulls/${encodeURIComponent(prId)}/reviews`));
      const review = reviews.find((rev) => rev.run_id === runId);
      if (!review) {
        return jsonResult({ status: 'done', run_id: runId, verdict: null, findings: [] });
      }
      return jsonResult({ status: 'done', run_id: runId, ...shapeReview(review, detailed ?? false) });
    },
  );
}
