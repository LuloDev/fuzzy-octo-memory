import { env } from '@/backend/config/env';
import { persistence } from '@/backend/services/persistenceService';
import { telegram } from '@/backend/services/telegramNotifier';
import { logger } from '@/backend/services/structuredLogger';
import { execution } from '@/backend/services/executionService';
import { alpaca } from '@/backend/services/alpacaService';
import { evaluate } from '@/backend/risk/riskEngine';
import { marketHours } from '@/backend/services/marketHoursService';
import { getPauseFlags } from '@/backend/services/killStateService';
import { defaultOsi } from '@/backend/orders/ironCondorBuilder';
import type { Position, TickerConfig, MarketSnapshot } from '@/types/domain';
import type { AlertKind } from '@/types/events';

// Heartbeat cadence (one per market-session day) + alert window (Constitution §VI).
const HEARTBEAT_ABSENCE_MS = 30 * 60 * 1000; // 30 minutes
const HEARTBEAT_PERIOD_MS = 60 * 60 * 1000; // emit at most every 60 min

export class MonitoringService {
  private timer: NodeJS.Timeout | null = null;
  private lastHeartbeatSent = 0;
  private stopping = false;

  start(): void {
    if (this.timer) return;
    logger.info('monitoring', 'starting', { intervalMs: env.MONITOR_INTERVAL_MS });
    this.timer = setInterval(() => this.tick().catch((e) => logger.error('monitoring', 'tick failed', { error: (e as Error).message })), env.MONITOR_INTERVAL_MS);
    // Kick once immediately so first selection isn't delayed.
    void this.tick();
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  stop(): void {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('monitoring', 'stopped');
    }
  }

  // Public for tests.
  async tick(): Promise<void> {
    if (this.stopping) return;
    const now = Date.now();

    // FR-013/FR-015/FR-018: graduated kill switches short-circuit at the top
    // of every cycle. Reads are cache-bypassed (1s TTL in killStateService)
    // so transitions land at most one tick later.
    const flags = await getPauseFlags();

    const tickers = await persistence.listTickers();
    const positions = await persistence.listOpenPositions();

    // 1) Entry sweep (US2). Skip when `new-entries` is paused. We still log
    // an event so the audit feed and Telegram see the rejection.
    if (flags.newEntries) {
      logger.info('monitoring', 'entry sweep skipped — kill_state_new_entries=paused');
      // Use a synthetic positionId: PositionEvent.positionId is non-nullable,
      // so we attach to a dedicated "engine" record. If the schema is awkward
      // we instead emit a telegram alert and a logger.warn; both pathways let
      // the operator see the rejection.
      await telegram
        .send({
          kind: 'WARN_KILL_SWITCH_ENTRIES',
          title: 'New-entries paused',
          body: `kill_state_new_entries=paused — entry sweep skipped at ${new Date(now).toISOString()}`,
        })
        .catch((e: unknown) => logger.error('monitoring', 'telegram notify failed', { error: (e as Error).message }));
    } else {
      if (tickers.length === 0) {
        logger.info('monitoring', 'entry sweep — no tickers configured');
      }
      for (const t of tickers) {
        if (!t.enabled) continue;
        const expIso = currentWeekExpirationISO();
        const exp = new Date(expIso);
        const exists = await persistence.findOpenPositionForWeek(t.symbol, exp);
        if (exists) continue;
        logger.info('monitoring', 'entry sweep — evaluating', { symbol: t.symbol });
        const snapshot = await fetchSnapshotForOpen(t, expIso); // test seam
        if (!snapshot) {
          logger.info('monitoring', 'entry sweep — snapshot unavailable (null)', { symbol: t.symbol });
          continue;
        }
        await execution.openIronCondor(t, snapshot);
      }
    }

    // 2) Risk sweep (US3). Evaluated always (introspection is cheap) but the
    // maneuver dispatch is skipped when `maneuvers` is paused; intents are
    // still logged so the audit feed reflects what would have happened.
    for (const p of positions) {
      const cfg = tickers.find((t) => t.id === (p as unknown as { tickerConfigId?: string }).tickerConfigId) ?? null;
      if (!cfg) continue;
      const snapshot = await fetchSnapshotForRisk(p); // test seam
      if (!snapshot) continue;

      // FR-021 / US8: record a mid-price observation per tick so the
      // real-vs-theoretical theta chart has something to plot.
      if (p.currentValue) {
        await persistence
          .recordEvent({
            positionId: p.id,
            kind: 'MID_OBSERVED',
            marketSnapshot: { mid: p.currentValue, observedAt: new Date(now).toISOString() },
          })
          .catch((e: unknown) =>
            logger.warn('monitoring', 'mid observation failed to persist', { error: (e as Error).message }),
          );
      }

      const intents = evaluate(p, snapshot, cfg);
      if (flags.maneuvers) {
        logger.info('monitoring', 'maneuver dispatch skipped — kill_state_maneuvers=paused', {
          positionId: p.id,
          intentCount: intents.length,
        });
        await persistence
          .recordEvent({
            positionId: p.id,
            kind: 'PAUSED_FOR_MANEUVERS',
            marketSnapshot: { ...snapshot, intents, reason: 'PAUSED_FOR_MANEUVERS' },
          })
          .catch((e: unknown) =>
            logger.error('monitoring', 'failed to log paused-maneuver event', { error: (e as Error).message }),
          );
        continue;
      }
      await execution.applyIntents(p, intents, snapshot);
    }

    // 3) Heartbeat (US5).
    await this.maybeHeartbeat(now);
  }

