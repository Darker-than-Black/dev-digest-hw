import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/** One prior PR touching at least one of `filePaths` — blast's "prior PRs" list. */
export interface PriorPullRow {
  id: string;
  number: number;
  title: string;
  author: string;
  openedAt: Date | null;
}

/**
 * Prior PRs (excluding `excludePrId`) whose `pr_files` overlap `filePaths`,
 * scoped to BOTH `workspaceId` AND `repoId` (same double gate as `getPull` —
 * never leak another workspace's, or even another repo in the same
 * workspace's, PRs into this list), newest first: `opened_at DESC NULLS LAST`
 * (Postgres defaults DESC to `NULLS FIRST`, which would float un-opened rows
 * to the top — explicit override), tiebroken by `number DESC`.
 *
 * `INNER JOIN` + `selectDistinct` collapses a PR that matches on MULTIPLE
 * files down to one row — `id` is in the select list (even though callers
 * don't need it) so `DISTINCT` dedupes by true PR identity, not by the
 * display columns. `[]` on an empty `filePaths` — no I/O.
 */
export async function getPriorPullsForFiles(
  db: Db,
  workspaceId: string,
  repoId: string,
  excludePrId: string,
  filePaths: string[],
  limit: number,
): Promise<PriorPullRow[]> {
  if (filePaths.length === 0) return [];
  return db
    .selectDistinct({
      id: t.pullRequests.id,
      number: t.pullRequests.number,
      title: t.pullRequests.title,
      author: t.pullRequests.author,
      openedAt: t.pullRequests.openedAt,
    })
    .from(t.pullRequests)
    .innerJoin(t.prFiles, eq(t.prFiles.prId, t.pullRequests.id))
    .where(
      and(
        eq(t.pullRequests.workspaceId, workspaceId),
        eq(t.pullRequests.repoId, repoId),
        ne(t.pullRequests.id, excludePrId),
        inArray(t.prFiles.path, filePaths),
      ),
    )
    .orderBy(sql`${t.pullRequests.openedAt} DESC NULLS LAST`, desc(t.pullRequests.number))
    .limit(limit);
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  await db
    .insert(t.prIntent)
    .values({
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}
