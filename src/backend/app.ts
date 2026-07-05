import { buildServer } from '@/backend/api/server';
import { monitoring } from '@/backend/services/monitoringService';
import { initPersistence, persistence } from '@/backend/services/persistenceService';
import { env } from '@/backend/config/env';
import { logger } from '@/backend/services/structuredLogger';
import { telegram } from '@/backend/services/telegramNotifier';

// Composition root. Wires Fastify server + monitoring loop + heartbeat scheduler.

async function main(): Promise<void> {
  logger.info('app', 'starting', { dryRun: env.DRY_RUN, host: env.HOST, port: env.PORT });

  // Initialize the PrismaClient BEFORE starting the monitoring loop — the loop's
  // first tick fires immediately, and persistence.listTickers() throws if the
  // client hasn't been constructed yet.
  await initPersistence();

  const app = await buildServer();
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info('app', 'http listening', { host: env.HOST, port: env.PORT });

  // Start the 5-minute monitoring loop (entry + risk sweep + heartbeat).
  monitoring.start();

  // Heartbeat scheduler (US5): emit a Telegram heartbeat on a coarse cadence
  // independent of the monitoring loop, so a dead monitoring loop still
  // surfaces a heartbeat-based dead-man alert.
  setInterval(() => {
    void telegram.heartbeat().catch((e) => logger.error('app', 'heartbeat failed', { error: (e as Error).message }));
  }, 60 * 60 * 1000);

  const shutdown = async (sig: string) => {
    logger.info('app', 'shutdown', { sig });
    monitoring.stop();
    await app.close();
    await persistence.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  logger.error('app', 'fatal', { error: (e as Error).message });
  process.exit(1);
});