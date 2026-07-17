import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';
import type { Logger } from './run-executor.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 *
 * `container.git`'s clone is a shallow (depth-1) mirror of the DEFAULT branch
 * only — it usually has neither a fork PR's head commit nor enough shared
 * history to resolve `merge-base(base, head)` for the three-dot diff below.
 * `prepareReviewDiff` fetches both refs first (best-effort: offline/network
 * failure there is non-fatal, we still attempt the diff with whatever the
 * clone already has).
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
  logger?: Logger,
): Promise<UnifiedDiff> {
  const repoRef = { owner: repoRow.owner, name: repoRow.name };

  try {
    await container.git.prepareReviewDiff(repoRef, pull.base, pull.number);
  } catch (err) {
    logger?.warn(
      { err: (err as Error).message, prId: pull.id, number: pull.number },
      'prepareReviewDiff failed (best-effort) — diffing with the clone as-is',
    );
  }

  try {
    const diff = await container.git.diff(repoRef, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch (err) {
    // Previously a bare `catch {}` — silently swallowed "bad revision" errors
    // (e.g. the PR head not present in the clone), making an ERRORED diff
    // indistinguishable from a genuinely-empty one. Log it so the reason is
    // visible instead of just "0 findings, score 100" downstream.
    logger?.warn(
      { err: (err as Error).message, prId: pull.id, number: pull.number },
      'git diff failed — falling back to pr_files reconstruction',
    );
  }
  return diffFromPrFiles(repo, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(repo: ReviewRepository, prId: string): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
