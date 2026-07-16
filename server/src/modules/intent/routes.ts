import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * intent module.
 *   GET  /pulls/:id/intent            → persisted Intent for a PR, or null
 *   POST /pulls/:id/intent/recompute  → force re-derive + persist
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.intent;

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getIntent(workspaceId, req.params.id);
  });

  // LLM-calling endpoint — tight per-route limit, same as reviews/conventions.
  app.post(
    '/pulls/:id/intent/recompute',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.computeIntent(workspaceId, req.params.id, { force: true });
    },
  );
}
