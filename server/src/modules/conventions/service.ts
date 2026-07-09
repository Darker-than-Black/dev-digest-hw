import type { Container } from '../../platform/container.js';
import type {
  ConventionCandidate,
  ConventionSkillDraft,
  ExtractResult,
  UpdateConventionBody,
} from '@devdigest/shared';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, type ConventionRow, type UpdateConvention } from './repository.js';
import { buildSkillDraft, type FileContent } from './helpers.js';
import { filterGroundedProposals } from './helpers.js';
import { buildExtractPrompt, ExtractionResponse } from './prompt.js';
import { CONFIG_FILENAMES, CONVENTIONS_FEATURE_ID, SAMPLE_FILE_COUNT } from './constants.js';

/**
 * L02 — conventions service. Orchestrates the synchronous extract pipeline
 *   sample (configs ∪ top code files) → prompt → LLM (feature model)
 *        → code-side evidence gate → persist survivors as `pending`
 * plus list / accept-reject-edit / merged skill-draft assembly. The repository
 * is the only DB layer; the LLM is resolved via the DI container.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  /** Map a persisted row (camelCase) → the wire contract (snake_case). */
  private toCandidate(row: ConventionRow): ConventionCandidate {
    return {
      id: row.id,
      category: row.category ?? '',
      rule: row.rule,
      evidence_path: row.evidencePath ?? '',
      evidence_snippet: row.evidenceSnippet ?? '',
      evidence_start_line: row.evidenceStartLine,
      evidence_end_line: row.evidenceEndLine,
      confidence: row.confidence ?? 0,
      status: row.status,
      edited: row.edited,
    };
  }

  /**
   * SYNCHRONOUS extract. Samples config + top code files, asks the feature model
   * for convention proposals, drops any whose citation the evidence gate can't
   * confirm, persists the survivors as `pending`, and returns them.
   */
  async extract(workspaceId: string, repoId: string): Promise<ExtractResult> {
    const repoIntel = this.container.repoIntel;

    // 1. Sample collection (no LLM): explicit config files ∪ top-N code files.
    const codePaths = await repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    const samplePaths = [...new Set([...CONFIG_FILENAMES, ...codePaths])];
    const fetched = await repoIntel.readFiles(repoId, samplePaths);
    const present = fetched.filter((f) => f.content !== null);

    // 2. Prompt + 3. LLM call via the resolved feature model.
    const messages = buildExtractPrompt(present);
    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      CONVENTIONS_FEATURE_ID,
    );
    const llm = await this.container.llm(provider);
    const { data } = await llm.completeStructured({
      model,
      schema: ExtractionResponse,
      schemaName: 'conventions',
      messages,
      temperature: 0,
    });
    const proposals = data.candidates;

    // 4. Evidence gate. Re-read any cited path not already in the sample set so
    //    the gate can check files the model referenced beyond the sample.
    const known = new Set(fetched.map((f) => f.path));
    const citedMissing = [
      ...new Set(proposals.map((p) => p.evidence_path).filter((p) => !known.has(p))),
    ];
    const extra: FileContent[] = citedMissing.length
      ? await repoIntel.readFiles(repoId, citedMissing)
      : [];
    const files: FileContent[] = [...fetched, ...extra];
    const grounded = filterGroundedProposals(proposals, files);

    // 5. Persist survivors as `pending` and return them.
    const rows = await this.repo.insertCandidates(
      grounded.map((p) => ({
        workspaceId,
        repoId,
        category: p.category,
        rule: p.rule,
        evidencePath: p.evidence_path,
        evidenceSnippet: p.evidence_snippet,
        evidenceStartLine: p.evidence_start_line ?? null,
        evidenceEndLine: p.evidence_end_line ?? null,
        confidence: p.confidence,
      })),
    );

    return { candidates: rows.map((r) => this.toCandidate(r)), scanned_files: present.length };
  }

  /** Persisted candidates for a repo (workspace-scoped). */
  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map((r) => this.toCandidate(r));
  }

  /** Accept/reject and/or edit rule+category; editing `rule` sets `edited=true`. */
  async update(
    workspaceId: string,
    id: string,
    body: UpdateConventionBody,
  ): Promise<ConventionCandidate | undefined> {
    const patch: UpdateConvention = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.category !== undefined) patch.category = body.category;
    if (body.rule !== undefined) {
      patch.rule = body.rule;
      patch.edited = true;
    }
    const row = await this.repo.updateOne(workspaceId, id, patch);
    return row ? this.toCandidate(row) : undefined;
  }

  /** Assemble the merged, editable skill draft from the accepted candidates. */
  async buildSkillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    const repo = await this.container.reviewRepo.getRepo(repoId);
    const repoName = repo?.name ?? 'repo';
    return buildSkillDraft(
      accepted.map((r) => this.toCandidate(r)),
      repoName,
    );
  }
}
