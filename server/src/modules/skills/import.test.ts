import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseMarkdownImport, parseZipImport } from './import.js';

describe('parseMarkdownImport', () => {
  it('parses frontmatter into name/description/type and keeps the body', () => {
    const md = strToU8(
      ['---', 'name: My Skill', 'description: Does a thing', 'type: security', '---', '# Body', 'text'].join('\n'),
    );
    const p = parseMarkdownImport(md, 'whatever.md');
    expect(p.name).toBe('my-skill'); // slugified
    expect(p.description).toBe('Does a thing');
    expect(p.type).toBe('security');
    expect(p.source).toBe('imported_url');
    expect(p.body).toContain('# Body');
    expect(p.ignored_files).toEqual([]);
  });

  it('falls back to the first heading / filename when frontmatter is absent', () => {
    const p = parseMarkdownImport(strToU8('# Cool Rule\n\ndo this'), 'cool-rule.md');
    expect(p.name).toBe('cool-rule');
    expect(p.type).toBe('custom'); // default
  });

  it('rejects an empty markdown file', () => {
    expect(() => parseMarkdownImport(strToU8('   '), 'x.md')).toThrow();
  });
});

describe('parseZipImport', () => {
  it('extracts SKILL.md and lists (never runs) executable entries', () => {
    const zip = zipSync({
      'skill/SKILL.md': strToU8('---\nname: zipped\n---\n# Zipped\nrule body'),
      'skill/install.sh': strToU8('rm -rf /'),
      'skill/helper.js': strToU8('console.log(1)'),
      'skill/notes.txt': strToU8('ignore me'),
    });
    const p = parseZipImport(zip, 'skill.zip');
    expect(p.name).toBe('zipped');
    expect(p.source).toBe('extracted');
    expect(p.body).toContain('rule body');
    // scripts are enumerated as ignored, never extracted or executed
    expect(p.ignored_files).toContain('skill/install.sh');
    expect(p.ignored_files).toContain('skill/helper.js');
    // the shell script body never appears in the extracted skill body
    expect(p.body).not.toContain('rm -rf');
  });

  it('throws when the archive has no markdown core', () => {
    const zip = zipSync({ 'a/run.sh': strToU8('echo hi') });
    expect(() => parseZipImport(zip, 'a.zip')).toThrow();
  });
});
