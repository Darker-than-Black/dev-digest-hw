import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { getPriorPullsForFiles } from '../src/modules/reviews/repository/pull.repo.js';
import * as t from '../src/db/schema.js';

/**
 * `getPriorPullsForFiles` — the "prior PRs touching these files" query
 * (`modules/blast/service.ts`). Security-relevant (workspace + repo
 * isolation), so verified against real Postgres rather than a fake repo —
 * see `blast/service.test.ts` for the hermetic call-args coverage.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

let seq = 0;

d('getPriorPullsForFiles (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];

  // Seeded once in `beforeAll` — see the fixture map built below.
  let wsA: string;
  let wsB: string;
  let repoA1: string;
  let repoA2: string; // sibling repo, SAME workspace as repoA1
  let prCurrent: string; // the "current" PR in repoA1 — must be excluded
  let prSameRepoOverlap: string; // repoA1, overlaps on 2 files — dedup + primary match
  let prSameRepoNoOverlap: string; // repoA1, no overlapping file — must NOT be returned
  let prSiblingRepoOverlap: string; // repoA2 (same workspace), overlaps — must NOT be returned
  let prOtherWorkspaceOverlap: string; // wsB, overlaps — must NOT be returned
  let prNullOpenedAt: string; // repoA1, overlaps, opened_at IS NULL — must sort LAST
  let prOlder: string; // repoA1, overlaps, opened_at older than prSameRepoOverlap

  const OVERLAP_FILE = 'src/service.ts';
  const OTHER_OVERLAP_FILE = 'src/helpers.ts';

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;

    const [a] = await db.insert(t.workspaces).values({ name: 'ws-a' }).returning();
    const [b] = await db.insert(t.workspaces).values({ name: 'ws-b' }).returning();
    wsA = a!.id;
    wsB = b!.id;

    async function makeRepo(workspaceId: string) {
      const name = `repo-${seq++}`;
      const [row] = await db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
        .returning();
      return row!.id;
    }
    repoA1 = await makeRepo(wsA);
    repoA2 = await makeRepo(wsA);
    const repoB1 = await makeRepo(wsB);

    async function makePr(
      workspaceId: string,
      repoId: string,
      number: number,
      openedAt: Date | null,
    ) {
      const [row] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId,
          number,
          title: `PR #${number}`,
          author: 'octocat',
          branch: `feat/${number}`,
          base: 'main',
          headSha: `sha-${number}`,
          openedAt: openedAt ?? undefined,
        })
        .returning();
      return row!.id;
    }

    prCurrent = await makePr(wsA, repoA1, 1, new Date('2026-07-01T00:00:00.000Z'));
    prSameRepoOverlap = await makePr(wsA, repoA1, 2, new Date('2026-07-10T00:00:00.000Z'));
    prSameRepoNoOverlap = await makePr(wsA, repoA1, 3, new Date('2026-07-11T00:00:00.000Z'));
    prSiblingRepoOverlap = await makePr(wsA, repoA2, 4, new Date('2026-07-12T00:00:00.000Z'));
    prOtherWorkspaceOverlap = await makePr(wsB, repoB1, 5, new Date('2026-07-13T00:00:00.000Z'));
    prNullOpenedAt = await makePr(wsA, repoA1, 6, null);
    prOlder = await makePr(wsA, repoA1, 7, new Date('2026-06-01T00:00:00.000Z'));

    async function addFiles(prId: string, paths: string[]) {
      await db.insert(t.prFiles).values(paths.map((path) => ({ prId, path })));
    }

    await addFiles(prCurrent, [OVERLAP_FILE]);
    // (d) matches on TWO overlapping files — must still dedup to ONE row.
    await addFiles(prSameRepoOverlap, [OVERLAP_FILE, OTHER_OVERLAP_FILE]);
    await addFiles(prSameRepoNoOverlap, ['src/unrelated.ts']);
    await addFiles(prSiblingRepoOverlap, [OVERLAP_FILE]);
    await addFiles(prOtherWorkspaceOverlap, [OVERLAP_FILE]);
    await addFiles(prNullOpenedAt, [OVERLAP_FILE]);
    await addFiles(prOlder, [OVERLAP_FILE]);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('(a) workspace isolation — a PR in another workspace with an overlapping path is not returned', async () => {
    const rows = await getPriorPullsForFiles(db, wsA, repoA1, prCurrent, [OVERLAP_FILE], 10);
    expect(rows.some((r) => r.number === 5)).toBe(false); // prOtherWorkspaceOverlap
  });

  it('(b) repo isolation — a PR in a sibling repo of the SAME workspace with an overlapping path is not returned', async () => {
    const rows = await getPriorPullsForFiles(db, wsA, repoA1, prCurrent, [OVERLAP_FILE], 10);
    expect(rows.some((r) => r.number === 4)).toBe(false); // prSiblingRepoOverlap
  });

  it('(c) the current PR (excludePrId) is excluded even though it overlaps', async () => {
    const rows = await getPriorPullsForFiles(db, wsA, repoA1, prCurrent, [OVERLAP_FILE], 10);
    expect(rows.some((r) => r.number === 1)).toBe(false); // prCurrent
  });

  it('(d) path-overlap match works, and a PR matching on multiple files dedups to ONE row', async () => {
    const rows = await getPriorPullsForFiles(db, wsA, repoA1, prCurrent, [OVERLAP_FILE], 10);
    const matches = rows.filter((r) => r.number === 2); // prSameRepoOverlap
    expect(matches).toHaveLength(1);
    // A PR with no overlapping file never appears.
    expect(rows.some((r) => r.number === 3)).toBe(false); // prSameRepoNoOverlap
  });

  it('(e) ordering: opened_at DESC NULLS LAST, tiebroken by number DESC — the null-opened_at row sorts last', async () => {
    const rows = await getPriorPullsForFiles(db, wsA, repoA1, prCurrent, [OVERLAP_FILE], 10);
    // repoA1 survivors (excludes prCurrent #1 and the never-overlapping #3):
    // #2 opened 07-10, #7 opened 06-01, #6 opened_at IS NULL. Newest first,
    // null strictly last — NOT Postgres's default `DESC` = `NULLS FIRST`.
    expect(rows.map((r) => r.number)).toEqual([2, 7, 6]);
  });

  it('respects the limit', async () => {
    const rows = await getPriorPullsForFiles(db, wsA, repoA1, prCurrent, [OVERLAP_FILE], 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.number).toBe(2); // newest first (prSameRepoOverlap, opened 07-10)
  });

  it('[] on an empty filePaths list (no I/O)', async () => {
    const rows = await getPriorPullsForFiles(db, wsA, repoA1, prCurrent, [], 10);
    expect(rows).toEqual([]);
  });
});
