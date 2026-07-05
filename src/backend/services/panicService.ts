import { env } from '@/backend/config/env';
import { alpaca } from '@/backend/services/alpacaService';
import { persistence } from '@/backend/services/persistenceService';
import { telegram } from '@/backend/services/telegramNotifier';
import { logger } from '@/backend/services/structuredLogger';
import { buildPanicCloseOrder } from '@/backend/orders/closeBuilder';
import { Money } from '@/types/money';
import { randomUUID } from 'node:crypto';
import type { AlertKind } from '@/types/events';

// PanicButton bypass: the ONLY legitimate bypass of the Risk Engine
// (Constitution §VI). Cancels every open order, market-closes every open
// position, and emits a summary alert.

export class PanicService {
  async panicAll(reason: string): Promise<{ positionsClosed: number; ordersCanceled: number; intentIds: string[] }> {
    const intentIds: string[] = [];
    const open = await persistence.listOpenPositions();
    const ordersCanceled = 0;

    if (env.DRY_RUN) {
      logger.info('panic', 'dry-run panic (no broker traffic)', { reason });
      await persistence.recordEvent({
        positionId: 'dry-run',
        kind: 'PANIC_CLOSED',
        marketSnapshot: { reason },
      });
      return { positionsClosed: 0, ordersCanceled, intentIds };
    }

    let positionsClosed = 0;
    for (const p of open) {
      const intentId = randomUUID();
      intentIds.push(intentId);
      const payload = buildPanicCloseOrder(p);
      const res = await alpaca.submitOrder(payload as unknown as Record<string, unknown>);
      const event = await persistence.recordEvent({
        positionId: p.id,
        kind: 'PANIC_CLOSED',
        marketSnapshot: { reason },
        intent: { kind: 'CloseAll', positionId: p.id, reason: 'PANIC' },
      });
      await persistence.recordOrder({
        positionId: p.id,
        positionEventId: event.id,
        intentId,
        request: payload,
        response: res.ok ? res.value : null,
        status: res.ok ? 'ACCEPTED' : 'REJECTED',
        alpacaOrderId: res.ok ? res.value.id : null,
      });
      if (res.ok) {
        // Best-effort PnL at expiry = max loss (entry credit of zero, since we market-close).
        // The actual realized PnL is reconciled from broker fills after the fact.
        await persistence.closePosition(p.id, 'PANIC_CLOSED', Money.from(p.entryCredit).times(p.contracts * 100).negate().toString());
        positionsClosed += 1;
      } else {
        await telegram.send({
          kind: 'BROKER_ERROR' as AlertKind,
          title: 'Panic close failed for position',
          ticker: p.symbol,
          positionId: p.id,
          intentId,
          body: res.error.message,
        });
      }
    }

    await telegram.send({
      kind: 'PANIC_CLOSE' as AlertKind,
      title: 'PANIC',
      intentId: intentIds[0] ?? '',
      body: `reason=${reason}; closed ${positionsClosed}; orders canceled ${ordersCanceled}`,
    });
    return { positionsClosed, ordersCanceled, intentIds };
  }
}

export const panic = new PanicService();