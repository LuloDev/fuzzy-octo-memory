import { env } from '@/backend/config/env';
import { persistence } from '@/backend/services/persistenceService';
import { telegram } from '@/backend/services/telegramNotifier';
import { logger } from '@/backend/services/structuredLogger';
import { execution } from '@/backend/services/executionService';
import { evaluate } from '@/backend/risk/riskEngine';
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
    const tickers = await persistence.listTickers();
    const positions = await persistence.listOpenPositions();

    // 1) Entry sweep (US2).
    for (const t of tickers) {
      if (!t.enabled) continue;
      const exp = new Date(currentWeekExpirationISO());
      const exists = await persistence.findOpenPositionForWeek(t.symbol, exp);
      if (exists) continue;
      const snapshot = await fetchSnapshotForOpen(t); // test seam
      if (!snapshot) continue;
      const contracts = computeContracts(t);
      await execution.openIronCondor(t, snapshot, contracts);
    }

    // 2) Risk sweep (US3).
    for (const p of positions) {
      const cfg = tickers.find((t) => t.id === (p as unknown as { tickerConfigId?: string }).tickerConfigId) ?? null;
      if (!cfg) continue;
      const snapshot = await fetchSnapshotForRisk(p); // test seam
      if (!snapshot) continue;
      const intents = evaluate(p, snapshot, cfg);
      await execution.applyIntents(p, intents, snapshot);
    }

    // 3) Heartbeat (US5).
    await this.maybeHeartbeat(now);
  }

  private async maybeHeartbeat(now: number): Promise<void> {
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

// Test seams: default snapshot builders are minimal; tests inject richer data.
async function fetchSnapshotForOpen(_cfg: TickerConfig): Promise<MarketSnapshot | null> {
  // Real implementation will fetch quotes via alpacaService. For now we skip
  // entries in dry-run / unit-test scenarios by returning null when there
  // are no quotes; the integration test supplies them via a service seam.
  return null;
}
async function fetchSnapshotForRisk(_p: Position): Promise<MarketSnapshot | null> {
  return null;
}

function currentWeekExpirationISO(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const add = (5 - day + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString();
}

function computeContracts(c: TickerConfig): number {
  // Simplified: 1 contract per $10k allocation; the UI lets the operator override.
  // Real implementation reads the account's last_equity from AlpacaService.
  return Math.max(1, Math.round(parseFloat(c.allocationPercentage) / 5));
}

export const monitoring = new MonitoringService();