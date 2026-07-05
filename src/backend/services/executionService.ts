import { env } from '@/backend/config/env';
import { alpaca } from '@/backend/services/alpacaService';
import { persistence } from '@/backend/services/persistenceService';
import { telegram } from '@/backend/services/telegramNotifier';
import { logger } from '@/backend/services/structuredLogger';
import { Money } from '@/types/money';
import type {
  Intent, Position, TickerConfig, MarketSnapshot,
} from '@/types/domain';
import type { AlertKind } from '@/types/events';
import { buildOpenOrder } from '@/backend/orders/ironCondorBuilder';
import { buildCloseOrder } from '@/backend/orders/closeBuilder';
import {
  buildRollCloseLegs,
  buildRollOpenLegs,
} from '@/backend/orders/rollBuilder';
import { expirationISO } from '@/backend/services/expirationCalendar';
import { randomUUID } from 'node:crypto';

// Margin pre-flight safety multiple (Constitution guardrail #4).
const MARGIN_MULTIPLE = '1.5';

// Compute worst-case loss of a combo (per contract, USD).
//   (width − credit) × contracts × 100
export function worstCaseLoss(width: string, credit: string, contracts: number): Money {
  const w = Money.from(width);
  const c = Money.from(credit).div(Money.from('100')); // credit is total for 1 combo
  const perContract = w.minus(c).times(100);
  return perContract.times(contracts);
}

// Check buying power vs 1.5× worst-case loss.
export function marginPreflight(
  freeBuyingPower: string,
  width: string,
  credit: string,
  contracts: number,
): { ok: boolean; required: string } {
  const bp = Money.from(freeBuyingPower);
  const worst = worstCaseLoss(width, credit, contracts);
  const required = worst.times(parseFloat(MARGIN_MULTIPLE));
  return { ok: bp.gte(required), required: required.toString() };
}

export class ExecutionService {
  // Open an Iron Condor for a config + snapshot.
  async openIronCondor(
    config: TickerConfig,
    snapshot: MarketSnapshot,
    contracts: number,
  ): Promise<{ positionId: string | null; intentId: string; accepted: boolean }> {
    const intentId = randomUUID();
    const expiration = expirationISO();

    // Duplicate entry check (FR-004).
    const existing = await persistence.findOpenPositionForWeek(config.symbol, new Date(expiration));
    if (existing) {
      logger.info('execution', 'duplicate entry skipped', { ticker: config.symbol, positionId: existing.id });
      return { positionId: existing.id, intentId, accepted: false };
    }

    // Margin pre-flight (FR-015, guardrail #4).
    const acct = await alpaca.getAccount();
    if (!acct.ok) {
      await this.failOpen(intentId, config, 'BROKER_UNREACHABLE', acct.error.message);
      return { positionId: null, intentId, accepted: false };
    }
    const built = buildOpenOrder(config, snapshot, expiration, contracts);
    const pf = marginPreflight(acct.value.buying_power, config.widthOfSpread, built.credit, contracts);
    if (!pf.ok) {
      await this.failOpen(intentId, config, 'MARGIN_INSUFFICIENT', `required ${pf.required}, have ${acct.value.buying_power}`);
      return { positionId: null, intentId, accepted: false };
    }

    // Dry-run guardrail #5: no broker traffic when DRY_RUN=true.
    if (env.DRY_RUN) {
      logger.info('execution', 'dry-run open (no broker traffic)', { ticker: config.symbol, intentId });
      const event = await persistence.recordEvent({
        positionId: 'dry-run',
        kind: 'OPENED',
        marketSnapshot: snapshot,
        intent: { kind: 'Open', configId: config.id, expiration },
      });
      await persistence.recordOrder({
        positionId: 'dry-run',
        positionEventId: event.id,
        intentId,
        request: built.payload,
        response: null,
        status: 'PENDING',
      });
      return { positionId: null, intentId, accepted: false };
    }

    // Live submit.
    const res = await alpaca.submitOrder(built.payload as unknown as Record<string, unknown>);
    if (!res.ok) {
      await this.failOpen(intentId, config, 'BROKER_UNREACHABLE', res.error.message);
      return { positionId: null, intentId, accepted: false };
    }

    // Persist the position + events + order row.
    const position = await persistence.createPosition({
      symbol: config.symbol,
      expiration,
      shortPutStrike: built.plan.shortPut,
      longPutStrike: built.plan.longPut,
      shortCallStrike: built.plan.shortCall,
      longCallStrike: built.plan.longCall,
      contracts,
      entryCredit: built.credit,
      entryTimestamp: new Date().toISOString(),
      currentValue: null,
      status: 'OPEN',
      closedAt: null,
      closingPnL: null,
    });
    const event = await persistence.recordEvent({
      positionId: position.id,
      kind: 'OPENED',
      marketSnapshot: snapshot,
      intent: { kind: 'Open', configId: config.id, expiration },
    });
    await persistence.recordOrder({
      positionId: position.id,
      positionEventId: event.id,
      intentId,
      request: built.payload,
      response: res.value,
      status: 'ACCEPTED',
      alpacaOrderId: res.value.id,
    });

    await telegram.send({
      kind: 'ENTRY_OPENED' as AlertKind,
      title: 'Iron Condor opened',
      ticker: config.symbol,
      positionId: position.id,
      intentId,
      body: `Short put ${built.plan.shortPut} / long put ${built.plan.longPut}, short call ${built.plan.shortCall} / long call ${built.plan.longCall}; ${contracts} contracts; credit ${built.credit}`,
    });

    return { positionId: position.id, intentId, accepted: true };
  }

