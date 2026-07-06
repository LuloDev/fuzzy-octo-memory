import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { ZodTypeProvider, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { tickerRoutes } from '@/backend/api/routes/tickers';
import { metricsRoutes } from '@/backend/api/routes/metrics';
import { positionRoutes } from '@/backend/api/routes/positions';
import { equityCurveRoutes } from '@/backend/api/routes/equityCurve';
import { panicRoutes } from '@/backend/api/routes/panic';
import { healthRoutes } from '@/backend/api/routes/health';
import { auditRoutes } from '@/backend/api/routes/audit';
import { killRoutes } from '@/backend/api/routes/kill';
import { auditFeedRoutes } from '@/backend/api/routes/auditFeed';
import { analyticsRoutes } from '@/backend/api/routes/analytics';
import { logger } from '@/backend/services/structuredLogger';
import { bindKillStatePersistence } from '@/backend/services/killStateService';
import { dbUnsafe } from '@/backend/services/persistenceService';
import { ErrorDto } from '@/shared/contracts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Bind the kill-state service to the Prisma client so the API can flip
  // its singletons (must happen before route registration that touches them).
  bindKillStatePersistence(dbUnsafe());

  await app.register(cors, { origin: true });

  // FR-011: GET responses get a 10s cache header by default to keep the
  // dashboard from hammering Alpaca in multi-tab scenarios. /api/kill/*
  // MUST NOT be cached so operator toggles land at most one cycle later.
  app.addHook('onSend', async (req, reply) => {
    if (req.method !== 'GET') return;
    const url = req.url;
    if (url.startsWith('/api/kill/')) {
      reply.header('cache-control', 'no-store');
    } else if (url.startsWith('/api/')) {
      reply.header('cache-control', 'public, max-age=10, stale-while-revalidate=10');
    }
  });

  // Centralized error envelope per contracts/rest-api.md.
  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    const message = e.message ?? 'unknown';
    const body: ErrorDto = {
      error: {
        code: status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
        message,
      },
    };
    logger.error('api', 'request error', { status, message });
    reply.status(status).send(body);
  });

  // API routes first — they take precedence over the static catch-all.
  await app.register(tickerRoutes, { prefix: '/api' });
  await app.register(positionRoutes, { prefix: '/api' });
  await app.register(metricsRoutes, { prefix: '/api' });
  await app.register(equityCurveRoutes, { prefix: '/api' });
  await app.register(panicRoutes, { prefix: '/api' });
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(auditRoutes, { prefix: '/api' });
  await app.register(killRoutes, { prefix: '/api/kill' });
  await app.register(auditFeedRoutes, { prefix: '/api' });
  await app.register(analyticsRoutes, { prefix: '/api' });

  // Serve the built SPA from src/frontend/dist if it exists. The SPA uses
  // BrowserRouter, so any non-/api GET falls back to index.html (enabling
  // deep links like /tickers and /positions on reload).
  const frontendDist = resolve(process.cwd(), 'src/frontend/dist');
  if (existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      wildcard: false, // we register our own catch-all below
    });
    // Catch-all for client-side routing: anything that wasn't a static asset
    // and isn't under /api returns index.html so the browser can route.
    app.get('/*', async (_req, reply) => {
      return reply.sendFile('index.html');
    });
    logger.info('api', 'serving dashboard', { root: frontendDist });
  } else {
    logger.warn('api', 'frontend bundle not found; serving API only', {
      hint: 'run `npm run build --workspace src/frontend` to build the dashboard',
    });
  }

  return app.withTypeProvider<ZodTypeProvider>();
}