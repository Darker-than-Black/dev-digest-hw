import { describe, it, expect, vi } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { BlastResult, IndexState } from '../repo-intel/types.js';
import { BlastService } from './service.js';
import { resolveFeatureModel } from '../settings/feature-models.js';

// `explain()` resolves its model via `resolveFeatureModel` — mocked so the
// explain-gate tests below can assert whether it was even CALLED (the gate
// question) without needing a real settings/DB round trip.
vi.mock('../settings/feature-models.js', () => ({
  resolveFeatureModel: vi.fn(async () => ({ provider: 'mock', model: 'mock-model' })),
}));

const REPO_ID = 'repo-1';
const HEAD_SHA = 'abc123';

const PULL = { id: 'pr1', repoId: REPO_ID, headSha: HEAD_SHA };

const CHANGED_TS = 'server/src/modules/foo/service.ts';
const CHANGED_MD = 'README.md'; // unsupported ext — never counts toward missing_files

const FRESH_FULL_INDEX: IndexState = {
  repoId: REPO_ID,
  status: 'full',
  filesIndexed: 10,
  filesSkipped: 0,
  durationMs: 100,
  lastIndexedSha: HEAD_SHA,
  indexerVersion: 2,
  updatedAt: new Date('2026-07-10T00:00:00.000Z'),
  degraded: false,
};

const SYNTHESIZED_INDEX: IndexState = {
  repoId: REPO_ID,
  status: 'degraded',
  filesIndexed: 0,
  filesSkipped: 0,
  durationMs: 0,
  reason: 'no_data',
  lastIndexedSha: '',
  indexerVersion: 2,
  updatedAt: new Date(0),
  degraded: true,
  degradedReason: 'no_data',
};

const EMPTY_BLAST_RESULT: BlastResult = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
  degraded: false,
};

/**
 * Minimal fake container — only the reads `BlastService.getBlast` uses.
 * `repoIntelEnabled: true` matches the default; tests override where needed.
 */
function makeContainer(opts: {
  prFiles?: { path: string; patch: string | null }[];
  blastResult?: BlastResult;
  indexState?: IndexState;
  fileRanks?: { path: string; percentile: number }[];
  repoIntelEnabled?: boolean;
  repoFullName?: string;
  priorPulls?: { number: number; title: string; author: string; openedAt: Date | null }[];
}): Container {
  const fake = {
    config: { repoIntelEnabled: opts.repoIntelEnabled ?? true },
    reviewRepo: {
      getPull: async () => PULL,
      getPrFiles: async () => opts.prFiles ?? [{ path: CHANGED_TS, patch: null }],
      getRepo: async () => ({ fullName: opts.repoFullName ?? 'acme/widgets' }),
      getPriorPullsForFiles: async () => opts.priorPulls ?? [],
    },
    repoIntel: {
      getBlastRadius: async () => opts.blastResult ?? EMPTY_BLAST_RESULT,
      getIndexState: async () => opts.indexState ?? FRESH_FULL_INDEX,
      getSymbolsInFiles: async () => [],
      getReachableEndpointRefs: async () => [],
      getFileRank: async () => opts.fileRanks ?? [{ path: CHANGED_TS, percentile: 0.9 }],
    },
    llm: async () => ({ complete: async () => ({ text: 'a mock explanation' }) }),
  };
  return fake as unknown as Container;
}

