import type { FastifyInstance } from 'fastify';
import { persistence } from '@/backend/services/persistenceService';
import { CreateTickerDto, UpdateTickerDto } from '@/shared/contracts';

export async function tickerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tickers', async () => {
    return { tickers: await persistence.listTickers() };
  });

  app.post('/tickers', {
    handler: async (req, reply) => {
      const parsed = CreateTickerDto.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const created = await persistence.createTicker({
        symbol: parsed.data.symbol,
        enabled: parsed.data.enabled,
        automaticManeuversEnabled: parsed.data.automaticManeuversEnabled,
        allocationPercentage: parsed.data.allocationPercentage,
        targetDelta: parsed.data.targetDelta,
        widthOfSpread: parsed.data.widthOfSpread,
        takeProfitPercentage: parsed.data.takeProfitPercentage,
        stopLossMultiplier: parsed.data.stopLossMultiplier,
        dailyLossLimit: parsed.data.dailyLossLimit,
      });
      return reply.status(201).send(created);
    },
  });

  app.patch('/tickers/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = UpdateTickerDto.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const existing = await persistence.getTicker(id);
      if (!existing) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'ticker not found' } });
      }
      const updated = await persistence.updateTicker(id, parsed.data, parsed.data.reason ?? undefined);
      return reply.status(200).send(updated);
    },
  });
}