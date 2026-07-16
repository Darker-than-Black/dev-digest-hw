import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * smart-diff module.
 *   GET /pulls/:id/smart-diff → risk-ordered diff layout + findings overlay
 *
 * No `rateLimit` config — unlike `reviews`/`intent`, this is a cheap DB-only
 * read with no LLM fan-out, so throttling it would signal a cost that
 * doesn't exist. No `response:` schema either — the typed return + the
 * existing `SmartDiffResponse` contract are the serialization surface, same
 * as every sibling module.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SmartDiffService(container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams } },
    async (req): Promise<SmartDiffResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.getSmartDiff(workspaceId, req.params.id);
    },
  );
}
