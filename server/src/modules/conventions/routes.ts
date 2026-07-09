import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UpdateConventionBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * L02 — conventions module.
 *   POST  /repos/:id/conventions/extract      → scan → LLM → evidence gate → persist (SYNC)
 *   GET   /repos/:id/conventions              → persisted candidates for the repo
 *   PATCH /conventions/:id                    → accept / reject / edit rule+category
 *   POST  /repos/:id/conventions/skill-draft  → merged, editable skill draft from accepted
 *
 * Skill SAVE reuses the existing POST /skills; optional agent link reuses
 * POST /agents/:id/skills — this module creates no skill itself.
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  // Synchronous, LLM-backed scan — tight per-route limit like the review run.
  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.update(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );

  app.post('/repos/:id/conventions/skill-draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.buildSkillDraft(workspaceId, req.params.id);
  });
}
