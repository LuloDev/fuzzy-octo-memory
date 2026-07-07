import type { PrismaClient } from '@prisma/client';
import type { Decimal as PrismaDecimal } from 'decimal.js';
import type {
  TickerConfig,
  TickerConfigPatch,
  Position,
  Intent,
  PositionEventKind,
  OrderSubmission,
  Alert,
} from '@/types/index-shim';

// Prisma generates `Decimal` as a thin class that interoperates with decimal.js.
// We type-annotate against the public @prisma/client surface; the implementation
// stores it as a string at the wire boundary.

type Decimal = PrismaDecimal;

// Append-only writes for audit tables: PositionEvent, OrderSubmission,
// TickerConfigRevision. The exposure below intentionally excludes
// update() and delete() for those tables (Constitution Principle V).
//
// The PrismaClient is constructed lazily so importing this module (e.g.
// for unit tests of pure helpers in executionService) does not require
// the generated client to exist on disk.

// Lazily create the PrismaClient using a top-level awaited dynamic import
// the first time `init()` is called. `db()` must only be called after
// `init()` has resolved; `app.ts` guarantees this ordering at boot.
let _prisma: PrismaClient | null = null;
let _initPromise: Promise<PrismaClient> | null = null;

export async function initPersistence(): Promise<PrismaClient> {
  if (_prisma) return _prisma;
  if (!_initPromise) {
    _initPromise = (async () => {
      const mod = (await import('@prisma/client')) as typeof import('@prisma/client');
      _prisma = new mod.PrismaClient();
      return _prisma;
    })();
  }
  return _initPromise;
}

function db(): PrismaClient {
  if (!_prisma) {
    throw new Error(
      'persistence client not initialized — call initPersistence() at boot ' +
        'before any DB method (see src/backend/app.ts).',
    );
  }
  return _prisma;
}

// Public escape hatch for services that need the raw Prisma client (e.g.
// binding to killStateService). Throws if init() has not been awaited.
export function dbUnsafe(): PrismaClient {
  return db();
}

