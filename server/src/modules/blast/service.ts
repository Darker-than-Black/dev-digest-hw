import type { Container } from '../../platform/container.js';
import type { BlastIndexBadge, BlastResponse } from '@devdigest/shared';
import type { BlastResult, IndexState, SymbolRow } from '../repo-intel/types.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { buildExplainMessages, mapPriorPull, mapToBlastResponse } from './helpers.js';
import { detectFileChange, parseChangedLines } from './diff.js';
import {
  BLAST_EXPLAIN_FEATURE_ID,
  EXPLAINABLE_STATUSES,
  EXPLAIN_MAX_TOKENS,
  PRIOR_PULLS_LIMIT,
} from './constants.js';
import { SUPPORTED_EXT } from '../repo-intel/constants.js';
import { extname } from 'node:path';

/** A `pr_files` row shape this module reads (subset — patch included). */
interface PrFileRow {
  path: string;
  patch: string | null;
}

/**
 * BlastService — thin consumer of the repo-intel facade. Reads ONLY through
 * `container.repoIntel` (the facade — never repo-intel's tables/drizzle
 * directly) and `container.reviewRepo`. Never re-implements the facade's
 * symbols → callers → endpoints/crons algorithm (`RepoIntelService.
 * getBlastRadius` already does that); it DOES own the diff-precision
 * (line-level vs file-level) filtering and the index-freshness status,
 * neither of which the facade has enough context to compute itself.
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

    const [blastResult, indexState, symbolRows, endpointRefs, fileRanks, repo, priorPullRows] =
      await Promise.all([
        this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles),
        this.container.repoIntel.getIndexState(pull.repoId),
        this.container.repoIntel.getSymbolsInFiles(pull.repoId, changedFiles),
        // Step 3 — HTTP routes reachable from the changed files via a 2-level
        // import-graph walk (dependents), min-depth + source file per endpoint.
        // Degrades to [] on an unindexed/graphless repo.
        this.container.repoIntel.getReachableEndpointRefs(pull.repoId, changedFiles),
        // Presence of a rank row = "this file is in the persistent index" —
        // the signal `computeIndexStatus` uses for `missing_files`.
        this.container.repoIntel.getFileRank(pull.repoId, changedFiles),
        // For the prior-PRs' GitHub URLs (`owner/name`).
        this.container.reviewRepo.getRepo(pull.repoId),
        // Prior PRs (this workspace + repo, excluding this PR) whose pr_files
        // overlap ANY of this PR's changed files, newest first.
        this.container.reviewRepo.getPriorPullsForFiles(
          workspaceId,
          pull.repoId,
          prId,
          changedFiles,
          PRIOR_PULLS_LIMIT,
        ),
      ]);

    const { mode, survivors } = detectChangeMode(prFiles, symbolRows);
    const filteredResult = mode === 'line-level' ? filterToSurvivors(blastResult, survivors) : blastResult;

    const { status, missingFiles } = computeIndexStatus({
      indexState,
      blastResult,
      headSha: pull.headSha,
      prFiles,
      rankedFiles: new Set(fileRanks.map((r) => r.path)),
      repoIntelEnabled: this.container.config.repoIntelEnabled,
    });

    // `repo` should always resolve (pull.repoId is a live FK) — the `?? ''`
    // is a defensive fallback only, never expected to fire.
    const repoFullName = repo?.fullName ?? '';
    const priorPulls = priorPullRows.map((row) => mapPriorPull(row, repoFullName));

    const response = mapToBlastResponse(filteredResult, indexState, {
      changeDetectionMode: mode,
      status,
      missingFiles,
      endpointRefs,
      priorPulls,
    });

    // Opt-in only, and only when there's actual data to summarize — the
    // default read spends zero tokens. `degraded`/`partial` still have real
    // (if imperfect) impact data worth a paragraph; only `unavailable` (no
    // data source at all) and an empty impacts list have nothing to explain.
    if (explain && EXPLAINABLE_STATUSES.has(response.index.status) && response.impacts.length > 0) {
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

/**
 * `line-level` iff at least one changed file's patch yields hunks
 * (`parseChangedLines`) AND `getSymbolsInFiles` returned at least one row
 * with a real line range (`endLine > 0` — the facade zero-fills when the
 * index has no line data for a symbol). Otherwise `file-level` (every
 * symbol in a touched file counts as "changed" — the pre-existing,
 * lower-precision behavior).
 *
 * On `line-level`, `survivors` is the set of `${file}::${name}` keys for
 * symbols whose `[startLine,endLine]` intersects at least one changed-line
 * range of their file — mirrors the facade's own `Class.method` dual-emit
 * skip (bare names only).
 */
function detectChangeMode(
  prFiles: PrFileRow[],
  symbolRows: SymbolRow[],
): { mode: 'line-level' | 'file-level'; survivors: Set<string> } {
  const linesByFile = new Map(prFiles.map((f) => [f.path, parseChangedLines(f.patch)]));
  const anyHunks = [...linesByFile.values()].some((ranges) => ranges.length > 0);
  const anyRangedSymbols = symbolRows.some((s) => s.endLine > 0);

  if (!anyHunks || !anyRangedSymbols) {
    return { mode: 'file-level', survivors: new Set() };
  }

  const survivors = new Set<string>();
  for (const sym of symbolRows) {
    if (sym.name.includes('.')) continue; // skip Class.method dual-emit — mirrors tryPersistentBlast
    const ranges = linesByFile.get(sym.file) ?? [];
    const intersects = ranges.some((r) => sym.startLine <= r.endLine && sym.endLine >= r.startLine);
    if (intersects) survivors.add(`${sym.file}::${sym.name}`);
  }
  return { mode: 'line-level', survivors };
}

