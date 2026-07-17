import { describe, it, expect } from 'vitest';
import { detectFileChange, parseChangedLines } from './diff.js';

describe('parseChangedLines', () => {
  it('parses a single hunk header into a new-side range', () => {
    const patch = ['@@ -10,3 +12,5 @@ function foo() {', ' context', '+added', '+added2'].join(
      '\n',
    );
    expect(parseChangedLines(patch)).toEqual([{ startLine: 12, endLine: 16 }]);
  });

  it('parses multiple hunks in one patch', () => {
    const patch = [
      '@@ -1,2 +1,2 @@',
      ' a',
      '-b',
      '+b2',
      '@@ -20,1 +20,4 @@',
      '+x',
      '+y',
      '+z',
    ].join('\n');
    expect(parseChangedLines(patch)).toEqual([
      { startLine: 1, endLine: 2 },
      { startLine: 20, endLine: 23 },
    ]);
  });

  it('defaults an omitted hunk count to 1 (single-line hunk)', () => {
    const patch = '@@ -5 +5 @@\n-old\n+new';
    expect(parseChangedLines(patch)).toEqual([{ startLine: 5, endLine: 5 }]);
  });

  it('skips a hunk whose new-side count is 0 (pure deletion)', () => {
    const patch = '@@ -5,3 +5,0 @@\n-a\n-b\n-c';
    expect(parseChangedLines(patch)).toEqual([]);
  });

  it('returns [] for null, empty, or hunk-less patches', () => {
    expect(parseChangedLines(null)).toEqual([]);
    expect(parseChangedLines('')).toEqual([]);
    expect(parseChangedLines('just some text, no hunk header')).toEqual([]);
  });
});

describe('detectFileChange', () => {
  it('detects a deleted file via "+++ /dev/null"', () => {
    const patch = ['diff --git a/foo.ts b/foo.ts', '--- a/foo.ts', '+++ /dev/null'].join('\n');
    expect(detectFileChange(patch)).toEqual({ deleted: true, renamed: false });
  });

  it('detects a deleted file via "deleted file mode"', () => {
    const patch = ['diff --git a/foo.ts b/foo.ts', 'deleted file mode 100644'].join('\n');
    expect(detectFileChange(patch)).toEqual({ deleted: true, renamed: false });
  });

  it('detects a renamed file via "rename from"/"rename to"', () => {
    const patch = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 100%',
      'rename from old.ts',
      'rename to new.ts',
    ].join('\n');
    expect(detectFileChange(patch)).toEqual({ deleted: false, renamed: true });
  });

  it('is false/false for an ordinary modification patch', () => {
    const patch = '@@ -1,1 +1,1 @@\n-old\n+new';
    expect(detectFileChange(patch)).toEqual({ deleted: false, renamed: false });
  });

  it('is false/false for a null patch', () => {
    expect(detectFileChange(null)).toEqual({ deleted: false, renamed: false });
  });
});
