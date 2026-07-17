import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveRepoId } from '../resolve.js';
import { defineTool, jsonResult } from './_result.js';

/**
 * get_blast_radius — STUB. Real impl (repo-intel caller graph → impacted
 * symbols/endpoints) lands in a later homework. Flat arg (repo) is still resolved
 * so bad input fails with an actionable error today. Returns the degraded shape of
 * the backend's `BlastResult` (repo-intel/types.ts) so callers can code against the
 * final contract now.
 */
export function registerGetBlastRadius(server: McpServer): void {
  defineTool(
    server,
    'get_blast_radius',
    {
      title: 'Get change blast radius (stub)',
      description:
        'Estimate the impact of changed files (callers, impacted endpoints). NOT YET IMPLEMENTED — returns a degraded stub.',
    },
    {
      repo: z.string().describe('Repository as "owner/name".'),
      changedFiles: z.array(z.string()).describe('Repo-relative paths of changed files.'),
    },
    async (args) => {
      const { repo } = args as { repo: string; changedFiles: string[] };
      // Resolve so an unknown repo gives an actionable error rather than a silent stub.
      await resolveRepoId(repo);
      // TODO: wire to repo-intel getBlastRadius(repoId, changedFiles) once shipped.
      return jsonResult({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'not_implemented',
      });
    },
  );
}
