import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoBasics } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * T1.4 — Facade degraded contract (acceptance #10).
 *
 * When `repoIntelEnabled=false` (opt-out; the default is now ON), every facade
 * method MUST return a safe degraded value WITHOUT throwing. Consumers (run-executor,
 * blast, hooks) downgrade to their pre-T1.3 behavior on these returns; if any
 * method threw or returned malformed shape, every consumer would crash.
 *
 * No Postgres, no clone. The service's `repo` (RepoIntelRepository) is patched
 * to return null/[] so we exercise the degraded paths cleanly.
 */

function buildDegradedService(opts: {
  flag: boolean;
  basics?: RepoBasics | null;
  indexStateRow?: IndexState | null;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    // codeIndex is reached by getBlastRadius; we stub minimal behaviour.
    codeIndex: {
      symbols: async () => [],
      references: async () => [],
    } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => opts.basics ?? null,
    tryGetIndexState: async () => opts.indexStateRow ?? null,
    getCachedSymbols: async () => [],
    getCachedSymbolsForFiles: async () => [],
    getCachedReferencesTo: async () => [],
    getEdges: async () => [],
    getFileFacts: async () => [],
  };
  return svc;
}

describe('RepoIntel facade — degraded contract (flag off)', () => {
  it('getUnresolvedReferences → [] when repoIntelEnabled=false', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures → [] when repoIntelEnabled=false', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getBlastRadius → degraded-but-valid shape (never throws)', async () => {
    const svc = buildDegradedService({ flag: false, basics: null });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    // Shape (every key present, arrays where arrays go) — consumers assume this.
    expect(Array.isArray(blast.changedSymbols)).toBe(true);
    expect(Array.isArray(blast.callers)).toBe(true);
    expect(Array.isArray(blast.impactedEndpoints)).toBe(true);
    expect(blast.degraded).toBe(true);
    // reason is one of the documented DegradedReason values
    expect(['flag_off', 'no_data', 'index_failed', 'index_partial', 'repo_too_large'])
      .toContain(blast.reason);
  });

  it('getIndexState → degraded row (never throws) when no row exists', async () => {
    const svc = buildDegradedService({ flag: false, indexStateRow: null });
    const state = await svc.getIndexState('r1');
    // Always-present fields the UI / dashboard rely on (client bind).
    expect(state.repoId).toBe('r1');
    expect(state.status).toBe('degraded');
    expect(state.filesIndexed).toBe(0);
    expect(state.filesSkipped).toBe(0);
    expect(state.lastIndexedSha).toBe(''); // empty string, not undefined — JSON-safe
    expect(state.indexerVersion).toBeGreaterThanOrEqual(1);
    expect(state.updatedAt instanceof Date).toBe(true);
    expect(state.degraded).toBe(true);
  });

  it('getRepoMap → degraded ({ text:"", tokens:0, cached:false, degraded:true })', async () => {
    const svc = buildDegradedService({ flag: false });
    const map = await svc.getRepoMap('r1');
    expect(map.text).toBe('');
    expect(map.tokens).toBe(0);
    expect(map.cached).toBe(false);
    expect(map.degraded).toBe(true);
  });

  it('getFileRank / getSymbolsInFiles / getConventionSamples / getTopFilesByRank / getCriticalPaths → []', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getFileRank('r1', ['a.ts'])).resolves.toEqual([]);
    await expect(svc.getSymbolsInFiles('r1', ['a.ts'])).resolves.toEqual([]);
    await expect(svc.getConventionSamples('r1', 12)).resolves.toEqual([]);
    await expect(svc.getTopFilesByRank('r1', 7)).resolves.toEqual([]);
    await expect(svc.getCriticalPaths('r1')).resolves.toEqual([]);
    await expect(svc.getReachableEndpoints('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('indexRepo / refreshIndex → degraded T1 skeleton (never throws)', async () => {
    const svc = buildDegradedService({ flag: false });
    const a = await svc.indexRepo('r1');
    const b = await svc.refreshIndex('r1');
    expect(a.status).toBe('degraded');
    expect(b.status).toBe('degraded');
    expect(a.filesIndexed).toBe(0);
    expect(b.filesIndexed).toBe(0);
  });
});

describe('RepoIntel facade — degraded contract (flag on, but no data)', () => {
  it('getCallerSignatures with no clone → [] (graceful degrade, no throw)', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: null } });
    await expect(svc.getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getUnresolvedReferences with no clone → []', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: null } });
    await expect(svc.getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures with empty changedFiles → []', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: '/tmp' } });
    await expect(svc.getCallerSignatures('r1', [])).resolves.toEqual([]);
  });
});

