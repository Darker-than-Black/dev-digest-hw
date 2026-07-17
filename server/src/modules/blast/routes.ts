import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastResponse } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module.
 *   GET /pulls/:id/blast (+ opt-in ?explain=true) → symbols → callers →
 *   endpoints/crons map, read entirely off the repo-intel index.
 *
 * No `rateLimit` config — like `smart-diff`, this is a cheap DB/facade-only
 * read by default; the LLM path is opt-in (`?explain=true`) and a single
 * cheap-model call, not a fan-out, so throttling it would signal a cost that
 * doesn't exist. No `response:` schema either — the typed return + the
 * `BlastResponse` contract are the serialization surface, same as every
 * sibling module.
 */

// `explain` is whitelisted at the comparison site (only the literal string
// 'true' turns it on) rather than schema-rejected — an arbitrary/garbage
// value is simply treated as "not explain", never a 422.
const BlastQuery = z.object({ explain: z.string().optional() });

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, querystring: BlastQuery } },
    async (req): Promise<BlastResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlast(workspaceId, req.params.id, {
        explain: req.query.explain === 'true',
      });
    },
  );
}
