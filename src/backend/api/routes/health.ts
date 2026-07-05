import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      dryRun: process.env.DRY_RUN?.toLowerCase() === 'true',
      lastHeartbeatAt: null, // wired via persistence in a real deployment
    };
  });
}