  private async maybeHeartbeat(now: number): Promise<void> {
    // Constitution §VI: heartbeat only applies during market hours.
    if (!(await marketHours.isOpen())) return;

    if (now - this.lastHeartbeatSent >= HEARTBEAT_PERIOD_MS) {
      this.lastHeartbeatSent = now;
      await telegram.send({
        kind: 'HEARTBEAT' as AlertKind,
        title: 'Heartbeat',
        body: `alive at ${new Date(now).toISOString()}`,
      });
      await persistence.setLastHeartbeat(new Date(now).toISOString());
    } else {
      // Absence watcher: if last persisted heartbeat is older than window, alert.
      const last = await persistence.getLastHeartbeat();
      if (last) {
        const age = now - new Date(last).getTime();
        if (age > HEARTBEAT_ABSENCE_MS) {
          await telegram.send({
            kind: 'WARN_NO_HEARTBEAT' as AlertKind,
            title: 'No heartbeat in 30 min',
            body: `Last heartbeat at ${last}`,
          });
          await persistence.setLastHeartbeat(new Date(now).toISOString()); // reset to avoid storm
        }
      }
    }
  }
}

// Fetch a MarketSnapshot with enough option chain data for the opening
// strike planner to pick strikes by delta. Returns null when the broker
// is unreachable or no quotes are available (entry sweep skips that ticker).
async function fetchSnapshotForOpen(cfg: TickerConfig, expiration: string): Promise<MarketSnapshot | null> {
  const symbol = cfg.symbol;
  const expDate = expiration.slice(0, 10);

  // Get underlying price from stock quote.
  const stock = await alpaca.getStockQuote(symbol);
  if (!stock.ok) {
    logger.warn('monitoring', 'fetchSnapshotForOpen — stock quote failed', { symbol, error: stock.error.message });
    return null;
  }
  const underlyingPrice = String((parseFloat(stock.value.ask) + parseFloat(stock.value.bid)) / 2);
  logger.info('monitoring', 'fetchSnapshotForOpen — stock quote ok', { symbol, price: underlyingPrice, stockBid: stock.value.bid, stockAsk: stock.value.ask });

  // Query strikes in $1 intervals ±$15 around the underlying price.
  const px = parseFloat(underlyingPrice);
  const minStrike = Math.max(1, Math.round(px - 15));
  const maxStrike = Math.round(px + 15);
  const osis: string[] = [];
  for (let strike = minStrike; strike <= maxStrike; strike++) {
    const st = strike.toFixed(2);
    osis.push(defaultOsi('put', st, expDate, symbol));
    osis.push(defaultOsi('call', st, expDate, symbol));
  }

  const quotesResult = await alpaca.getOptionQuotesBatch(osis);
  if (!quotesResult.ok) {
    logger.warn('monitoring', 'fetchSnapshotForOpen — option quotes failed', { symbol, error: quotesResult.error.message });
    return null;
  }

  const quotes = quotesResult.value;
  const putCount = quotes.filter(q => q.side === 'put').length;
  const callCount = quotes.filter(q => q.side === 'call').length;
  logger.info('monitoring', 'fetchSnapshotForOpen — quotes received', { symbol, total: quotes.length, puts: putCount, calls: callCount, osiRequested: osis.length });
  if (quotes.length === 0) {
    logger.warn('monitoring', 'fetchSnapshotForOpen — zero quotes', { symbol, osiCount: osis.length });
    return null;
  }

  return { symbol, underlyingPrice, quotes, observedAt: new Date().toISOString() };
}

// Fetch a MarketSnapshot for the exact strikes on an open position.
// Used by the risk sweep to evaluate TP / SL / roll.
async function fetchSnapshotForRisk(p: Position): Promise<MarketSnapshot | null> {
  const symbol = p.symbol;

  const stock = await alpaca.getStockQuote(symbol);
  if (!stock.ok) {
    logger.warn('monitoring', 'fetchSnapshotForRisk — stock quote failed', { symbol, error: stock.error.message });
    return null;
  }
  const underlyingPrice = String((parseFloat(stock.value.ask) + parseFloat(stock.value.bid)) / 2);

  const expDate = p.expiration.slice(0, 10);
  const osis = [
    defaultOsi('put', p.shortPutStrike, expDate, symbol),
    defaultOsi('put', p.longPutStrike, expDate, symbol),
    defaultOsi('call', p.shortCallStrike, expDate, symbol),
    defaultOsi('call', p.longCallStrike, expDate, symbol),
  ];

  const quotesResult = await alpaca.getOptionQuotesBatch(osis);
  if (!quotesResult.ok) {
    logger.warn('monitoring', 'fetchSnapshotForRisk — option quotes failed', { symbol, error: quotesResult.error.message });
    return null;
  }

  const quotes = quotesResult.value;
  if (quotes.length === 0) return null;

  return { symbol, underlyingPrice, quotes, observedAt: new Date().toISOString() };
}

function currentWeekExpirationISO(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const add = (5 - day + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString();
}

// Contracts now computed inside ExecutionService.openIronCondor using account buying power.

export const monitoring = new MonitoringService();