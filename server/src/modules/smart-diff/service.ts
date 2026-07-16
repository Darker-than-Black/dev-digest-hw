import type { Container } from '../../platform/container.js';
import type { SmartDiffResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { composeSmartDiff } from './helpers.js';

/**
 * SmartDiffService — composes an existing PR's `pr_files` rows + the newest
 * review's `findings` rows into a `SmartDiffResponse`. NO LLM call, nothing
 * persisted — a pure deterministic read-compose over data another feature
 * already produced. DB access goes ONLY through `container.reviewRepo`, and
 * only its already-existing reads (`getPull`, `getPrFiles`,
 * `reviewsForPull`) — never the raw db client directly, never a new
 * repository method.
 *
 * Single consumer (its own route) — not registered on the container,
 * instantiated inline in `routes.ts`, same shape as `ReviewService`.
 */
export class SmartDiffService {
  constructor(private container: Container) {}

  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    // SECURITY — `getPull` is the ONLY workspace gate. `getPrFiles` and
    // `reviewsForPull` are unscoped by design, so this check MUST run and be
    // checked before either is called: reversing the order leaks another
    // workspace's file paths / findings on a guessed id. Same gate as
    // `IntentService.getIntent` and `ReviewService.reviewsForPull`.
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const prFiles = await this.container.reviewRepo.getPrFiles(prId);

    // Findings from EVERY kind:'review' row, not just the newest one.
    // Multi-agent review is first-class here: each agent's pass is its own
    // review row, so a "newest row only" rule would surface one agent's
    // findings and hide the other four — e.g. a Security Reviewer blocker
    // going invisible because a later API Contract Reviewer pass found
    // nothing. This matches the PR-list aggregates, which also count all
    // runs (`modules/pulls/routes.ts`). kind:'summary' rows carry no
    // findings of their own and are skipped. Zero reviews -> findings=[] ->
    // every finding_lines empty -> layout without overlay (not an error).
    const rows = await this.container.reviewRepo.reviewsForPull(prId);
    const findings = rows.filter((r) => r.review.kind === 'review').flatMap((r) => r.findings);

    const files = prFiles.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
    }));
    const inputFindings = findings.map((f) => ({
      file: f.file,
      start_line: f.startLine,
    }));

    return composeSmartDiff(files, inputFindings);
  }
}
