import { describe, it, expect } from 'vitest';
import { buildExplainMessages, mapPriorPull, mapToBlastResponse } from './helpers.js';
import type { BlastResult, EndpointRefRow, IndexState } from '../repo-intel/types.js';

const FOO_FILE = 'server/src/modules/foo/service.ts';
const BAR_ROUTES = 'server/src/modules/bar/routes.ts';
const BAZ_SERVICE = 'server/src/modules/baz/service.ts';
const CRON_FILE = 'server/src/jobs/cron.ts';

const fullIndexState = (overrides: Partial<IndexState> = {}): IndexState => ({
  repoId: 'repo-1',
  status: 'full',
  filesIndexed: 120,
  filesSkipped: 3,
  durationMs: 5000,
  lastIndexedSha: 'abc123',
  indexerVersion: 2,
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  degraded: false,
  ...overrides,
});

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

  const response = mapToBlastResponse(persistentResult, fullIndexState());

  it('maps the index badge off IndexState, defaulting status to IndexState.status and missing_files to null', () => {
    expect(response.index).toEqual({
      status: 'full',
      degraded: false,
      reason: null,
      files_indexed: 120,
      files_skipped: 3,
      last_indexed_sha: 'abc123',
      updated_at: '2026-07-01T00:00:00.000Z',
      missing_files: null,
    });
  });

  it('defaults change_detection_mode to file-level when not passed', () => {
    expect(response.change_detection_mode).toBe('file-level');
  });

  it('carries changed_symbols through unchanged', () => {
    expect(response.changed_symbols).toEqual([
      { name: 'doThing', file: FOO_FILE, kind: 'function' },
      { name: 'doOther', file: FOO_FILE, kind: 'function' },
    ]);
  });

  it('groups callers by viaSymbol, preserving rank order and tagging relation', () => {
    const doThing = response.impacts.find((i) => i.symbol.name === 'doThing');
    expect(doThing?.callers).toEqual([
      { symbol: 'barHandler', file: BAR_ROUTES, line: 10, rank: 0.9, relation: 'references' },
      { symbol: 'bazHelper', file: BAZ_SERVICE, line: 20, rank: 0.5, relation: 'references' },
    ]);

    const doOther = response.impacts.find((i) => i.symbol.name === 'doOther');
    expect(doOther?.callers).toEqual([
      { symbol: 'runCron', file: CRON_FILE, line: 5, rank: 0.3, relation: 'references' },
    ]);
  });

  it('sets callers_total/callers_truncated for an under-cap symbol', () => {
    const doThing = response.impacts.find((i) => i.symbol.name === 'doThing');
    expect(doThing?.callers_total).toBe(2);
    expect(doThing?.callers_truncated).toBe(false);
  });

  it('attributes endpoints per symbol via source_symbols, crons via factsByFile of caller files', () => {
    const doThing = response.impacts.find((i) => i.symbol.name === 'doThing');
    expect(doThing?.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual(['GET /bar', 'POST /baz']);
    expect(doThing?.crons).toEqual(['nightly-sync']);

    const doOther = response.impacts.find((i) => i.symbol.name === 'doOther');
    expect(doOther?.endpoints).toEqual([]);
    expect(doOther?.crons).toEqual(['nightly-sync', 'hourly-poll']);
  });

  it('builds flat endpoints as BlastEndpointRef objects with location/source_symbols/depth, deduped', () => {
    expect(response.endpoints).toEqual([
      {
        method: 'GET',
        path: '/bar',
        location: { repository_path: BAR_ROUTES, line: null },
        source_symbols: ['doThing'],
        depth: 1,
      },
      {
        method: 'POST',
        path: '/baz',
        location: { repository_path: BAZ_SERVICE, line: null },
        source_symbols: ['doThing'],
        depth: 1,
      },
    ]);
  });

  it('computes flat crons as a deduped union', () => {
    expect(response.crons).toEqual(['nightly-sync', 'hourly-poll']);
  });

  it('computes counts (callers = unique rendered caller sites)', () => {
    expect(response.counts).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 2 });
  });

  it('defaults explanation to null', () => {
    expect(response.explanation).toBeNull();
  });
});

