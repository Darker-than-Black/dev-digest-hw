import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Agent } from '@devdigest/shared';
import { api } from '../http.js';
import { defineTool, jsonResult } from './_result.js';

/**
 * list_agents — enumerate the configured review agents.
 * Token-lean: returns only the fields needed to pick an agent, not the full
 * Agent contract (drops system_prompt, output_schema, versions, etc.).
 */
export function registerListAgents(server: McpServer): void {
  defineTool(
    server,
    'list_agents',
    {
      title: 'List review agents',
      description: 'List configured PR review agents (id, name, provider, model, enabled).',
    },
    {
      onlyEnabled: z
        .boolean()
        .optional()
        .describe('If true, return only enabled agents. Default false.'),
    },
    async (args) => {
      const { onlyEnabled } = args as { onlyEnabled?: boolean };
      const agents = z.array(Agent).parse(await api('/agents'));
      const rows = agents
        .filter((a) => (onlyEnabled ? a.enabled : true))
        .map((a) => ({
          id: a.id,
          name: a.name,
          provider: a.provider,
          model: a.model,
          enabled: a.enabled,
        }));
      return jsonResult(rows);
    },
  );
}