describe('RepoIntel facade — getReachableEndpoints (2-level import-graph walk)', () => {
  // util.ts ← service.ts ← routes.ts ← app.ts  (`from imports to`, so the
  // dependents chain walks the reverse edge). From the changed util.ts:
  // hop 1 = service.ts, hop 2 = routes.ts, hop 3 = app.ts.
  const edges = [
    { fromFile: 'service.ts', toFile: 'util.ts' },
    { fromFile: 'routes.ts', toFile: 'service.ts' },
    { fromFile: 'app.ts', toFile: 'routes.ts' },
  ];
  const facts = [
    { filePath: 'util.ts', endpoints: ['DIRECT /util'], crons: [] },
    { filePath: 'service.ts', endpoints: [], crons: [] },
    { filePath: 'routes.ts', endpoints: ['GET /api'], crons: [] },
    { filePath: 'app.ts', endpoints: ['GET /app'], crons: [] },
  ];

  function buildGraphService(): RepoIntelService {
    const container = { config: { repoIntelEnabled: true }, db: {} as never } as never;
    const svc = new RepoIntelService(container);
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      getEdges: async () => edges,
      getFileFacts: async (_r: string, files: string[]) =>
        facts.filter((f) => files.includes(f.filePath)),
    };
    return svc;
  }

  it('collects endpoints of the changed file + dependents up to 2 hops, excluding hop 3', async () => {
    const svc = buildGraphService();
    // util.ts (self) + service.ts (hop1, no endpoints) + routes.ts (hop2).
    // app.ts is hop 3 → its `GET /app` is NOT reachable at the default depth.
    await expect(svc.getReachableEndpoints('r1', ['util.ts'])).resolves.toEqual([
      'DIRECT /util',
      'GET /api',
    ]);
  });

  it('honors a custom depth — depth 3 reaches app.ts', async () => {
    const svc = buildGraphService();
    await expect(svc.getReachableEndpoints('r1', ['util.ts'], 3)).resolves.toEqual([
      'DIRECT /util',
      'GET /api',
      'GET /app',
    ]);
  });

  it('empty changedFiles → [] (no walk)', async () => {
    const svc = buildGraphService();
    await expect(svc.getReachableEndpoints('r1', [])).resolves.toEqual([]);
  });
});

describe('RepoIntel facade — getReachableEndpointRefs (min-depth + source file, blast T4)', () => {
  // Same fixture as getReachableEndpoints above: util.ts ← service.ts ←
  // routes.ts ← app.ts. From changed util.ts: hop 1 = service.ts,
  // hop 2 = routes.ts, hop 3 = app.ts.
  const edges = [
    { fromFile: 'service.ts', toFile: 'util.ts' },
    { fromFile: 'routes.ts', toFile: 'service.ts' },
    { fromFile: 'app.ts', toFile: 'routes.ts' },
  ];
  const facts = [
    { filePath: 'util.ts', endpoints: ['DIRECT /util'], crons: [] },
    { filePath: 'service.ts', endpoints: [], crons: [] },
    { filePath: 'routes.ts', endpoints: ['GET /api'], crons: [] },
    { filePath: 'app.ts', endpoints: ['GET /app'], crons: [] },
  ];

  function buildGraphService(edgeRows = edges, factRows = facts): RepoIntelService {
    const container = { config: { repoIntelEnabled: true }, db: {} as never } as never;
    const svc = new RepoIntelService(container);
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      getEdges: async () => edgeRows,
      getFileFacts: async (_r: string, files: string[]) =>
        factRows.filter((f) => files.includes(f.filePath)),
    };
    return svc;
  }

  it('25.7 — records min hop-depth + source file, excluding an endpoint only reachable at depth 3', async () => {
    const svc = buildGraphService();
    // util.ts is the changed file itself → depth 0. service.ts (hop 1) has no
    // endpoints. routes.ts (hop 2) → 'GET /api' at depth 2. app.ts is hop 3 →
    // 'GET /app' is NOT reachable at the default depth (BFS_DEPTH = 2).
    await expect(svc.getReachableEndpointRefs('r1', ['util.ts'])).resolves.toEqual([
      { endpoint: 'DIRECT /util', file: 'util.ts', depth: 0 },
      { endpoint: 'GET /api', file: 'routes.ts', depth: 2 },
    ]);
  });

  it('honors a custom depth — depth 3 reaches app.ts at depth 3', async () => {
    const svc = buildGraphService();
    await expect(svc.getReachableEndpointRefs('r1', ['util.ts'], 3)).resolves.toEqual([
      { endpoint: 'DIRECT /util', file: 'util.ts', depth: 0 },
      { endpoint: 'GET /api', file: 'routes.ts', depth: 2 },
      { endpoint: 'GET /app', file: 'app.ts', depth: 3 },
    ]);
  });

  it('25.8 — a cyclic edge does not infinite-loop; each file visited once at its first (min) depth', async () => {
    // a.ts ← b.ts ← c.ts ← a.ts (cycle) — b.ts is also directly reachable
    // from the changed a.ts, and c.ts loops back to a.ts.
    const cyclicEdges = [
      { fromFile: 'b.ts', toFile: 'a.ts' },
      { fromFile: 'c.ts', toFile: 'b.ts' },
      { fromFile: 'a.ts', toFile: 'c.ts' }, // cycle back to the changed file
    ];
    const cyclicFacts = [
      { filePath: 'a.ts', endpoints: ['GET /a'], crons: [] },
      { filePath: 'b.ts', endpoints: ['GET /b'], crons: [] },
      { filePath: 'c.ts', endpoints: ['GET /c'], crons: [] },
    ];
    const svc = buildGraphService(cyclicEdges, cyclicFacts);
    // Must terminate (no infinite loop) and each file appears once, at its
    // first-reached (min) depth: a.ts=0 (changed), b.ts=1, c.ts=2.
    await expect(svc.getReachableEndpointRefs('r1', ['a.ts'], 5)).resolves.toEqual([
      { endpoint: 'GET /a', file: 'a.ts', depth: 0 },
      { endpoint: 'GET /b', file: 'b.ts', depth: 1 },
      { endpoint: 'GET /c', file: 'c.ts', depth: 2 },
    ]);
  });

  it('empty changedFiles → [] (no walk)', async () => {
    const svc = buildGraphService();
    await expect(svc.getReachableEndpointRefs('r1', [])).resolves.toEqual([]);
  });

  it('repoIntelEnabled=false → [] (degraded contract)', async () => {
    const container = { config: { repoIntelEnabled: false }, db: {} as never } as never;
    const svc = new RepoIntelService(container);
    await expect(svc.getReachableEndpointRefs('r1', ['util.ts'])).resolves.toEqual([]);
  });
});
