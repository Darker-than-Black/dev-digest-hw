#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

/**
 * DevDigest MCP server — exposes the local PR-review engine as 5 agent-callable
 * tools over stdio. Thin HTTP client over the Fastify API (:3001); no DB/DI boot.
 * Keep tool count at 5 and descriptions one line — the whole schema block loads
 * into the client's context on every chat.
 */
async function main(): Promise<void> {
  const server = new McpServer({ name: 'devdigest', version: '0.0.0' });

  registerListAgents(server);
  registerRunAgentOnPr(server);
  registerGetFindings(server);
  registerGetConventions(server);
  registerGetBlastRadius(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel — log only to stderr.
  console.error('[devdigest-mcp] ready on stdio');
}

main().catch((err) => {
  console.error('[devdigest-mcp] fatal:', err);
  process.exit(1);
});
