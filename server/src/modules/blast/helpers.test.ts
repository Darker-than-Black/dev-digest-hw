import { describe, it, expect } from 'vitest';
import { buildExplainMessages, mapToBlastResponse } from './helpers.js';
import type { BlastResult, IndexState } from '../repo-intel/types.js';

const FOO_FILE = 'server/src/modules/foo/service.ts';
const BAR_ROUTES = 'server/src/modules/bar/routes.ts';
const BAZ_SERVICE = 'server/src/modules/baz/service.ts';
const CRON_FILE = 'server/src/jobs/cron.ts';

describe('mapToBlastResponse — persistent (non-degraded) path', () => {
  const persistentResult: BlastResult = {
    changedSymbols: [
      { file: FOO_FILE, name: 'doThing', kind: 'function' },
      { file: FOO_FILE, name: 'doOther', kind: 'function' },
    ],
    callers: [
      { file: BAR_ROUTES, symbol: 'barHandler', viaSymbol: 'doThing', line: 10, rank: 0.9 },
      { file: BAZ_SERVICE, symbol: 'bazHelper', viaSymbol: 'doThing', line: 20, rank: 0.5 },
      { file: CRON_FILE, symbol: 'runCron', viaSymbol: 'doOther', line: 5, rank: 0.3 },
    ],
    impactedEndpoints: ['GET /bar', 'POST /baz'],
    factsByFile: {
      [BAR_ROUTES]: { endpoints: ['GET /bar'], crons: [] },
      [BAZ_SERVICE]: { endpoints: ['POST /baz'], crons: ['nightly-sync'] },
      [CRON_FILE]: { endpoints: [], crons: ['nightly-sync', 'hourly-poll'] },
    },
    degraded: false,
  };

  const fullIndexState: IndexState = {
    repoId: 'repo-1',
    status: 'full',
    filesIndexed: 120,
    filesSkipped: 3,
    durationMs: 5000,
    lastIndexedSha: 'abc123',
    indexerVersion: 2,
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    degraded: false,
  };

  const response = mapToBlastResponse(persistentResult, fullIndexState);

  it('maps the index badge off IndexState', () => {
    expect(response.index).toEqual({
      status: 'full',
      degraded: false,
      reason: null,
      files_indexed: 120,
      files_skipped: 3,
      last_indexed_sha: 'abc123',
      updated_at: '2026-07-01T00:00:00.000Z',
    });
  });

  it('carries changed_symbols through unchanged', () => {
    expect(response.changed_symbols).toEqual([
      { name: 'doThing', file: FOO_FILE, kind: 'function' },
      { name: 'doOther', file: FOO_FILE, kind: 'function' },
    ]);
  });

  it('groups callers by viaSymbol, preserving rank order', () => {
    const doThing = response.impacts.find((i) => i.symbol.name === 'doThing');
    expect(doThing?.callers).toEqual([
      { symbol: 'barHandler', file: BAR_ROUTES, line: 10, rank: 0.9 },
      { symbol: 'bazHelper', file: BAZ_SERVICE, line: 20, rank: 0.5 },
    ]);

    const doOther = response.impacts.find((i) => i.symbol.name === 'doOther');
    expect(doOther?.callers).toEqual([
      { symbol: 'runCron', file: CRON_FILE, line: 5, rank: 0.3 },
    ]);
  });

  it('attributes per-symbol endpoints/crons via factsByFile, deduped across caller files', () => {
    const doThing = response.impacts.find((i) => i.symbol.name === 'doThing');
    expect(doThing?.endpoints).toEqual(['GET /bar', 'POST /baz']);
    expect(doThing?.crons).toEqual(['nightly-sync']);

    const doOther = response.impacts.find((i) => i.symbol.name === 'doOther');
    expect(doOther?.endpoints).toEqual([]);
    expect(doOther?.crons).toEqual(['nightly-sync', 'hourly-poll']);
  });

  it('computes flat endpoints/crons as deduped unions', () => {
    expect(response.endpoints).toEqual(['GET /bar', 'POST /baz']);
    expect(response.crons).toEqual(['nightly-sync', 'hourly-poll']);
  });

  it('computes counts', () => {
    expect(response.counts).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 2 });
  });

  it('defaults explanation to null', () => {
    expect(response.explanation).toBeNull();
  });
});

