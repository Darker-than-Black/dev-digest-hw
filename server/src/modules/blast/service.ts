import type { Container } from '../../platform/container.js';
import type { BlastResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { buildExplainMessages, mapToBlastResponse } from './helpers.js';
import { BLAST_EXPLAIN_FEATURE_ID, EXPLAIN_MAX_TOKENS } from './constants.js';

/**
 * BlastService — thin consumer of the repo-intel facade. Reads ONLY through
 * `container.repoIntel` (the facade — never repo-intel's tables/drizzle
 * directly) and `container.reviewRepo`. Never re-implements the facade's
 * symbols → callers → endpoints/crons algorithm (`RepoIntelService.
 * getBlastRadius` already does that), never writes the index.
 *
 * Single consumer (its own route) — not registered on the container,
 * instantiated inline in `routes.ts`, same shape as `SmartDiffService`.
 */
export class BlastService {
  constructor(private container: Container) {}

  async getBlast(
    workspaceId: string,
    prId: string,
    { explain }: { explain: boolean },
  ): Promise<BlastResponse> {
    // SECURITY — `getPull` is the ONLY workspace gate. `getPrFiles` is
    // unscoped by design, so this check MUST run and be checked before it's
    // called: reversing the order leaks another workspace's file paths on a
    // guessed PR id. Same gate as `SmartDiffService.getSmartDiff` and
    // `IntentService.getIntent`.
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const prFiles = await this.container.reviewRepo.getPrFiles(prId);
    const changedFiles = prFiles.map((f) => f.path);

    const [blastResult, indexState, reachableEndpoints] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles),
      this.container.repoIntel.getIndexState(pull.repoId),
      // Step 3 — HTTP routes reachable from the changed files via a 2-level
      // import-graph walk (dependents). Unioned into the flat endpoints by the
      // mapper. Degrades to [] on an unindexed/graphless repo.
      this.container.repoIntel.getReachableEndpoints(pull.repoId, changedFiles),
    ]);

    const response = mapToBlastResponse(blastResult, indexState, reachableEndpoints);

    // Opt-in only, and only when there's actual data to summarize — the
    // default read spends zero tokens. Skipped on the degraded path (nothing
    // grounded to explain) and when there are no impacts at all.
    if (explain && !response.index.degraded && response.impacts.length > 0) {
      response.explanation = await this.explain(workspaceId, response);
    }

    return response;
  }

  /**
   * Cheap-model paragraph summarizing the blast map. Any failure (resolve /
   * LLM / timeout) degrades to `null` — an explain error never fails the
   * read.
   */
  private async explain(workspaceId: string, response: BlastResponse): Promise<string | null> {
    try {
      const feature = await resolveFeatureModel(
        this.container,
        workspaceId,
        BLAST_EXPLAIN_FEATURE_ID,
      );
      const llm = await this.container.llm(feature.provider);
      const result = await llm.complete({
        model: feature.model,
        messages: buildExplainMessages(response),
        maxTokens: EXPLAIN_MAX_TOKENS,
      });
      return result.text.trim() || null;
    } catch {
      return null;
    }
  }
}