describe('mapToBlastResponse — step 2: per-symbol caller cap + total/truncated', () => {
  // 47 callers all reaching the SAME changed symbol — the facade (T4) no
  // longer caps globally, so the blast layer must clamp the RENDERED list to
  // 20 while still reporting the true pre-cap total.
  const manyCallers: BlastResult = {
    changedSymbols: [{ file: FOO_FILE, name: 'hot', kind: 'function' }],
    callers: Array.from({ length: 47 }, (_, i) => ({
      file: `caller-${i}.ts`,
      symbol: `fn${i}`,
      viaSymbol: 'hot',
      line: i + 1,
      rank: (47 - i) / 47, // already rank DESC
    })),
    impactedEndpoints: [],
    factsByFile: {},
    degraded: false,
  };

  const response = mapToBlastResponse(manyCallers, fullIndexState());
  const hot = response.impacts.find((i) => i.symbol.name === 'hot');

  it('renders only the top 20 (rank order preserved)', () => {
    expect(hot?.callers).toHaveLength(20);
    expect(hot?.callers[0]?.symbol).toBe('fn0'); // highest rank kept
    expect(hot?.callers.at(-1)?.symbol).toBe('fn19'); // 21st..47th dropped
  });

  it('reports the true pre-cap total and truncated flag', () => {
    expect(hot?.callers_total).toBe(47);
    expect(hot?.callers_truncated).toBe(true);
  });

  it('counts.callers reflects the 20 rendered, not the facade raw 47', () => {
    expect(response.counts.callers).toBe(20);
  });
});

describe('mapToBlastResponse — counts.callers dedups a caller reaching multiple symbols', () => {
  // The SAME call site (file/line/symbol) references two different changed
  // symbols (e.g. `doThing(); doOther();` on the line right after — modeled
  // here as literally the same line for the dedup key) — it must count as
  // ONE unique caller site, not two.
  const result: BlastResult = {
    changedSymbols: [
      { file: FOO_FILE, name: 'doThing', kind: 'function' },
      { file: FOO_FILE, name: 'doOther', kind: 'function' },
    ],
    callers: [
      { file: BAR_ROUTES, symbol: 'barHandler', viaSymbol: 'doThing', line: 10, rank: 0.9 },
      { file: BAR_ROUTES, symbol: 'barHandler', viaSymbol: 'doOther', line: 10, rank: 0.9 },
    ],
    impactedEndpoints: [],
    factsByFile: {},
    degraded: false,
  };

  it('counts the shared caller once', () => {
    const response = mapToBlastResponse(result, fullIndexState());
    expect(response.impacts.flatMap((i) => i.callers)).toHaveLength(2); // rendered once per impact
    expect(response.counts.callers).toBe(1); // but it's the same site
  });
});

describe('mapToBlastResponse — endpointRefs: dedup, min-depth, and unattributed endpoints dropped', () => {
  const result: BlastResult = {
    changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
    callers: [{ file: BAR_ROUTES, symbol: 'barHandler', viaSymbol: 'doThing', line: 10, rank: 0.9 }],
    // 'POST /ghost' has no location anywhere (neither factsByFile nor
    // endpointRefs) — simulates the fully-degraded/ripgrep path, which
    // can't attribute a file. It must be dropped, not fabricated.
    impactedEndpoints: ['GET /bar', 'POST /ghost'],
    factsByFile: { [BAR_ROUTES]: { endpoints: ['GET /bar'], crons: [] } },
    degraded: false,
  };
  const endpointRefs: EndpointRefRow[] = [
    // Same endpoint as factsByFile's (depth-1 guess), but the BFS found it
    // at depth 0 (declared directly in a changed file) — the more precise
    // BFS depth must win.
    { endpoint: 'GET /bar', file: FOO_FILE, depth: 0 },
    // Only reachable via the BFS (2-level import walk), not via any caller —
    // no changed symbol's file/caller-file matches it, so source_symbols
    // stays empty (honest "reachable but not attributable to one symbol").
    { endpoint: 'DELETE /deep', file: 'server/src/modules/deep/routes.ts', depth: 2 },
  ];

  const response = mapToBlastResponse(result, fullIndexState(), { endpointRefs });

  it('prefers the BFS min-depth location over the factsByFile guess', () => {
    const bar = response.endpoints.find((e) => e.path === '/bar');
    expect(bar).toEqual({
      method: 'GET',
      path: '/bar',
      location: { repository_path: FOO_FILE, line: null },
      source_symbols: ['doThing'], // FOO_FILE is doThing's own declared file
      depth: 0,
    });
  });

  it('includes a BFS-only endpoint with an empty source_symbols (not attributable)', () => {
    const deep = response.endpoints.find((e) => e.path === '/deep');
    expect(deep).toEqual({
      method: 'DELETE',
      path: '/deep',
      location: { repository_path: 'server/src/modules/deep/routes.ts', line: null },
      source_symbols: [],
      depth: 2,
    });
  });

  it('drops an endpoint with no resolvable location at all', () => {
    expect(response.endpoints.some((e) => e.path === '/ghost')).toBe(false);
    expect(response.counts.endpoints).toBe(2);
  });
});

