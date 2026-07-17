import { describe, it, expect, vi } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import type { ReviewRepository, PullRow } from './repository.js';
import type * as schema from '../../db/schema.js';
import { loadDiff } from './diff-loader.js';

const PULL = {
  id: 'pr-1',
  number: 42,
  base: 'main',
  headSha: 'deadbeef',
} as unknown as PullRow;

const REPO_ROW = { owner: 'acme', name: 'widgets' } as unknown as typeof schema.repos.$inferSelect;

const NONEMPTY_DIFF: UnifiedDiff = {
  files: [{ path: 'src/a.ts', additions: 1, deletions: 0, hunks: [] }],
  raw: 'diff --git a/src/a.ts b/src/a.ts',
};

const EMPTY_DIFF: UnifiedDiff = { files: [], raw: '' };

function makeGit(overrides: {
  prepareReviewDiff?: () => Promise<void>;
  diff?: () => Promise<UnifiedDiff>;
}) {
  return {
    prepareReviewDiff: vi.fn(overrides.prepareReviewDiff ?? (async () => undefined)),
    diff: vi.fn(overrides.diff ?? (async () => EMPTY_DIFF)),
  };
}

function makeRepo(prFiles: { path: string; additions: number; deletions: number; patch: string | null }[]) {
  return {
    getPrFiles: vi.fn(async () => prFiles),
  } as unknown as ReviewRepository;
}

describe('loadDiff', () => {
  it('calls prepareReviewDiff with the base ref + PR number BEFORE diff, and returns the git diff when non-empty', async () => {
    const calls: string[] = [];
    const git = makeGit({
      prepareReviewDiff: async () => {
        calls.push('prepare');
      },
      diff: async () => {
        calls.push('diff');
        return NONEMPTY_DIFF;
      },
    });
    const container = { git } as unknown as Container;
    const repo = makeRepo([]);

    const result = await loadDiff(container, repo, 'ws1', PULL, REPO_ROW);

    expect(git.prepareReviewDiff).toHaveBeenCalledWith({ owner: 'acme', name: 'widgets' }, 'main', 42);
    expect(git.diff).toHaveBeenCalledWith({ owner: 'acme', name: 'widgets' }, 'main', 'deadbeef');
    expect(calls).toEqual(['prepare', 'diff']);
    expect(result).toBe(NONEMPTY_DIFF);
    expect(repo.getPrFiles).not.toHaveBeenCalled();
  });

  it('falls back to diffFromPrFiles when git.diff throws, and logs the error via the passed logger (no more silent catch{})', async () => {
    const diffError = new Error('bad revision deadbeef');
    const git = makeGit({
      diff: async () => {
        throw diffError;
      },
    });
    const container = { git } as unknown as Container;
    const repo = makeRepo([
      { path: 'src/b.ts', additions: 2, deletions: 0, patch: '@@ -1 +1,2 @@\n+line' },
    ]);
    const warn = vi.fn();
    const logger = { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() };

    const result = await loadDiff(container, repo, 'ws1', PULL, REPO_ROW, logger);

    expect(repo.getPrFiles).toHaveBeenCalledWith('pr-1');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe('src/b.ts');

    // The diff error must be surfaced through the logger, not swallowed.
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: diffError.message }),
      expect.stringContaining('git diff failed'),
    );
  });

  it('falls back to diffFromPrFiles when git.diff resolves empty', async () => {
    const git = makeGit({ diff: async () => EMPTY_DIFF });
    const container = { git } as unknown as Container;
    const repo = makeRepo([{ path: 'src/c.ts', additions: 1, deletions: 0, patch: '@@ -1 +1 @@\n+x' }]);

    const result = await loadDiff(container, repo, 'ws1', PULL, REPO_ROW);

    expect(repo.getPrFiles).toHaveBeenCalledWith('pr-1');
    expect(result.files[0]?.path).toBe('src/c.ts');
  });

  it('a prepareReviewDiff failure is non-fatal: still attempts git.diff and logs a warning', async () => {
    const prepareError = new Error('offline');
    const git = makeGit({
      prepareReviewDiff: async () => {
        throw prepareError;
      },
      diff: async () => NONEMPTY_DIFF,
    });
    const container = { git } as unknown as Container;
    const repo = makeRepo([]);
    const warn = vi.fn();
    const logger = { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() };

    const result = await loadDiff(container, repo, 'ws1', PULL, REPO_ROW, logger);

    expect(git.diff).toHaveBeenCalled();
    expect(result).toBe(NONEMPTY_DIFF);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: prepareError.message }),
      expect.stringContaining('prepareReviewDiff failed'),
    );
  });
});
