import { unzipSync } from 'fflate';
import { SkillType, type SkillImportPreview, type SkillType as SkillTypeT } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  DEFAULT_SKILL_TYPE,
  MAX_ZIP_DECOMPRESSED_BYTES,
  MAX_ZIP_ENTRIES,
} from './constants.js';

/**
 * Skill import parsing — TEXT ONLY. We read markdown out of an uploaded `.md`
 * file or `.zip` archive and NEVER execute anything: archive scripts/binaries
 * are enumerated into `ignored_files` and dropped, never written to disk or run.
 * Nothing here persists — the caller shows the preview and only saves on confirm.
 */

/** Archive entries we treat as executable/binary — extracted core is text only. */
const EXECUTABLE_EXT =
  /\.(sh|bash|zsh|bat|cmd|ps1|js|mjs|cjs|ts|py|rb|pl|php|exe|dll|so|dylib|bin|o|a|jar|wasm)$/i;

const decoder = new TextDecoder('utf-8', { fatal: false });

function toSlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/\.[^.]+$/, '') // strip extension
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'imported-skill';
}

/** Parse `--- key: value --- body` frontmatter (a small YAML subset). */
function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: match[2]!.trimStart() };
}

/** First `# H1` in the body, used as a name fallback. */
function firstHeading(body: string): string | undefined {
  const m = /^#\s+(.+)$/m.exec(body);
  return m?.[1]?.trim();
}

function coerceType(raw: string | undefined): SkillTypeT {
  const parsed = SkillType.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SKILL_TYPE;
}

/** Build a preview from a single markdown document. */
function previewFromMarkdown(
  text: string,
  fallbackName: string,
  source: SkillImportPreview['source'],
  ignored: string[],
): SkillImportPreview {
  const { meta, body } = parseFrontmatter(text);
  const name = toSlug(meta.name ?? meta.slug ?? firstHeading(body) ?? fallbackName);
  return {
    name,
    description: meta.description ?? meta.desc ?? firstHeading(body) ?? name,
    type: coerceType(meta.type),
    source,
    body: body.trim(),
    ignored_files: ignored,
  };
}

/** Parse an uploaded `.md` document (source = imported_url). */
export function parseMarkdownImport(buf: Uint8Array, filename: string): SkillImportPreview {
  const text = decoder.decode(buf);
  if (!text.trim()) throw new ValidationError('The markdown file is empty');
  return previewFromMarkdown(text, toSlug(filename), 'imported_url', []);
}

/**
 * Parse an uploaded `.zip` (source = extracted). Reads entries in-memory, picks
 * the skill core (`SKILL.md`, else the first `*.md`), and lists every skipped
 * executable/binary entry in `ignored_files`. Enforces entry-count and
 * decompressed-size caps (zip-bomb guard).
 */
export function parseZipImport(buf: Uint8Array, filename: string): SkillImportPreview {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buf);
  } catch {
    throw new ValidationError('Could not read the archive — is it a valid .zip?');
  }

  const names = Object.keys(entries);
  if (names.length > MAX_ZIP_ENTRIES) {
    throw new ValidationError(`Archive has too many entries (>${MAX_ZIP_ENTRIES})`);
  }

  const ignored: string[] = [];
  const markdown: { path: string; data: Uint8Array }[] = [];
  let totalBytes = 0;

  for (const name of names) {
    const data = entries[name]!;
    // Directory entries (fflate yields a zero-length entry for dir paths).
    if (name.endsWith('/')) continue;
    // Path-traversal guard — never trust archive paths.
    if (name.includes('..') || name.startsWith('/')) {
      ignored.push(name);
      continue;
    }
    totalBytes += data.length;
    if (totalBytes > MAX_ZIP_DECOMPRESSED_BYTES) {
      throw new ValidationError('Archive is too large when decompressed');
    }
    if (EXECUTABLE_EXT.test(name)) {
      ignored.push(name); // never extracted, never run
      continue;
    }
    if (/\.md$/i.test(name)) markdown.push({ path: name, data });
    else ignored.push(name); // non-markdown assets are not part of the core
  }

  if (markdown.length === 0) {
    throw new ValidationError('No markdown (.md) skill body found in the archive');
  }

  // Prefer a SKILL.md at any depth; else the shallowest / first markdown file.
  const core =
    markdown.find((m) => /(^|\/)SKILL\.md$/i.test(m.path)) ??
    markdown.sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0]!;

  const fallbackName = toSlug(core.path.split('/').pop() ?? filename);
  return previewFromMarkdown(decoder.decode(core.data), fallbackName, 'extracted', ignored.sort());
}
