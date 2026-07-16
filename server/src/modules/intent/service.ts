import type { Container } from '../../platform/container.js';
import type { PrIntentRecord } from '@devdigest/shared';
import { deriveIntent } from '@devdigest/reviewer-core';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { buildFileList, toPrIntentRecord } from './helpers.js';
import { gatherSpec } from './spec-gather.js';
import { INTENT_FEATURE_ID } from './constants.js';

/**
 * IntentService — derives + persists a PR's `Intent{intent,in_scope,out_of_scope}`.
 *
 * `getIntent` is a plain scoped read. `computeIntent` is compute-if-missing by
 * default (`force:false`, the auto-compute-on-first-review path in
 * `reviews/run-executor.ts`); the recompute route passes `force:true`.
 *
 * DB access goes ONLY through `container.reviewRepo` (the `pr_intent` owner) —
 * this module never imports drizzle-orm/db/schema.
 */
export class IntentService {
  constructor(private container: Container) {}

  /** Scoped read: PR must belong to the workspace, else NotFoundError. */
  async getIntent(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const intent = await this.container.reviewRepo.getIntent(prId);
    return intent ? toPrIntentRecord(intent, prId) : null;
  }

  /**
   * Compute-if-missing by default. `force:true` always re-derives (manual
   * recompute button). Best-effort spec gathering + a flash-class LLM call —
   * callers that want "never fail the caller" (auto-compute on first review)
   * wrap this in `.catch(() => undefined)` themselves.
   */
  async computeIntent(
    workspaceId: string,
    prId: string,
    { force }: { force: boolean },
  ): Promise<PrIntentRecord> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    if (!force) {
      const existing = await this.container.reviewRepo.getIntent(prId);
      if (existing) return toPrIntentRecord(existing, prId);
    }

    const repo = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const prFiles = await this.container.reviewRepo.getPrFiles(prId);
    const fileList = buildFileList(prFiles);

    const feature = await resolveFeatureModel(this.container, workspaceId, INTENT_FEATURE_ID);

    const body = pull.body ?? '';
    const spec = await gatherSpec(
      this.container,
      { repoId: pull.repoId, repo: { owner: repo.owner, name: repo.name }, body },
      feature,
    );

    const llm = await this.container.llm(feature.provider);
    const outcome = await deriveIntent({
      llm,
      model: feature.model,
      title: pull.title,
      ...(body ? { body } : {}),
      ...(spec ? { issueSpec: spec } : {}),
      fileList,
      sessionId: `${repo.owner}/${repo.name}#${pull.number}:intent`,
    });

    await this.container.reviewRepo.upsertIntent(prId, outcome.intent);
    this.logTokensSaved(prFiles, fileList);

    return toPrIntentRecord(outcome.intent, prId);
  }

  /**
   * Log (only — nothing persisted) the approximate tokens saved by sending the
   * classifier a headers-only file list instead of full diff bodies.
   */
  private logTokensSaved(prFiles: { patch?: string | null }[], fileList: string): void {
    const fullPatchText = prFiles.map((f) => f.patch ?? '').join('\n');
    const fullTokens = this.container.tokenizer.count(fullPatchText);
    const headersTokens = this.container.tokenizer.count(fileList);
    const saved = Math.max(0, fullTokens - headersTokens);
    console.info(`intent: omitted diff bodies, ~${saved} tokens saved`);
  }
}
