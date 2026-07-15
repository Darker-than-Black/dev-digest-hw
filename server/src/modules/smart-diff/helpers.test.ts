import { describe, it, expect } from 'vitest';
import {
  classifyFile,
  buildGroups,
  buildSplitSuggestion,
  composeSmartDiff,
  type SmartDiffInputFile,
  type SmartDiffInputFinding,
} from './helpers.js';
import { SPLIT_TOO_BIG_LINES } from './constants.js';

describe('classifyFile', () => {
  it('classifies a lock file as boilerplate', () => {
    expect(classifyFile('package-lock.json')).toBe('boilerplate');
  });

  it('classifies a barrel file as wiring', () => {
    expect(classifyFile('client/src/lib/hooks/index.ts')).toBe('wiring');
  });

  it('classifies a plain service file as core', () => {
    expect(classifyFile('server/src/modules/reviews/service.ts')).toBe('core');
  });

  it('is case-insensitive', () => {
    expect(classifyFile('Server/DIST/x.js')).toBe('boilerplate');
  });
});

describe('buildGroups', () => {
  it('always emits all three groups, even when a role has zero files', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'server/src/modules/reviews/service.ts', additions: 5, deletions: 1 },
    ];
    const groups = buildGroups(files, []);
    expect(groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(groups.find((g) => g.role === 'wiring')?.files).toEqual([]);
    expect(groups.find((g) => g.role === 'boilerplate')?.files).toEqual([]);
    expect(groups.find((g) => g.role === 'core')?.files).toHaveLength(1);
  });

  it('dedupes two findings on the same line into one finding_lines entry', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'server/src/modules/reviews/service.ts', additions: 5, deletions: 1 },
    ];
    const findings: SmartDiffInputFinding[] = [
      { file: 'server/src/modules/reviews/service.ts', start_line: 10 },
      { file: 'server/src/modules/reviews/service.ts', start_line: 10 },
    ];
    const groups = buildGroups(files, findings);
    const file = groups.find((g) => g.role === 'core')?.files[0];
    expect(file?.finding_lines).toEqual([10]);
  });

  it('drops findings whose file matches no PR file', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'server/src/modules/reviews/service.ts', additions: 5, deletions: 1 },
    ];
    const findings: SmartDiffInputFinding[] = [{ file: 'unrelated.ts', start_line: 1 }];
    const groups = buildGroups(files, findings);
    const file = groups.find((g) => g.role === 'core')?.files[0];
    expect(file?.finding_lines).toEqual([]);
  });

  it('keeps pseudocode_summary null always', () => {
    const files: SmartDiffInputFile[] = [{ path: 'a.ts', additions: 1, deletions: 0 }];
    const groups = buildGroups(files, []);
    const file = groups.find((g) => g.role === 'core')?.files[0];
    expect(file?.pseudocode_summary).toBeNull();
  });

  it('orders files risk-first (finding_lines desc), then churn desc, then path asc', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'server/a.ts', additions: 1, deletions: 0 }, // no findings, low churn
      { path: 'server/b.ts', additions: 100, deletions: 100 }, // no findings, high churn
      { path: 'server/c.ts', additions: 1, deletions: 0 }, // 1 finding
      { path: 'server/z.ts', additions: 1, deletions: 0 }, // 1 finding, tie on churn -> path asc
    ];
    const findings: SmartDiffInputFinding[] = [
      { file: 'server/c.ts', start_line: 1 },
      { file: 'server/z.ts', start_line: 1 },
    ];
    const groups = buildGroups(files, findings);
    const core = groups.find((g) => g.role === 'core')?.files ?? [];
    expect(core.map((f) => f.path)).toEqual(['server/c.ts', 'server/z.ts', 'server/b.ts', 'server/a.ts']);
  });
});

describe('buildSplitSuggestion', () => {
  it('too_big:false yields empty proposed_splits', () => {
    const files: SmartDiffInputFile[] = [{ path: 'server/a.ts', additions: 1, deletions: 1 }];
    const result = buildSplitSuggestion(files);
    expect(result.too_big).toBe(false);
    expect(result.proposed_splits).toEqual([]);
  });

  it('a large PR confined to one top-level segment is too_big with empty splits', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'server/a.ts', additions: SPLIT_TOO_BIG_LINES + 10, deletions: 0 },
    ];
    const result = buildSplitSuggestion(files);
    expect(result.too_big).toBe(true);
    expect(result.proposed_splits).toEqual([]);
  });

  it('proposes one split per top-level segment when >= SPLIT_MIN_SEGMENTS and too_big', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'server/a.ts', additions: SPLIT_TOO_BIG_LINES, deletions: 0 },
      { path: 'client/a.ts', additions: 1, deletions: 0 },
      { path: 'client/b.ts', additions: 1, deletions: 0 },
      { path: 'root.md', additions: 1, deletions: 0 }, // boilerplate, excluded
    ];
    const result = buildSplitSuggestion(files);
    expect(result.too_big).toBe(true);
    // client has 2 files, server has 1 -> client first (count desc)
    expect(result.proposed_splits).toEqual([
      { name: 'client', files: ['client/a.ts', 'client/b.ts'] },
      { name: 'server', files: ['server/a.ts'] },
    ]);
  });

  it('root-level files group under "root"', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'a.ts', additions: SPLIT_TOO_BIG_LINES, deletions: 0 },
      { path: 'server/a.ts', additions: 1, deletions: 0 },
    ];
    const result = buildSplitSuggestion(files);
    expect(result.proposed_splits.map((s) => s.name).sort()).toEqual(['root', 'server']);
  });
});

describe('composeSmartDiff', () => {
  it('composes groups + split_suggestion', () => {
    const files: SmartDiffInputFile[] = [{ path: 'a.ts', additions: 1, deletions: 0 }];
    const result = composeSmartDiff(files, []);
    expect(result.groups).toHaveLength(3);
    expect(result.split_suggestion.too_big).toBe(false);
  });
});
