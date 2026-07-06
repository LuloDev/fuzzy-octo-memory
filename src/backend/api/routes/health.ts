import type { FastifyInstance } from 'fastify';
import { persistence } from '@/backend/services/persistenceService';
import { buildHealthSnapshot } from '@/backend/services/healthSnapshot';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const [lastBrokerCall, lastQuoteFetch, lastTelegramDelivery, alpaca429Count, lastHeartbeatAt] =
      await Promise.all([
        persistence.getAppState('last_broker_call'),
        persistence.getAppState('last_quote_fetch'),
        persistence.getAppState('last_telegram_delivery'),
        persistence.getAppState('alpaca_429_count'),
        persistence.getLastHeartbeat(),
      ]);
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      dryRun: process.env.DRY_RUN?.toLowerCase() === 'true',
      lastHeartbeatAt,
      health: buildHealthSnapshot({ lastBrokerCall, lastQuoteFetch, lastTelegramDelivery, alpaca429Count }),
    };
  });
}