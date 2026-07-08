import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillImportPreview, SkillSlug, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_IMPORT_BYTES } from './constants.js';
import { SkillsService } from './service.js';

/**
 * Skills module — CRUD over the workspace's reusable, text-only skills, plus
 * body-version history (list/get/restore) and markdown/zip import (preview →
 * confirm). Skills carry NO tools or external actions — only text + config.
 *
 *   GET    /skills                         → list (workspace-scoped)
 *   GET    /skills/:id                      → one skill
 *   POST   /skills                          → create
 *   PUT    /skills/:id                      → update / toggle enabled (versions body)
 *   DELETE /skills/:id                      → delete (versions + links cascade)
 *   GET    /skills/:id/versions             → body history (newest first)
 *   GET    /skills/:id/versions/:version    → one body snapshot
 *   POST   /skills/:id/versions/:version/restore → restore an old body
 *   POST   /skills/import/preview           → parse .md/.zip (persists nothing)
 *   POST   /skills/import/confirm           → persist a previewed skill
 */

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: SkillSlug,
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: SkillSlug.optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});

/** Import upload — the file is sent base64-encoded (no multipart dependency). */
const ImportPreviewBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Skill version not found');
      return version;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.post(
    '/skills/import/preview',
    { schema: { body: ImportPreviewBody } },
    async (req) => {
      await getContext(app.container, req);
      const buf = Buffer.from(req.body.content_base64, 'base64');
      if (buf.length === 0) throw new ValidationError('Uploaded file is empty');
      if (buf.length > MAX_IMPORT_BYTES) throw new ValidationError('File is too large to import');
      return service.parseImport(req.body.filename, new Uint8Array(buf));
    },
  );

  app.post(
    '/skills/import/confirm',
    { schema: { body: SkillImportPreview } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.confirmImport(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );
}
