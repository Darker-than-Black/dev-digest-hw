import { describe, it, expect } from 'vitest';
import type { Container } from '../../platform/container.js';
import { SmartDiffService } from './service.js';

type ReviewsForPullRow = {
  review: { kind: 'review' | 'summary'; createdAt?: string };
  findings: { file: string; startLine: number }[];
};

/** Minimal fake `reviewRepo` — only the three reads `SmartDiffService` uses. */
function makeContainer(opts: {
  pull: unknown | undefined;
  prFiles: { path: string; additions: number; deletions: number }[];
  rows: ReviewsForPullRow[];
}): Container {
  const fake = {
    reviewRepo: {
      getPull: async (_workspaceId: string, _prId: string) => opts.pull,
      getPrFiles: async (_prId: string) => opts.prFiles,
      reviewsForPull: async (_prId: string) => opts.rows,
    },
  };
  return fake as unknown as Container;
}

describe('SmartDiffService.getSmartDiff', () => {
  it('throws NotFoundError for an unknown/other-workspace prId before reading files or reviews', async () => {
    let getPrFilesCalled = false;
    let reviewsForPullCalled = false;
    const fake = {
      reviewRepo: {
        getPull: async () => undefined,
        getPrFiles: async () => {
          getPrFilesCalled = true;
          return [];
        },
        reviewsForPull: async () => {
          reviewsForPullCalled = true;
          return [];
        },
      },
    } as unknown as Container;

    const service = new SmartDiffService(fake);
    await expect(service.getSmartDiff('ws1', 'unknown-pr')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(getPrFilesCalled).toBe(false);
    expect(reviewsForPullCalled).toBe(false);
  });

  it('PR with files and no reviews -> all three groups, every finding_lines empty', async () => {
    const container = makeContainer({
      pull: { id: 'pr1' },
      prFiles: [
        { path: 'server/src/modules/reviews/service.ts', additions: 5, deletions: 1 },
        { path: 'package-lock.json', additions: 100, deletions: 0 },
      ],
      rows: [],
    });
    const service = new SmartDiffService(container);
    const result = await service.getSmartDiff('ws1', 'pr1');

    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }
    const totalFiles = result.groups.reduce((n, g) => n + g.files.length, 0);
    expect(totalFiles).toBe(2);
  });

  it('EVERY review run contributes to finding_lines, not just the newest', async () => {
    const container = makeContainer({
      pull: { id: 'pr1' },
      prFiles: [{ path: 'server/a.ts', additions: 1, deletions: 0 }],
      rows: [
        // newest first (as reviewsForPull guarantees)
        {
          review: { kind: 'review' },
          findings: [{ file: 'server/a.ts', startLine: 42 }],
        },
        {
          review: { kind: 'review' },
          findings: [{ file: 'server/a.ts', startLine: 7 }],
        },
      ],
    });
    const service = new SmartDiffService(container);
    const result = await service.getSmartDiff('ws1', 'pr1');
    const file = result.groups.find((g) => g.role === 'core')?.files[0];
    expect(file?.finding_lines).toEqual([7, 42]);
  });

  it('regression: an older run\'s findings survive a newer run that found nothing', async () => {
    // The real multi-agent shape that broke this: five agents each write
    // their own kind:'review' row, and the newest one (API Contract
    // Reviewer) found nothing — which used to blank the whole overlay and
    // hide the Security Reviewer's blocker.
    const container = makeContainer({
      pull: { id: 'pr1' },
      prFiles: [{ path: 'server/a.ts', additions: 1, deletions: 0 }],
      rows: [
        { review: { kind: 'review' }, findings: [] }, // newest: found nothing
        { review: { kind: 'review' }, findings: [{ file: 'server/a.ts', startLine: 51 }] },
      ],
    });
    const service = new SmartDiffService(container);
    const result = await service.getSmartDiff('ws1', 'pr1');
    const file = result.groups.find((g) => g.role === 'core')?.files[0];
    expect(file?.finding_lines).toEqual([51]);
  });

  it('kind:"summary" rows are skipped, however new', async () => {
    const container = makeContainer({
      pull: { id: 'pr1' },
      prFiles: [{ path: 'server/a.ts', additions: 1, deletions: 0 }],
      rows: [
        // newest first: a summary row on top, then the review row
        { review: { kind: 'summary' }, findings: [{ file: 'server/a.ts', startLine: 999 }] },
        { review: { kind: 'review' }, findings: [{ file: 'server/a.ts', startLine: 13 }] },
      ],
    });
    const service = new SmartDiffService(container);
    const result = await service.getSmartDiff('ws1', 'pr1');
    const file = result.groups.find((g) => g.role === 'core')?.files[0];
    expect(file?.finding_lines).toEqual([13]);
  });
});
