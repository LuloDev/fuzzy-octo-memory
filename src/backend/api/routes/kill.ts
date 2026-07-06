// Graduated kill switches. Two opt-in pauses (entries, maneuvers) that the
// monitoring loop reads at the top of every cycle. The hard panic remains
// on /api/panic unchanged — that's the only legitimate bypass of the risk
// engine per Constitution Principle VI.

import type { FastifyInstance } from 'fastify';
import { getKillState, setKillState } from '@/backend/services/killStateService';
import { persistence } from '@/backend/services/persistenceService';
import { logger } from '@/backend/services/structuredLogger';
import { type KillFeature, type KillRequestDto, type KillStateResponseDto, KillRequestDto as KillRequestDtoSchema } from '@/shared/contracts';

type RouteApp = FastifyInstance & {
  post: (path: string, opts: unknown, handler: unknown) => void;
  get: (path: string, opts: unknown, handler: unknown) => void;
};

async function handleFeatureToggle(app: FastifyInstance, feature: KillFeature, body: KillRequestDto): Promise<unknown> {
  // Validate via the registered zod compiler (the route declaration uses
  // a zod schema so Fastify already validated before reaching here).
  const next = await setKillState(feature, body.action, body.reason);

  // Audit trail (Constitution Principle V): record the transition so the
  // operator sees it in the feed and Telegram.
  // We don't have a real position; the audit feed accepts either a real
  // positionEventId OR a synthetic "engine" event. We log the simplest possible
  // marker: append a JSON line into AppState under `last_kill_state_change`.
  await persistence.setAppState(
    'last_kill_state_change',
    JSON.stringify({
      ts: new Date().toISOString(),
      feature,
      action: body.action,
      reason: body.reason,
    }),
  );

  logger.info('kill', 'state transition', { feature, action: body.action, reason: body.reason });
  return next;
}

export async function killRoutes(app: FastifyInstance): Promise<void> {
  const a = app as RouteApp;
  const features: KillFeature[] = ['new-entries', 'maneuvers'];

  for (const feature of features) {
    const path = `/${feature}`;
    a.post(path, { schema: { body: KillRequestDtoSchema } }, async (req: unknown) => {
      const r = req as { body: KillRequestDto };
      return handleFeatureToggle(app, feature, r.body);
    });
  }

  // Read endpoint: combined view used by the header badge (FR-017).
  a.get('/state', {}, async (): Promise<KillStateResponseDto> => {
    const [newEntries, maneuvers] = await Promise.all([
      getKillState('new-entries'),
      getKillState('maneuvers'),
    ]);
    const lastHardPanicAt = await persistence.getAppState('last_hard_panic_at');
    return {
      newEntries,
      maneuvers,
      lastHardPanicAt,
    };
  });
}

export async function recordHardPanic(): Promise<void> {
  await persistence.setAppState('last_hard_panic_at', new Date().toISOString());
}