function toConfigDto(row: {
  id: string;
  symbol: string;
  enabled: boolean;
  automaticManeuversEnabled: boolean;
  allocationPercentage: Decimal;
  targetDelta: Decimal;
  widthOfSpread: Decimal;
  takeProfitPercentage: Decimal;
  stopLossMultiplier: Decimal;
  dailyLossLimit: Decimal;
  createdAt: Date;
  updatedAt: Date;
}): TickerConfig {
  return {
    id: row.id,
    symbol: row.symbol,
    enabled: row.enabled,
    automaticManeuversEnabled: row.automaticManeuversEnabled,
    allocationPercentage: row.allocationPercentage.toString(),
    targetDelta: row.targetDelta.toString(),
    widthOfSpread: row.widthOfSpread.toString(),
    takeProfitPercentage: row.takeProfitPercentage.toString(),
    stopLossMultiplier: row.stopLossMultiplier.toString(),
    dailyLossLimit: row.dailyLossLimit.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPositionDto(r: {
  id: string;
  symbol: string;
  expiration: Date;
  shortPutStrike: Decimal;
  longPutStrike: Decimal;
  shortCallStrike: Decimal;
  longCallStrike: Decimal;
  contracts: number;
  entryCredit: Decimal;
  entryTimestamp: Date;
  currentValue: Decimal | null;
  status: string;
  closedAt: Date | null;
  closingPnL: Decimal | null;
}): Position {
  return {
    id: r.id,
    symbol: r.symbol,
    expiration: r.expiration.toISOString(),
    shortPutStrike: r.shortPutStrike.toString(),
    longPutStrike: r.longPutStrike.toString(),
    shortCallStrike: r.shortCallStrike.toString(),
    longCallStrike: r.longCallStrike.toString(),
    contracts: r.contracts,
    entryCredit: r.entryCredit.toString(),
    entryTimestamp: r.entryTimestamp.toISOString(),
    currentValue: r.currentValue ? r.currentValue.toString() : null,
    status: r.status as Position['status'],
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    closingPnL: r.closingPnL ? r.closingPnL.toString() : null,
  };
}

export const persistence = {
  async listTickers(): Promise<TickerConfig[]> {
    const rows = await db().tickerConfig.findMany({ orderBy: { symbol: 'asc' } });
    return rows.map(toConfigDto);
  },

  async getTicker(id: string): Promise<TickerConfig | null> {
    const r = await db().tickerConfig.findUnique({ where: { id } });
    return r ? toConfigDto(r) : null;
  },

  async createTicker(input: Omit<TickerConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<TickerConfig> {
    const r = await db().tickerConfig.create({
      data: {
        symbol: input.symbol,
        enabled: input.enabled,
        automaticManeuversEnabled: input.automaticManeuversEnabled,
        allocationPercentage: input.allocationPercentage,
        targetDelta: input.targetDelta,
        widthOfSpread: input.widthOfSpread,
        takeProfitPercentage: input.takeProfitPercentage,
        stopLossMultiplier: input.stopLossMultiplier,
        dailyLossLimit: input.dailyLossLimit,
      },
    });
    return toConfigDto(r);
  },

  async updateTicker(
    id: string,
    patch: TickerConfigPatch,
    reason?: string,
  ): Promise<TickerConfig> {
    const previous = await db().tickerConfig.findUnique({ where: { id } });
    if (!previous) throw new Error(`TickerConfig ${id} not found`);
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined && k !== 'reason') data[k] = v;
    }
    const updated = await db().tickerConfig.update({
      where: { id },
      data: data as never,
    });
    await db().tickerConfigRevision.create({
      data: {
        tickerConfigId: id,
        previousValue: JSON.stringify(toConfigDto(previous)),
        newValue: JSON.stringify(toConfigDto(updated)),
        reason: reason ?? null,
      },
    });
    return toConfigDto(updated);
  },

  async listOpenPositions(): Promise<Position[]> {
    const rows = await db().position.findMany({
      where: { status: 'OPEN' },
      orderBy: { entryTimestamp: 'desc' },
    });
    return rows.map(toPositionDto);
  },

  async findOpenPositionForWeek(symbol: string, expiration: Date): Promise<Position | null> {
    const r = await db().position.findFirst({
      where: { symbol, expiration, status: 'OPEN' },
    });
    return r ? toPositionDto(r) : null;
  },

  async createPosition(position: Omit<Position, 'id'> & { tickerConfigId: string }): Promise<Position> {
    const r = await db().position.create({
      data: {
        tickerConfigId: position.tickerConfigId,
        symbol: position.symbol,
        expiration: new Date(position.expiration),
        shortPutStrike: position.shortPutStrike,
        longPutStrike: position.longPutStrike,
        shortCallStrike: position.shortCallStrike,
        longCallStrike: position.longCallStrike,
        contracts: position.contracts,
        entryCredit: position.entryCredit,
        entryTimestamp: new Date(position.entryTimestamp),
        currentValue: position.currentValue,
        status: position.status,
      },
    });
    return toPositionDto(r);
  },

  async updatePositionValue(id: string, currentValue: string): Promise<void> {
    await db().position.update({ where: { id }, data: { currentValue } });
  },

  async closePosition(
    id: string,
    status: 'TAKE_PROFIT' | 'STOP_LOSS' | 'ROLLED' | 'PANIC_CLOSED',
    closingPnL: string,
  ): Promise<void> {
    await db().position.update({
      where: { id },
      data: { status, closingPnL, closedAt: new Date() },
    });
  },

  async recordEvent(args: {
    positionId: string;
    kind: PositionEventKind;
    marketSnapshot: unknown;
    realizedPnL?: string;
    intent?: Intent;
  }): Promise<{ id: string }> {
    const r = await db().positionEvent.create({
      data: {
        positionId: args.positionId,
        kind: args.kind,
        marketSnapshot: JSON.stringify(args.marketSnapshot),
        ...(args.realizedPnL !== undefined ? { realizedPnL: args.realizedPnL } : {}),
        intentPayload: args.intent ? JSON.stringify(args.intent) : null,
      },
    });
    return { id: r.id };
  },

  async recordOrder(args: {
    positionId: string;
    positionEventId: string | null;
    intentId: string;
    request: unknown;
    response: unknown | null;
    status: OrderSubmission['status'];
    alpacaOrderId?: string | null;
  }): Promise<void> {
    await db().orderSubmission.create({
      data: {
        positionId: args.positionId,
        positionEventId: args.positionEventId,
        intentId: args.intentId,
        requestPayload: JSON.stringify(args.request),
        responsePayload: args.response ? JSON.stringify(args.response) : null,
        status: args.status,
        alpacaOrderId: args.alpacaOrderId ?? null,
      },
    });
  },

  async getLastHeartbeat(): Promise<string | null> {
    const r = await db().appState.findUnique({ where: { key: 'lastHeartbeatAt' } });
    return r?.value ?? null;
  },

  // Generic AppState helpers used by the kill-switch, health and
  // performance subsystems (spec 002-algo-command-center).
  async getAppState(key: string): Promise<string | null> {
    const r = await db().appState.findUnique({ where: { key } });
    return r?.value ?? null;
  },

  async setAppState(key: string, value: string): Promise<void> {
    await db().appState.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  },

  async setLastHeartbeat(iso: string): Promise<void> {
    await db().appState.upsert({
      where: { key: 'lastHeartbeatAt' },
      create: { key: 'lastHeartbeatAt', value: iso },
      update: { value: iso },
    });
  },

  async upsertDailyPnL(symbol: string, date: Date, realized: string, unrealized: string): Promise<void> {
    await db().tickerDailyPnL.upsert({
      where: { symbol_date: { symbol, date } },
      create: { symbol, date, realizedPnL: realized, unrealizedPnL: unrealized },
      update: { realizedPnL: realized, unrealizedPnL: unrealized },
    });
  },

  async readDailyPnL(
    days: number,
  ): Promise<{ date: Date; symbol: string; realized: string; unrealized: string }[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db().tickerDailyPnL.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r: { date: Date; symbol: string; realizedPnL: Decimal; unrealizedPnL: Decimal }) => ({
      date: r.date,
      symbol: r.symbol,
      realized: r.realizedPnL.toString(),
      unrealized: r.unrealizedPnL.toString(),
    }));
  },

  async disconnect(): Promise<void> {
    if (_prisma) {
      await _prisma.$disconnect();
    }
  },

  // Internal-only noop kept for type-completeness; not part of the audit API.
  _alert: (a: Alert) => a,
};