describe('BlastService.getBlast — index status (spec §5)', () => {
  it('25.10 — unavailable: getIndexState synthesized its degraded row (no repo_index_state row)', async () => {
    const container = makeContainer({
      indexState: SYNTHESIZED_INDEX,
      blastResult: { ...EMPTY_BLAST_RESULT, degraded: true, reason: 'no_data' },
      fileRanks: [],
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.index.status).toBe('unavailable');
  });

  it('25.11 — partial: a supported-ext changed file has no file_rank row', async () => {
    const container = makeContainer({
      prFiles: [
        { path: CHANGED_TS, patch: null },
        { path: CHANGED_MD, patch: null },
      ],
      // Only CHANGED_TS is missing from the rank table — CHANGED_MD is
      // unsupported-ext and never counts.
      fileRanks: [],
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.index.status).toBe('partial');
    expect(response.index.missing_files).toEqual([CHANGED_TS]);
  });

  it('25.12 — degraded: index present but stale (lastIndexedSha !== headSha)', async () => {
    const container = makeContainer({
      indexState: { ...FRESH_FULL_INDEX, lastIndexedSha: 'old-sha-before-latest-push' },
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.index.status).toBe('degraded');
  });

  it('degraded (not unavailable): a real (non-synthesized) index row + flag off, but ripgrep fallback found real data — the fallback always tags reason "no_data" even on success, so unavailable must key off empty data, not the reason string', async () => {
    const container = makeContainer({
      repoIntelEnabled: false,
      indexState: FRESH_FULL_INDEX, // a REAL persisted row (not the synthesized/no-row sentinel)
      blastResult: {
        changedSymbols: [{ file: CHANGED_TS, name: 'doThing', kind: 'function' }],
        callers: [{ file: 'caller.ts', symbol: 'caller', viaSymbol: 'doThing', line: 1, rank: 0 }],
        impactedEndpoints: [],
        degraded: true,
        reason: 'no_data',
      },
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.index.status).toBe('degraded');
  });

  it('unavailable still wins when the index row IS synthesized, even if ripgrep incidentally found data', async () => {
    const container = makeContainer({
      repoIntelEnabled: false,
      indexState: SYNTHESIZED_INDEX, // no repo_index_state row was ever written
      blastResult: {
        changedSymbols: [{ file: CHANGED_TS, name: 'doThing', kind: 'function' }],
        callers: [{ file: 'caller.ts', symbol: 'caller', viaSymbol: 'doThing', line: 1, rank: 0 }],
        impactedEndpoints: [],
        degraded: true,
        reason: 'no_data',
      },
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.index.status).toBe('unavailable');
  });

  it('degraded: the facade itself flagged degraded for a reason other than no_data (e.g. safety-cap hit — always has real data by construction)', async () => {
    const container = makeContainer({
      blastResult: {
        changedSymbols: [{ file: CHANGED_TS, name: 'doThing', kind: 'function' }],
        callers: [{ file: 'caller.ts', symbol: 'caller', viaSymbol: 'doThing', line: 1, rank: 0.9 }],
        impactedEndpoints: [],
        degraded: true,
        reason: 'callers_capped',
      },
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.index.status).toBe('degraded');
  });

  it('full: fresh index, every changed file ranked, facade not degraded', async () => {
    const container = makeContainer({});
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.index.status).toBe('full');
    expect(response.index.missing_files).toBeNull();
  });

  it('a deleted file (best-effort patch sniff) forces partial and lands in missing_files', async () => {
    const deletedPatch = ['diff --git a/gone.ts b/gone.ts', '--- a/gone.ts', '+++ /dev/null'].join(
      '\n',
    );
    const container = makeContainer({
      prFiles: [{ path: 'gone.ts', patch: deletedPatch }],
      fileRanks: [],
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.index.status).toBe('partial');
    expect(response.index.missing_files).toEqual(['gone.ts']);
  });
});

describe('BlastService.getBlast — change_detection_mode', () => {
  it('defaults to file-level when there are no diff hunks / ranged symbols', async () => {
    const container = makeContainer({});
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.change_detection_mode).toBe('file-level');
  });
});

describe('BlastService.getBlast — prior_pulls', () => {
  it('maps prior-PR rows to the PriorPull contract shape, GitHub URL from the repo full_name', async () => {
    const container = makeContainer({
      repoFullName: 'acme/widgets',
      priorPulls: [
        {
          number: 42,
          title: 'Refactor foo/service.ts',
          author: 'octocat',
          openedAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ],
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.prior_pulls).toEqual([
      {
        number: 42,
        title: 'Refactor foo/service.ts',
        author: 'octocat',
        opened_at: '2026-06-01T00:00:00.000Z',
        url: 'https://github.com/acme/widgets/pull/42',
      },
    ]);
  });

  it('opened_at is null when the row has no openedAt', async () => {
    const container = makeContainer({
      priorPulls: [{ number: 7, title: 'x', author: 'y', openedAt: null }],
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.prior_pulls[0]?.opened_at).toBeNull();
  });

  it('defaults to [] when nothing overlaps', async () => {
    const container = makeContainer({});
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.prior_pulls).toEqual([]);
  });

  it("passes workspace + repo scope, this PR's id (exclude), and changed files through to getPriorPullsForFiles", async () => {
    let captured: unknown[] = [];
    const container = makeContainer({
      prFiles: [
        { path: CHANGED_TS, patch: null },
        { path: 'server/src/modules/foo/other.ts', patch: null },
      ],
    });
    (container.reviewRepo as unknown as { getPriorPullsForFiles: (...args: unknown[]) => Promise<unknown[]> })
      .getPriorPullsForFiles = async (...args: unknown[]) => {
      captured = args;
      return [];
    };
    const service = new BlastService(container);
    await service.getBlast('ws1', 'pr1', { explain: false });
    expect(captured[0]).toBe('ws1'); // workspace-scoped
    expect(captured[1]).toBe(REPO_ID); // repo-scoped (never leak a sibling repo's PRs)
    expect(captured[2]).toBe('pr1'); // excludes the current PR
    expect(captured[3]).toEqual([CHANGED_TS, 'server/src/modules/foo/other.ts']);
  });
});

describe('BlastService.getBlast — counts.endpoints reconciles with the flat endpoints list', () => {
  it('counts.endpoints always equals the flat deduped endpoints length, so the client can render all of them', async () => {
    const container = makeContainer({
      blastResult: {
        changedSymbols: [{ file: CHANGED_TS, name: 'doThing', kind: 'function' }],
        callers: [],
        impactedEndpoints: ['GET /a', 'POST /b', 'GET /a'], // dup on purpose
        factsByFile: {
          [CHANGED_TS]: { endpoints: ['GET /a', 'POST /b'], crons: [] },
        },
        degraded: false,
      },
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: false });
    expect(response.counts.endpoints).toBe(response.endpoints.length);
    expect(response.counts.endpoints).toBe(2);
  });
});

describe('BlastService.getBlast — explain gate: full/degraded/partial run it, unavailable/empty don\'t', () => {
  const WITH_ONE_SYMBOL: BlastResult = {
    changedSymbols: [{ file: CHANGED_TS, name: 'doThing', kind: 'function' }],
    callers: [],
    impactedEndpoints: [],
    degraded: false,
  };

  it('runs explain on a full-status response', async () => {
    vi.mocked(resolveFeatureModel).mockClear();
    const container = makeContainer({ blastResult: WITH_ONE_SYMBOL });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: true });
    expect(response.index.status).toBe('full');
    expect(resolveFeatureModel).toHaveBeenCalledTimes(1);
    expect(response.explanation).toBe('a mock explanation');
  });

  it('now ALSO runs explain on a degraded (stale-index) response', async () => {
    vi.mocked(resolveFeatureModel).mockClear();
    const container = makeContainer({
      blastResult: WITH_ONE_SYMBOL,
      indexState: { ...FRESH_FULL_INDEX, lastIndexedSha: 'stale-sha-before-latest-push' },
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: true });
    expect(response.index.status).toBe('degraded');
    expect(resolveFeatureModel).toHaveBeenCalledTimes(1);
    expect(response.explanation).toBe('a mock explanation');
  });

  it('now ALSO runs explain on a partial response (a changed file missing from file_rank)', async () => {
    vi.mocked(resolveFeatureModel).mockClear();
    const container = makeContainer({ blastResult: WITH_ONE_SYMBOL, fileRanks: [] });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: true });
    expect(response.index.status).toBe('partial');
    expect(resolveFeatureModel).toHaveBeenCalledTimes(1);
    expect(response.explanation).toBe('a mock explanation');
  });

  it('still skips explain on unavailable (no data source at all)', async () => {
    vi.mocked(resolveFeatureModel).mockClear();
    const container = makeContainer({
      blastResult: { ...WITH_ONE_SYMBOL, degraded: true, reason: 'no_data' },
      indexState: SYNTHESIZED_INDEX,
      fileRanks: [],
    });
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: true });
    expect(response.index.status).toBe('unavailable');
    expect(resolveFeatureModel).not.toHaveBeenCalled();
    expect(response.explanation).toBeNull();
  });

  it('skips explain when there are no impacts at all, even on full status', async () => {
    vi.mocked(resolveFeatureModel).mockClear();
    const container = makeContainer({}); // default EMPTY_BLAST_RESULT — 0 changed symbols
    const service = new BlastService(container);
    const response = await service.getBlast('ws1', 'pr1', { explain: true });
    expect(response.index.status).toBe('full');
    expect(response.impacts).toHaveLength(0);
    expect(resolveFeatureModel).not.toHaveBeenCalled();
  });

  it('skips explain when explain:false, regardless of status', async () => {
    vi.mocked(resolveFeatureModel).mockClear();
    const container = makeContainer({ blastResult: WITH_ONE_SYMBOL });
    const service = new BlastService(container);
    await service.getBlast('ws1', 'pr1', { explain: false });
    expect(resolveFeatureModel).not.toHaveBeenCalled();
  });
});