describe('mapToBlastResponse — read-time junk-file filter (endpoints/crons)', () => {
  const TEST_FILE = 'server/src/modules/foo/service.test.ts';
  const MOCK_FILE = 'server/src/modules/foo/__mocks__/routes.ts';

  it('drops an endpoint found ONLY in a test/mock file (factsByFile source)', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
      callers: [{ file: TEST_FILE, symbol: 'itBlock', viaSymbol: 'doThing', line: 5, rank: 0.5 }],
      // A supertest-style mock in the test file that LOOKS like a route
      // registration — indexed as a fact, but must never surface as a real
      // endpoint.
      impactedEndpoints: ['GET /fake-mocked-route'],
      factsByFile: { [TEST_FILE]: { endpoints: ['GET /fake-mocked-route'], crons: [] } },
      degraded: false,
    };
    const response = mapToBlastResponse(result, fullIndexState());
    expect(response.endpoints).toEqual([]);
    expect(response.counts.endpoints).toBe(0);
  });

  it('drops a cron found ONLY in a junk file, both top-level and per-symbol', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
      callers: [{ file: MOCK_FILE, symbol: 'mockCaller', viaSymbol: 'doThing', line: 1, rank: 0.5 }],
      impactedEndpoints: [],
      factsByFile: { [MOCK_FILE]: { endpoints: [], crons: ['fake-mock-cron'] } },
      degraded: false,
    };
    const response = mapToBlastResponse(result, fullIndexState());
    expect(response.crons).toEqual([]);
    expect(response.impacts[0]?.crons).toEqual([]);
  });

  it('keeps a legit endpoint even when the SAME endpoint string also appears in a junk file', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
      callers: [
        { file: BAR_ROUTES, symbol: 'barHandler', viaSymbol: 'doThing', line: 10, rank: 0.9 },
        { file: TEST_FILE, symbol: 'itBlock', viaSymbol: 'doThing', line: 5, rank: 0.5 },
      ],
      impactedEndpoints: ['GET /bar'],
      factsByFile: {
        [BAR_ROUTES]: { endpoints: ['GET /bar'], crons: [] }, // real
        [TEST_FILE]: { endpoints: ['GET /bar'], crons: [] }, // also mocked in a test file
      },
      degraded: false,
    };
    const response = mapToBlastResponse(result, fullIndexState());
    expect(response.endpoints).toEqual([
      {
        method: 'GET',
        path: '/bar',
        location: { repository_path: BAR_ROUTES, line: null },
        source_symbols: ['doThing'],
        depth: 1,
      },
    ]);
  });

  it('drops a BFS-reachable endpoint whose reaching file is junk', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };
    const endpointRefs: EndpointRefRow[] = [
      { endpoint: 'GET /via-fixture', file: 'server/src/modules/foo/__fixtures__/app.ts', depth: 1 },
    ];
    const response = mapToBlastResponse(result, fullIndexState(), { endpointRefs });
    expect(response.endpoints).toEqual([]);
  });
});