/**
 * Filter the facade's `changedSymbols` (and, transitively, `callers` — every
 * caller row's `viaSymbol` must still be a surviving symbol NAME) down to the
 * line-level survivor set. `impactedEndpoints`/`factsByFile` are left as-is:
 * they're consumed per-impact by unioning each impact's (now-filtered)
 * caller files, so they narrow automatically without needing a second pass.
 */
function filterToSurvivors(result: BlastResult, survivors: Set<string>): BlastResult {
  const changedSymbols = result.changedSymbols.filter((s) => survivors.has(`${s.file}::${s.name}`));
  const keptNames = new Set(changedSymbols.map((s) => s.name));
  const callers = result.callers.filter((c) => keptNames.has(c.viaSymbol));
  return { ...result, changedSymbols, callers };
}

interface IndexStatusInput {
  indexState: IndexState;
  blastResult: BlastResult;
  headSha: string;
  prFiles: PrFileRow[];
  /** Paths present in `file_rank` — "this file is in the persistent index". */
  rankedFiles: Set<string>;
  repoIntelEnabled: boolean;
}

/**
 * Compute the blast-layer badge status (spec §5) — the facade's own
 * `IndexState.status` is `repo-intel`'s local view (full/partial/degraded/
 * failed) and doesn't know about diff-scoped precision or headSha freshness,
 * so blast owns the final call:
 *
 *   - `unavailable` — index truly absent: `getIndexState` synthesized its
 *     degraded row (no `repo_index_state` row at all — reason `no_data` +
 *     the epoch-0 `updatedAt` sentinel — the index was never built, full
 *     stop), OR the flag is off AND the facade came back degraded-and-empty
 *     (no clone to even ripgrep-fallback against — the narrower case a real,
 *     non-synthesized index row wouldn't otherwise catch). Never render
 *     this as a zero-count "no impact" — the caller must special-case it.
 *   - `degraded` — index present but stale (`lastIndexedSha !== headSha`),
 *     or the facade came back degraded WITH real data (the ripgrep
 *     fallback found something, or the persistent path hit its global
 *     safety cap — `callers_capped`), or an indexer `failed` state.
 *   - `partial` — one or more changed files are absent from `missing_files`
 *     (a supported-ext file with no `file_rank` row, or a deleted/renamed
 *     file the patch text couldn't cleanly resolve — `pr_files` has no
 *     `status`/`previous_path` column, so this is best-effort).
 *   - `full` — otherwise.
 */
function computeIndexStatus(input: IndexStatusInput): {
  status: BlastIndexBadge['status'];
  missingFiles: string[];
} {
  const { indexState, blastResult, headSha, prFiles, rankedFiles, repoIntelEnabled } = input;

  // NOTE: `getBlastRadius`'s ripgrep/degraded fallback ALWAYS returns
  // `reason: 'no_data'` — even when the clone exists and it found real
  // symbols/callers (see `RepoIntelService.getBlastRadius`'s header comment).
  // So `reason` alone can't distinguish "no data source at all" from "no
  // persistent index, but ripgrep found something real" — use whether the
  // facade actually returned any rows for the flag-off clause below.
  const hasAnyBlastData =
    blastResult.changedSymbols.length > 0 ||
    blastResult.callers.length > 0 ||
    blastResult.impactedEndpoints.length > 0;

  // No `repo_index_state` row has EVER been written for this repo — the
  // index was never built, full stop, regardless of what the ripgrep
  // fallback incidentally scraped from a live clone.
  const indexRowSynthesized =
    indexState.degradedReason === 'no_data' && indexState.updatedAt.getTime() === 0;
  // Flag off AND nothing to fall back to either (no clone) — the narrower
  // case a real (non-synthesized) `repo_index_state` row wouldn't catch.
  const flagOffNoData = !repoIntelEnabled && blastResult.degraded === true && !hasAnyBlastData;
  const unavailable = indexRowSynthesized || flagOffNoData;

  // missing_files: supported-ext changed files with no rank row (not in the
  // persistent index), plus any deleted/renamed file (best-effort patch
  // sniff — always unresolved, since there's no base-commit index to diff
  // against).
  const missingFiles: string[] = [];
  for (const f of prFiles) {
    const { deleted, renamed } = detectFileChange(f.patch);
    if (deleted || renamed) {
      missingFiles.push(f.path);
      continue;
    }
    const ext = extname(f.path).toLowerCase();
    if (!(SUPPORTED_EXT as readonly string[]).includes(ext)) continue;
    if (!rankedFiles.has(f.path)) missingFiles.push(f.path);
  }

  if (unavailable) return { status: 'unavailable', missingFiles };

  const stale = indexState.lastIndexedSha !== '' && indexState.lastIndexedSha !== headSha;
  const facadeFailed = indexState.status === 'failed';
  // Facade degraded WITH real data — the ripgrep fallback found something
  // (lower fidelity: no rank, no persistent caller resolution), or the
  // persistent path hit its global safety cap (`callers_capped`).
  const facadeDegradedWithData = blastResult.degraded === true && hasAnyBlastData;
  if (stale || facadeFailed || facadeDegradedWithData) {
    return { status: 'degraded', missingFiles };
  }

  if (missingFiles.length > 0) return { status: 'partial', missingFiles };

  return { status: 'full', missingFiles };
}
