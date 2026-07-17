import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, count, desc, eq, inArray, sum } from 'drizzle-orm';
import type { PrMeta, PrDetail, GitHubClient, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import type { Container } from '../../platform/container.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { withTimeout, OfflineError, TimeoutError } from '../../platform/resilience.js';
import { deriveReviewStatus } from './status.js';

/**
 * GitHub sync is best-effort. The two "GitHub is slow / down, serving
 * persisted" signals — the breaker's OfflineError (short-circuited) and a
 * TimeoutError (the wall-clock budget elapsed) — are the expected steady state
 * while GitHub is unreachable, so they log at debug (no warn spam on every
 * reload). Anything else (auth, 5xx, unexpected) is a genuine degradation and
 * stays at warn.
 */
function logGithubSkip(
  log: FastifyBaseLogger,
  err: unknown,
  msg: string,
  extra: Record<string, unknown> = {},
): void {
  const expected = err instanceof OfflineError || err instanceof TimeoutError;
  log[expected ? 'debug' : 'warn']({ err, ...extra }, msg);
}

// Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
// with zeroed size/diff. Backfill them from the detail endpoint, capped per
// sync (each backfill is a detail fetch).
const BACKFILL_LIMIT = 10;

// Wall-clock budget the LIST read will wait on the best-effort GitHub sync
// before serving persisted rows. A slow/offline/503-ing repo would otherwise
// retry-storm (list + up to BACKFILL_LIMIT serial detail fetches, each
// retried) and stall the page load for ~a minute. When the budget elapses we
// serve persisted PRs and the sync keeps finishing in the background.
const GITHUB_SYNC_BUDGET_MS = 2500;

// Per-repo in-flight GitHub sync. Rapid reloads / concurrent readers share one
// background sync instead of each spawning its own retry-storm against a slow
// or 503-ing GitHub. Keyed by repo id; cleared when the sync settles.
const inFlightPullSync = new Map<string, Promise<void>>();

/**
 * Best-effort GitHub sync for a repo's PRs: upsert the PR list, then backfill
 * diff stats for freshly-imported PRs. Writes to the DB only; the LIST route
 * re-reads persisted rows afterwards. Local-first — every GitHub failure is
 * logged and swallowed, never thrown, so the read never fails on it.
 */
async function syncRepoPulls(
  container: Container,
  log: FastifyBaseLogger,
  workspaceId: string,
  repo: typeof t.repos.$inferSelect,
): Promise<void> {
  let gh: GitHubClient;
  try {
    gh = await container.github();
  } catch (err) {
    log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    return;
  }

  try {
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    for (const pr of pulls) {
      await container.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo.id,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        })
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: {
            title: pr.title,
            headSha: pr.head_sha,
            status: pr.status,
            updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
          },
        });
    }
  } catch (err) {
    // If the list itself failed there's nothing to backfill against.
    logGithubSkip(log, err, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
    return;
  }

  // Backfill diff stats once from the detail endpoint. Capped; the periodic
  // refetch chips away at any remainder.
  const rows = await container.db
    .select()
    .from(t.pullRequests)
    .where(eq(t.pullRequests.repoId, repo.id));
  const needStats = rows
    .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
    .slice(0, BACKFILL_LIMIT);
  for (const r of needStats) {
    try {
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
      await container.db
        .update(t.pullRequests)
        .set({
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, r.id));
    } catch (err) {
      logGithubSkip(log, err, 'PR diff-stat backfill skipped', { number: r.number });
    }
  }
}

/**
 * Kick off (or reuse) the best-effort GitHub sync for a repo, then wait on it
 * only up to GITHUB_SYNC_BUDGET_MS. A healthy GitHub finishes inside the
 * budget → the read reflects fresh data; a slow/failing one blows the budget →
 * the read serves persisted rows immediately while the sync completes in the
 * background (idempotent upserts). Concurrent readers share one sync per repo.
 */
