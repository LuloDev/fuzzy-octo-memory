// US7 + US9 — Analytics endpoints. Slippage tracker + system performance
// statistics. All math is pure (see services/slippage.ts and
// services/performance.ts) so the endpoints are thin aggregators.

import type { FastifyInstance } from 'fastify';
import { persistence, dbUnsafe } from '@/backend/services/persistenceService';
import { computeSlippage, aggregateSlippage } from '@/backend/services/slippage';
import { computePerformanceAggregate } from '@/backend/services/performance';
import type { PerformanceWindow } from '@/shared/contracts';

const CLOSED_STATUSES = new Set(['TAKE_PROFIT', 'STOP_LOSS', 'ROLLED', 'PANIC_CLOSED']);

async function listClosedPositions(): Promise<
  Array<{
    id: string;
    symbol: string;
    status: string;
    contracts: number;
    entryCredit: string;
    closingPnL: string | null;
    closedAt: string | null;
  }>
> {
  // The persistence layer only exposes listOpenPositions; closed ones are
  // fetched directly via Prisma. This is read-only — no append/write.
  const rows = await dbUnsafe().position.findMany({
    where: { status: { in: Array.from(CLOSED_STATUSES) } },
    orderBy: { closedAt: 'desc' },
  });
  return rows.map((r: {
    id: string; symbol: string; status: string; contracts: number;
    entryCredit: { toString: () => string };
    closingPnL: { toString: () => string } | null;
    closedAt: Date | null;
  }) => ({
    id: r.id,
    symbol: r.symbol,
    status: r.status,
    contracts: r.contracts,
    entryCredit: r.entryCredit.toString(),
    closingPnL: r.closingPnL ? r.closingPnL.toString() : null,
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
  }));
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // US7 — slippage tracker.
  app.get('/metrics/slippage', async (req) => {
    const q = req.query as { days?: string };
    const days = q.days ? Number(q.days) : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const positions = await listClosedPositions();
    const rows = [];
    for (const p of positions) {
      if (p.closedAt && new Date(p.closedAt) < cutoff) continue;
      // Pull the opening order for this position; its request/response carries
      // the limit price (mid we sent) and the fill price.
      const orders = await dbUnsafe().orderSubmission.findMany({
        where: { positionId: p.id },
        orderBy: { submittedAt: 'asc' },
        take: 1,
      });
      const order = orders[0];
      let sent: string | null = null;
      let filled: string | null = null;
      if (order) {
        try {
          const reqPayload = JSON.parse(order.requestPayload) as { limit_price?: string };
          sent = reqPayload.limit_price ?? null;
        } catch {
          sent = null;
        }
        if (order.responsePayload) {
          try {
            const respPayload = JSON.parse(order.responsePayload) as { filled_avg_price?: string };
            filled = respPayload.filled_avg_price ?? null;
          } catch {
            filled = null;
          }
        }
      }
      rows.push(
        computeSlippage({
          positionId: p.id,
          symbol: p.symbol,
          contracts: p.contracts,
          sentLimitPrice: sent,
          filledAvgPrice: filled,
        }),
      );
    }

    const agg = aggregateSlippage(rows);
    return {
      rows,
      summary: {
        medianPerShare: agg.medianPerShare?.toString() ?? null,
        p90PerShare: agg.p90PerShare?.toString() ?? null,
        medianPerCombo: agg.medianPerCombo?.toString() ?? null,
        p90PerCombo: agg.p90PerCombo?.toString() ?? null,
        histogram: agg.histogram,
      },
      closedCount: rows.length,
    };
  });

  // US9 — performance statistics.
  app.get('/metrics/performance', async (req) => {
    const q = req.query as { window?: string };
    const window: PerformanceWindow = (q.window === '7d' || q.window === '30d' || q.window === '90d' || q.window === 'all')
      ? q.window
      : '30d';

    const closed = await listClosedPositions();
    const windowDays = window === 'all' ? Infinity : Number(window.replace('d', ''));
    const cutoff = window === 'all' ? new Date(0) : new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const inWindow = closed.filter((p) => p.closedAt && new Date(p.closedAt) >= cutoff);

    const agg = computePerformanceAggregate(
      inWindow.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        closingPnL: p.closingPnL,
        closedAt: p.closedAt,
      })),
      window,
    );

    // Persist the latest value so the next read is O(1) (FR-025).
    await persistence.setAppState(`performance_aggregate_${window}`, JSON.stringify(agg)).catch(() => {
      // best-effort; don't fail the read
    });

    return agg;
  });
}