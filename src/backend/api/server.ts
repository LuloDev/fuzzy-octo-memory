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
import { logger } from '@/backend/services/structuredLogger';
import { ErrorDto } from '@/shared/contracts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });

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