  // Apply a list of intents to one position.
  async applyIntents(
    position: Position,
    intents: Intent[],
    snapshot: MarketSnapshot,
  ): Promise<void> {
    for (const intent of intents) {
      const intentId = randomUUID();
      if (intent.kind === 'CloseAll') {
        await this.closeAll(position, intent, intentId, snapshot);
      } else if (intent.kind === 'RollUntestedSide') {
        await this.roll(position, intent, intentId, snapshot);
      } else if (intent.kind === 'Reject') {
        logger.warn('execution', 'intent rejected', { positionId: position.id, reason: intent.reason });
      }
    }
  }

  private async closeAll(
    position: Position,
    intent: Extract<Intent, { kind: 'CloseAll' }>,
    intentId: string,
    snapshot: MarketSnapshot,
  ): Promise<void> {
    // Use current value as the limit price (cost-to-close).
    const limit = position.currentValue ?? '0.01';
    const payload = buildCloseOrder(position, limit);
    const eventKind =
      intent.reason === 'TAKE_PROFIT' ? 'TAKE_PROFIT_TRIGGERED' : intent.reason === 'STOP_LOSS' ? 'STOP_LOSS_TRIGGERED' : 'PANIC_CLOSED';

    const event = await persistence.recordEvent({
      positionId: position.id,
      kind: eventKind,
      marketSnapshot: snapshot,
      intent,
    });

    if (env.DRY_RUN) {
      await persistence.recordOrder({
        positionId: position.id,
        positionEventId: event.id,
        intentId,
        request: payload,
        response: null,
        status: 'PENDING',
      });
      logger.info('execution', 'dry-run close', { positionId: position.id, intentId });
      return;
    }

    const res = await alpaca.submitOrder(payload as unknown as Record<string, unknown>);
    await persistence.recordOrder({
      positionId: position.id,
      positionEventId: event.id,
      intentId,
      request: payload,
      response: res.ok ? res.value : null,
      status: res.ok ? 'ACCEPTED' : 'REJECTED',
      alpacaOrderId: res.ok ? res.value.id : null,
    });

    if (!res.ok) {
      await telegram.send({
        kind: 'BROKER_ERROR' as AlertKind,
        title: 'Close order rejected',
        ticker: position.symbol,
        positionId: position.id,
        intentId,
        body: res.error.message,
      });
      return;
    }

    // Close the position row (realized PnL = entry credit − close cost).
    const realized = Money.from(position.entryCredit).minus(Money.from(limit)).times(position.contracts * 100).toString();
    await persistence.closePosition(
      position.id,
      intent.reason === 'TAKE_PROFIT' ? 'TAKE_PROFIT' : intent.reason === 'STOP_LOSS' ? 'STOP_LOSS' : 'PANIC_CLOSED',
      realized,
    );
    await telegram.send({
      kind: (intent.reason === 'TAKE_PROFIT' ? 'TAKE_PROFIT' : intent.reason === 'STOP_LOSS' ? 'STOP_LOSS' : 'PANIC_CLOSE') as AlertKind,
      title: `Position closed: ${intent.reason}`,
      ticker: position.symbol,
      positionId: position.id,
      intentId,
      pnl: realized,
      body: `Closed at ${limit}; realized ${realized}`,
    });
  }

