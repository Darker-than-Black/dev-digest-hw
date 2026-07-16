import { z } from 'zod';
import { Agent, PrMeta, Repo } from '@devdigest/shared';
import { api } from './http.js';

/**
 * Flat-argument resolvers. Tools accept simple values (repo full-name, PR number,
 * agent name/id) per the "flat arguments" design principle; these turn them into
 * the internal uuids the API needs. Every miss throws an ACTIONABLE error whose
 * message tells the model the next step (e.g. call list_agents) rather than a dry
 * 404 — that keeps the agent moving instead of stalling.
 */

/** Resolve an agent by id or (case-insensitive) name → agent id. */
export async function resolveAgentId(agent: string): Promise<string> {
  const agents = z.array(Agent).parse(await api('/agents'));
  const needle = agent.trim().toLowerCase();
  const hit = agents.find((a) => a.id === agent || a.name.toLowerCase() === needle);
  if (!hit) {
    const names = agents.map((a) => a.name).join(', ') || '(none configured)';
    throw new Error(
      `Agent "${agent}" not found. Call list_agents to see configured agents and pass a valid id or name. Available: ${names}.`,
    );
  }
  return hit.id;
}

/** Resolve a repo by id, full_name ("owner/name"), or bare name → repo id. */
export async function resolveRepoId(repo: string): Promise<string> {
  const repos = z.array(Repo).parse(await api('/repos'));
  const needle = repo.trim().toLowerCase();
  const hit = repos.find(
    (r) =>
      r.id === repo || r.full_name.toLowerCase() === needle || r.name.toLowerCase() === needle,
  );
  if (!hit) {
    const names = repos.map((r) => r.full_name).join(', ') || '(none connected)';
    throw new Error(
      `Repo "${repo}" not found. Pass a connected repository as "owner/name". Available: ${names}.`,
    );
  }
  return hit.id;
}

/** Resolve a (repo id, PR number) → the internal pull-request uuid. */
export async function resolvePrId(repoId: string, pr: number): Promise<string> {
  const pulls = z.array(PrMeta).parse(await api(`/repos/${encodeURIComponent(repoId)}/pulls`));
  const hit = pulls.find((p) => p.number === pr);
  if (!hit) {
    const nums = pulls.map((p) => `#${p.number}`).join(', ') || '(none)';
    throw new Error(`PR #${pr} not found in this repo. Open PRs: ${nums}.`);
  }
  if (!hit.id) {
    throw new Error(
      `PR #${pr} is listed but not imported yet, so it has no internal id to review. Open it in the DevDigest studio once to import it, then retry.`,
    );
  }
  return hit.id;
}
