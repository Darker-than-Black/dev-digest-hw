import type { Container } from '../../platform/container.js';
import type { Skill, SkillImportPreview, SkillType, SkillVersion } from '@devdigest/shared';
import { ConflictError, ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { DEFAULT_SKILL_SOURCE, DEFAULT_SKILL_TYPE } from './constants.js';
import { parseMarkdownImport, parseZipImport } from './import.js';

/**
 * Skills service. Business logic for the Skills Lab page + Skill editor. A skill
 * is text-only (name/description/type + a markdown body) with no tools or
 * external actions. Body changes are versioned via `skill_versions` (repository).
 */

export { toSkillDto } from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description?: string;
  type?: SkillType;
  source?: Skill['source'];
  body?: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description ?? '',
      type: input.type ?? DEFAULT_SKILL_TYPE,
      source: input.source ?? DEFAULT_SKILL_SOURCE,
      body: input.body ?? '',
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    // Renames must keep the slug unique within the workspace.
    if (patch.name !== undefined) await this.assertNameFree(workspaceId, patch.name, id);
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /** Body-snapshot history for a skill, newest first. Undefined → skill 404. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(id, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /** Restore an old body as a new current version. Undefined → skill/version 404. */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restoreVersion(workspaceId, id, version);
    return row ? toSkillDto(row) : undefined;
  }

  // ---- import (text-only; nothing here executes archive contents) ----------

  /** Parse an uploaded `.md`/`.zip` into a preview. Persists nothing. */
  parseImport(filename: string, buf: Uint8Array): SkillImportPreview {
    if (/\.zip$/i.test(filename)) return parseZipImport(buf, filename);
    if (/\.(md|markdown|txt)$/i.test(filename)) return parseMarkdownImport(buf, filename);
    throw new ValidationError('Only .md or .zip files can be imported');
  }

  /** Persist a previously-previewed skill, de-duplicating the slug on collision. */
  async confirmImport(
    workspaceId: string,
    preview: SkillImportPreview,
  ): Promise<Skill> {
    const name = await this.freeName(workspaceId, preview.name);
    const row = await this.repo.insert({
      workspaceId,
      name,
      description: preview.description,
      type: preview.type,
      source: preview.source,
      body: preview.body,
    });
    return toSkillDto(row);
  }

  // ---- slug uniqueness helpers --------------------------------------------

  private async assertNameFree(workspaceId: string, name: string, exceptId?: string): Promise<void> {
    const existing = await this.repo.getByName(workspaceId, name);
    if (existing && existing.id !== exceptId) {
      throw new ConflictError(`A skill named "${name}" already exists`);
    }
  }

  /** Return `name`, or the first free `name-2`, `name-3`, … variant. */
  private async freeName(workspaceId: string, name: string): Promise<string> {
    let candidate = name;
    for (let i = 2; await this.repo.getByName(workspaceId, candidate); i++) {
      candidate = `${name}-${i}`;
    }
    return candidate;
  }
}
