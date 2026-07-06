// Singleton persistence for the two graduated kill switches
// (new-entries and maneuvers). State lives in AppState rows so it survives
// container restarts. Constitution Principle VI — kill switches must not
// be ephemeral, and the hard panic bypass remains on /api/panic.
//
// The engine reads `getPauseFlags()` once per tick (cheap: two rows), so
// pause latency is bounded by the in-process cache TTL (1 s) plus the
// monitoring loop interval (5 min max). Hot path: O(1) on cache hit.

import type { PrismaClient } from '@prisma/client';
import type { KillFeature, KillStateDto, KillAction } from '@/shared/contracts';

type Cached = { value: KillStateDto; ts: number };
const TTL_MS = 1_000;

let _prisma: PrismaClient | null = null;
const _cache = new Map<KillFeature, Cached>();

export function bindKillStatePersistence(p: PrismaClient): void {
  _prisma = p;
}

function prisma(): PrismaClient {
  if (!_prisma) {
    throw new Error(
      'persistence not bound — call bindKillStatePersistence(initPersistence()) at boot',
    );
  }
  return _prisma;
}

async function readRow(feature: KillFeature): Promise<KillStateDto> {
  const key = `kill_state_${feature}`;
  const row = await prisma().appState.findUnique({ where: { key } });
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as KillStateDto;
      // Re-affirm the feature discriminator on read; never trust the JSON.
      return { ...parsed, feature };
    } catch {
      // Corrupt: fall through to default.
    }
  }
  return {
    feature,
    paused: false,
    since: null,
    reason: null,
    changedBy: 'system',
  };
}

async function writeRow(state: KillStateDto): Promise<void> {
  const key = `kill_state_${state.feature}`;
  await prisma().appState.upsert({
    where: { key },
    create: { key, value: JSON.stringify(state) },
    update: { value: JSON.stringify(state) },
  });
}

export async function getKillState(feature: KillFeature): Promise<KillStateDto> {
  const now = Date.now();
  const cached = _cache.get(feature);
  if (cached && now - cached.ts < TTL_MS) return cached.value;
  const value = await readRow(feature);
  _cache.set(feature, { value, ts: now });
  return value;
}

export async function setKillState(
  feature: KillFeature,
  action: KillAction,
  reason: string,
  actor: 'operator' | 'system' = 'operator',
): Promise<KillStateDto> {
  const now = new Date().toISOString();
  const next: KillStateDto = {
    feature,
    paused: action === 'pause',
    since: now,
    reason,
    changedBy: actor,
  };
  await writeRow(next);
  _cache.delete(feature); // next read repopulates from DB
  return next;
}

export type PauseFlags = { newEntries: boolean; maneuvers: boolean };

// Single-shot read used by MonitoringService.tick() at the start of each
// cycle. Cache-bypassed intentionally so transitions land at most one
// tick later; acceptable since the loop interval is 5 minutes.
export async function getPauseFlags(): Promise<PauseFlags> {
  return {
    newEntries: (await getKillState('new-entries')).paused,
    maneuvers: (await getKillState('maneuvers')).paused,
  };
}

// Convenience for unit tests / hot reload.
export function _resetKillStateCache(): void {
  _cache.clear();
}