  private async roll(
    position: Position,
    intent: Extract<Intent, { kind: 'RollUntestedSide' }>,
    intentId: string,
    snapshot: MarketSnapshot,
  ): Promise<void> {
    // 1) Close the untested side (the side opposite to the threatened one).
    const untestedSide = intent.threatenedSide === 'put' ? 'call' : 'put';
    const closePayload = buildRollCloseLegs(position, untestedSide, '0.05');

    const event = await persistence.recordEvent({
      positionId: position.id,
      kind: 'UNTESTED_ROLL',
      marketSnapshot: snapshot,
      intent,
    });

    if (env.DRY_RUN) {
      await persistence.recordOrder({
        positionId: position.id,
        positionEventId: event.id,
        intentId,
        request: closePayload,
        response: null,
        status: 'PENDING',
      });
      logger.info('execution', 'dry-run roll (close leg)', { positionId: position.id, intentId });
      return;
    }

    const closeRes = await alpaca.submitOrder(closePayload as unknown as Record<string, unknown>);
    await persistence.recordOrder({
      positionId: position.id,
      positionEventId: event.id,
      intentId,
      request: closePayload,
      response: closeRes.ok ? closeRes.value : null,
      status: closeRes.ok ? 'ACCEPTED' : 'REJECTED',
      alpacaOrderId: closeRes.ok ? closeRes.value.id : null,
    });
    if (!closeRes.ok) {
      await telegram.send({
        kind: 'BROKER_ERROR' as AlertKind,
        title: 'Roll close leg rejected — position untouched',
        ticker: position.symbol,
        positionId: position.id,
        intentId,
        body: closeRes.error.message,
      });
      return; // guardrail: leave position untouched on close failure
    }

    // 2) Open the new spread on the threatened side at recomputed strikes.
    const openPayload = buildRollOpenLegs(position, intent.threatenedSide, intent.newShortStrike, intent.newLongStrike, '0.20');
    const openRes = await alpaca.submitOrder(openPayload as unknown as Record<string, unknown>);
    await persistence.recordOrder({
      positionId: position.id,
      positionEventId: null,
      intentId,
      request: openPayload,
      response: openRes.ok ? openRes.value : null,
      status: openRes.ok ? 'ACCEPTED' : 'REJECTED',
      alpacaOrderId: openRes.ok ? openRes.value.id : null,
    });
    if (!openRes.ok) {
      await telegram.send({
        kind: 'BROKER_ERROR' as AlertKind,
        title: 'Roll open leg rejected',
        ticker: position.symbol,
        positionId: position.id,
        intentId,
        body: openRes.error.message,
      });
      return;
    }

    await persistence.recordEvent({
      positionId: position.id,
      kind: 'ROLL_EXECUTED',
      marketSnapshot: snapshot,
      intent,
    });
    await telegram.send({
      kind: 'UNTESTED_ROLL' as AlertKind,
      title: 'Untested-side roll executed',
      ticker: position.symbol,
      positionId: position.id,
      intentId,
      body: `Rolled ${untestedSide} side; opened new ${intent.threatenedSide} spread ${intent.newShortStrike}/${intent.newLongStrike}`,
    });
  }

  private async failOpen(
    intentId: string,
    config: TickerConfig,
    _reason: string,
    message: string,
  ): Promise<void> {
    await persistence.recordEvent({
      positionId: 'dry-run',
      kind: 'OPEN_REJECTED',
      marketSnapshot: { ticker: config.symbol },
      intent: { kind: 'Reject', reason: 'MARGIN_INSUFFICIENT' },
    });
    logger.error('execution', 'open failed', { ticker: config.symbol, intentId, message });
    await telegram.send({
      kind: _reason === 'MARGIN_INSUFFICIENT' ? ('MARGIN_SHORTFALL' as AlertKind) : ('BROKER_ERROR' as AlertKind),
      title: 'Entry rejected',
      ticker: config.symbol,
      intentId,
      body: message,
    });
  }

  // Margin pre-flight exposure (used by tests).
  static preflight = marginPreflight;
  static worstCaseLoss = worstCaseLoss;
}

export const execution = new ExecutionService();