async function syncRepoPullsWithinBudget(
  container: Container,
  log: FastifyBaseLogger,
  workspaceId: string,
  repo: typeof t.repos.$inferSelect,
): Promise<void> {
  let sync = inFlightPullSync.get(repo.id);
  if (!sync) {
    sync = syncRepoPulls(container, log, workspaceId, repo).finally(() =>
      inFlightPullSync.delete(repo.id),
    );
    inFlightPullSync.set(repo.id, sync);
  }
  // Don't let a still-running background sync bubble an unhandled rejection
  // once we stop awaiting it.
  sync.catch(() => {});
  try {
    await withTimeout(sync, GITHUB_SYNC_BUDGET_MS);
  } catch (err) {
    logGithubSkip(
      log,
      err,
      'GitHub PR sync exceeded budget; serving persisted PRs (sync continues in background)',
    );
  }
}

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
 *                          synced from GitHub, persisted). `status` is GitHub's
 *                          merge state (open/merged/closed).
 *   GET /pulls/:id       → full PR detail (diff/files, commits, body, linked issue)
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: sync from GitHub when a token is configured, but never let
    // it stall (or fail) the read. Bounded by a wall-clock budget — a healthy
    // GitHub refreshes within it, a slow/offline/503-ing one is abandoned to a
    // background sync and we serve already-imported/seeded PRs immediately.
    await syncRepoPullsWithinBudget(container, app.log, workspaceId, repo);

    const rows = await container.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id));

    // Latest-review SCORE per PR for the list's score ring. Computed on read
    // from reviews (no FK denorm); the list is small, so one IN-query + JS
    // grouping is cheap. The per-severity FINDINGS breakdown (below) is computed
    // the same way for the list's findings column.
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = new Map<string, { score: number | null }>();
    if (prIds.length > 0) {
      const reviewRows = await container.db
        .select({ prId: t.reviews.prId, score: t.reviews.score })
        .from(t.reviews)
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .orderBy(desc(t.reviews.createdAt));
      // Rows are newest-first → first seen per PR is the latest review.
      for (const rv of reviewRows) {
        if (!latestReviewByPr.has(rv.prId)) latestReviewByPr.set(rv.prId, { score: rv.score });
      }
    }

    // Per-severity FINDINGS breakdown per PR = COUNT of findings grouped by
    // severity, across all 'review' runs (same basis as the detail page's
    // flattened findings). severity is plain text in the DB (no pg enum), so a
    // value outside the 3 known keys is ignored rather than trusted.
    const SEV_KEYS = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
    type SevCounts = { CRITICAL: number; WARNING: number; SUGGESTION: number };
    const findingsByPr = new Map<string, SevCounts>();
    if (prIds.length > 0) {
      const sevRows = await container.db
        .select({ prId: t.reviews.prId, severity: t.findings.severity, n: count() })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .groupBy(t.reviews.prId, t.findings.severity);
      for (const sr of sevRows) {
        if (!SEV_KEYS.includes(sr.severity as (typeof SEV_KEYS)[number])) continue;
        const acc = findingsByPr.get(sr.prId) ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
        acc[sr.severity as keyof SevCounts] = Number(sr.n);
        findingsByPr.set(sr.prId, acc);
      }
    }

    // Total LLM cost per PR for the list's COST column = SUM of all runs.
    // Postgres SUM ignores NULL cost (failed/cancelled/legacy runs); a PR with
    // no priced run → null → UI renders "—", never "$0.00".
    const costByPr = new Map<string, number | null>();
    if (prIds.length > 0) {
      const costRows = await container.db
        .select({ prId: t.agentRuns.prId, total: sum(t.agentRuns.costUsd) })
        .from(t.agentRuns)
        .where(inArray(t.agentRuns.prId, prIds))
        .groupBy(t.agentRuns.prId);
      for (const c of costRows) {
        if (c.prId) costByPr.set(c.prId, c.total != null ? Number(c.total) : null);
      }
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPr.get(r.id) ?? null,
        findings: findingsByPr.get(r.id) ?? null,
      };
    });
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(
        and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, req.params.id)),
      );
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline. Bounded by the same wall-clock
    // budget as the list — a slow/offline GitHub is abandoned so the page never
    // hangs on the per-call 30s timeout; the persisted detail serves instead.
    try {
      const gh = await container.github();
      const detail = await withTimeout(
        gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number),
        GITHUB_SYNC_BUDGET_MS,
      );

      await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      if (detail.files.length > 0) {
        await container.db.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId: pr.id,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await container.db.delete(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      if (detail.commits.length > 0) {
        await container.db.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId: pr.id,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await container.db
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, pr.id));

      return { ...detail, id: pr.id };
    } catch (err) {
      logGithubSkip(
        app.log,
        err,
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const files = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      const commits = await container.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  });

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.
  async function resolvePrAndRepo(id: string, workspaceId: string) {
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch (err) {
        app.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
        return [];
      }
      try {
        return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
      } catch (err) {
        logGithubSkip(app.log, err, 'GitHub review-comments fetch skipped (offline / error)');
        return [];
      }
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      const input = req.body;
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch {
        throw new AppError(
          'github_unavailable',
          'Connect a GitHub token to post comments.',
          400,
        );
      }
      try {
        return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
          commitId: pr.headSha,
          path: input.path,
          line: input.line,
          ...(input.side ? { side: input.side } : {}),
          body: input.body,
          ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
        });
      } catch (err) {
        // GitHub rejects comments on lines outside the diff / on closed PRs (422).
        const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
        throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
      }
    },
  );
}