describe('mapToBlastResponse — step 2: per-symbol caller cap (20)', () => {
  // 25 callers all reaching the SAME changed symbol — the facade may hand back
  // more than 20 (its global cap doesn't bound per-symbol), so the blast layer
  // must clamp each symbol's list to 20 and count only what it renders.
  const manyCallers: BlastResult = {
    changedSymbols: [{ file: FOO_FILE, name: 'hot', kind: 'function' }],
    callers: Array.from({ length: 25 }, (_, i) => ({
      file: `caller-${i}.ts`,
      symbol: `fn${i}`,
      viaSymbol: 'hot',
      line: i + 1,
      rank: (25 - i) / 25, // already rank DESC
    })),
    impactedEndpoints: [],
    factsByFile: {},
    degraded: false,
  };
  const idx: IndexState = {
    repoId: 'r', status: 'full', filesIndexed: 1, filesSkipped: 0, durationMs: 1,
    lastIndexedSha: 's', indexerVersion: 2, updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    degraded: false,
  };

  const response = mapToBlastResponse(manyCallers, idx);

  it('caps a single symbol to 20 callers, keeping the top-ranked ones in order', () => {
    const hot = response.impacts.find((i) => i.symbol.name === 'hot');
    expect(hot?.callers).toHaveLength(20);
    expect(hot?.callers[0]?.symbol).toBe('fn0'); // highest rank kept
    expect(hot?.callers.at(-1)?.symbol).toBe('fn19'); // 21st..25th dropped
  });

  it('counts.callers reflects the capped (rendered) total, not the facade raw 25', () => {
    expect(response.counts.callers).toBe(20);
  });
});

describe('mapToBlastResponse — step 3: reachable-endpoint union', () => {
  const result: BlastResult = {
    changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
    callers: [{ file: BAR_ROUTES, symbol: 'barHandler', viaSymbol: 'doThing', line: 10, rank: 0.9 }],
    impactedEndpoints: ['GET /bar'],
    factsByFile: { [BAR_ROUTES]: { endpoints: ['GET /bar'], crons: [] } },
    degraded: false,
  };
  const idx: IndexState = {
    repoId: 'r', status: 'full', filesIndexed: 1, filesSkipped: 0, durationMs: 1,
    lastIndexedSha: 's', indexerVersion: 2, updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    degraded: false,
  };

  it('unions 2-level reachable endpoints into the flat endpoints, deduped, and counts them', () => {
    // 'GET /bar' overlaps the caller-file endpoint (deduped); 'POST /deep' is
    // only reachable via the import-graph walk.
    const response = mapToBlastResponse(result, idx, ['GET /bar', 'POST /deep']);
    expect(response.endpoints).toEqual(['GET /bar', 'POST /deep']);
    expect(response.counts.endpoints).toBe(2);
  });

  it('is a no-op when reachableEndpoints is omitted (default [])', () => {
    const response = mapToBlastResponse(result, idx);
    expect(response.endpoints).toEqual(['GET /bar']);
  });
});

describe('mapToBlastResponse — degraded path', () => {
  const degradedResult: BlastResult = {
    changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
    callers: [],
    impactedEndpoints: ['GET /legacy'],
    degraded: true,
    reason: 'no_data',
  };

  const degradedIndexState: IndexState = {
    repoId: 'repo-2',
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

  const response = mapToBlastResponse(degradedResult, degradedIndexState);

  it('maps the synthesized degraded IndexState badge, including the epoch sentinel', () => {
    expect(response.index).toEqual({
      status: 'degraded',
      degraded: true,
      reason: 'no_data',
      files_indexed: 0,
      files_skipped: 0,
      last_indexed_sha: '',
      updated_at: new Date(0).toISOString(),
    });
  });

  it('leaves per-symbol endpoints/crons empty when factsByFile is absent', () => {
    expect(response.impacts).toEqual([
      { symbol: { name: 'doThing', file: FOO_FILE, kind: 'function' }, callers: [], endpoints: [], crons: [] },
    ]);
  });

  it('still populates the flat endpoints from impactedEndpoints, but crons stays empty', () => {
    expect(response.endpoints).toEqual(['GET /legacy']);
    expect(response.crons).toEqual([]);
  });

  it('computes counts on the degraded path', () => {
    expect(response.counts).toEqual({ symbols: 1, callers: 0, endpoints: 1, crons: 0 });
  });
});

describe('buildExplainMessages', () => {
  it('builds a system + user message pair summarizing each impact', () => {
    const response = mapToBlastResponse(
      {
        changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
        callers: [{ file: BAR_ROUTES, symbol: 'barHandler', viaSymbol: 'doThing', line: 10, rank: 1 }],
        impactedEndpoints: ['GET /bar'],
        factsByFile: { [BAR_ROUTES]: { endpoints: ['GET /bar'], crons: [] } },
        degraded: false,
      },
      {
        repoId: 'repo-1',
        status: 'full',
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 1,
        lastIndexedSha: 'sha',
        indexerVersion: 2,
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        degraded: false,
      },
    );

    const messages = buildExplainMessages(response);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    expect(messages[1]?.content).toContain('doThing');
    expect(messages[1]?.content).toContain('barHandler');
    expect(messages[1]?.content).toContain('GET /bar');
  });

  it('falls back to a "no downstream callers" body when impacts is empty', () => {
    const response = mapToBlastResponse(
      { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' },
      {
        repoId: 'repo-2',
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
      },
    );

    const messages = buildExplainMessages(response);
    expect(messages[1]?.content).toContain('No downstream callers');
  });
});