describe('mapToBlastResponse — change_detection_mode / status / missing_files passthrough', () => {
  const result: BlastResult = {
    changedSymbols: [{ file: FOO_FILE, name: 'doThing', kind: 'function' }],
    callers: [],
    impactedEndpoints: [],
    factsByFile: {},
    degraded: false,
  };

  it('passes change_detection_mode through as line-level', () => {
    const response = mapToBlastResponse(result, fullIndexState(), {
      changeDetectionMode: 'line-level',
    });
    expect(response.change_detection_mode).toBe('line-level');
  });

  it('overrides index.status and carries missing_files', () => {
    const response = mapToBlastResponse(result, fullIndexState(), {
      status: 'partial',
      missingFiles: ['a.ts', 'b.ts'],
    });
    expect(response.index.status).toBe('partial');
    expect(response.index.missing_files).toEqual(['a.ts', 'b.ts']);
  });

  it('normalizes an empty missingFiles array to null', () => {
    const response = mapToBlastResponse(result, fullIndexState(), { missingFiles: [] });
    expect(response.index.missing_files).toBeNull();
  });

  it('defaults prior_pulls to [] when not passed, passes it through verbatim otherwise', () => {
    expect(mapToBlastResponse(result, fullIndexState()).prior_pulls).toEqual([]);

    const priorPulls = [
      { number: 1, title: 'Earlier PR', author: 'octocat', opened_at: '2026-06-01T00:00:00.000Z', url: 'https://github.com/acme/widgets/pull/1' },
    ];
    expect(mapToBlastResponse(result, fullIndexState(), { priorPulls }).prior_pulls).toEqual(priorPulls);
  });

  it('counts.endpoints always equals response.endpoints.length (the client renders exactly this many)', () => {
    const withEndpoints: BlastResult = {
      ...result,
      impactedEndpoints: ['GET /a', 'POST /b'],
      factsByFile: { [FOO_FILE]: { endpoints: ['GET /a', 'POST /b'], crons: [] } },
    };
    const response = mapToBlastResponse(withEndpoints, fullIndexState());
    expect(response.counts.endpoints).toBe(response.endpoints.length);
  });
});

describe('mapPriorPull', () => {
  it('maps a raw prior-PR row + repo full_name to the PriorPull contract shape', () => {
    expect(
      mapPriorPull(
        { number: 42, title: 'Refactor foo', author: 'octocat', openedAt: new Date('2026-06-01T00:00:00.000Z') },
        'acme/widgets',
      ),
    ).toEqual({
      number: 42,
      title: 'Refactor foo',
      author: 'octocat',
      opened_at: '2026-06-01T00:00:00.000Z',
      url: 'https://github.com/acme/widgets/pull/42',
    });
  });

  it('opened_at is null when openedAt is null', () => {
    expect(mapPriorPull({ number: 1, title: 't', author: 'a', openedAt: null }, 'acme/widgets').opened_at).toBeNull();
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

  const response = mapToBlastResponse(degradedResult, degradedIndexState, { status: 'unavailable' });

  it('maps the synthesized degraded IndexState badge, including the epoch sentinel, with the status override', () => {
    expect(response.index).toEqual({
      status: 'unavailable',
      degraded: true,
      reason: 'no_data',
      files_indexed: 0,
      files_skipped: 0,
      last_indexed_sha: '',
      updated_at: new Date(0).toISOString(),
      missing_files: null,
    });
  });

  it('drops the unattributed endpoint (no factsByFile, no endpointRefs) and leaves per-symbol endpoints/crons empty', () => {
    expect(response.impacts).toEqual([
      {
        symbol: { name: 'doThing', file: FOO_FILE, kind: 'function' },
        callers: [],
        callers_total: 0,
        callers_truncated: false,
        endpoints: [],
        crons: [],
      },
    ]);
    expect(response.endpoints).toEqual([]);
  });

  it('computes counts on the degraded path', () => {
    expect(response.counts).toEqual({ symbols: 1, callers: 0, endpoints: 0, crons: 0 });
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
      fullIndexState({ repoId: 'repo-1', filesIndexed: 1, filesSkipped: 0, durationMs: 1, lastIndexedSha: 'sha' }),
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
