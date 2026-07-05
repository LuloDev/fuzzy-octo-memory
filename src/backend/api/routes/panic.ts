import type { FastifyInstance } from 'fastify';
import { panic } from '@/backend/services/panicService';
import { env } from '@/backend/config/env';
import { PanicDto } from '@/shared/contracts';

export async function panicRoutes(app: FastifyInstance): Promise<void> {
  app.post('/panic', {
    handler: async (req, reply) => {
      const parsed = PanicDto.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      if (env.PANIC_REQUIRES_CONFIRMATION && parsed.data.reason !== 'confirm') {
        return reply.status(412).send({ error: { code: 'CONFIRMATION_REQUIRED', message: 'reason must be "confirm" when PANIC_REQUIRES_CONFIRMATION=true' } });
      }
      const result = await panic.panicAll(parsed.data.reason ?? 'manual panic');
      return reply.status(202).send({ accepted: true, ...result });
    },
  });
}