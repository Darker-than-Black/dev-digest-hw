/**
 * MCP server config. `apiUrl` = where the DevDigest API lives (local dev :3001,
 * LocalNoAuthProvider → no auth header). The poll knobs bound how long
 * run_agent_on_pr blocks while waiting for a review to finish.
 */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  /** Base URL of the DevDigest Fastify API. */
  apiUrl: (process.env.DEVDIGEST_API_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
  /** Max time run_agent_on_pr waits for a run to complete before returning a "still running" result. */
  runTimeoutMs: intEnv('DEVDIGEST_RUN_TIMEOUT_MS', 180_000),
  /** How often to poll run status while waiting. */
  runPollMs: intEnv('DEVDIGEST_RUN_POLL_MS', 2_000),
};
