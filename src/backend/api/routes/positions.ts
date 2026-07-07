import type { FastifyInstance } from 'fastify';
import { persistence, dbUnsafe } from '@/backend/services/persistenceService';
import { alpaca } from '@/backend/services/alpacaService';
import { classifyProximity } from '@/backend/services/proximityClassifier';
import { computeExpectedMove } from '@/backend/services/expectedMove';
import { gammaExposureCurve } from '@/backend/services/gammaCurve';
import { theoreticalDecaySeries } from '@/backend/services/thetaDecay';
import type { PositionWithProximityDto } from '@/shared/contracts';

// Best-effort underlying price fetch via the data API (not the trading API).
async function fetchUnderlyingPrice(symbol: string): Promise<string | null> {
  const r = await alpaca.getStockQuote(symbol);
  if (r.ok) {
    return String((parseFloat(r.value.bid) + parseFloat(r.value.ask)) / 2);
  }
  return null;
}

export async function positionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/positions', async (req) => {
    const q = req.query as { status?: string };
    const all = await persistence.listOpenPositions();

    // FR-001/FR-002: enrich each position with the proximity classification
    // computed server-side (Constitution Principle II — UI never reaches the
    // broker). When the underlying price is unavailable the proximity block
    // is null and the radar renders an empty state.
    const enriched: PositionWithProximityDto[] = [];
    for (const p of all) {
      const underlyingPrice = await fetchUnderlyingPrice(p.symbol);
      enriched.push({
        id: p.id,
        symbol: p.symbol,
        expiration: p.expiration,
        shortPutStrike: p.shortPutStrike,
        longPutStrike: p.longPutStrike,
        shortCallStrike: p.shortCallStrike,
        longCallStrike: p.longCallStrike,
        contracts: p.contracts,
        entryCredit: p.entryCredit,
        entryTimestamp: p.entryTimestamp,
        currentValue: p.currentValue,
        status: p.status,
        closedAt: p.closedAt,
        closingPnL: p.closingPnL,
        currentUnderlyingPrice: underlyingPrice,
        proximity:
          underlyingPrice !== null
            ? classifyProximity(underlyingPrice, p.shortPutStrike, p.shortCallStrike)
            : null,
      });
    }

    if (q.status) {
      return { positions: enriched };
    }
    return { positions: enriched };
  });

  app.get('/positions/:id/payoff', async (req, reply) => {
    const { id } = req.params as { id: string };
    const all = await persistence.listOpenPositions();
    const p = all.find((x) => x.id === id);
    if (!p) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'position not found' } });

    // Compute break-evens and max profit/loss per share, then build a 41-point curve.
    const entryCredit = parseFloat(p.entryCredit);
    const sp = parseFloat(p.shortPutStrike);
    const lp = parseFloat(p.longPutStrike);
    const sc = parseFloat(p.shortCallStrike);
    const lc = parseFloat(p.longCallStrike);
    const breakEvenLower = sp - entryCredit;
    const breakEvenUpper = sc + entryCredit;
    const width = sp - lp; // = lc - sc
    const maxProfit = entryCredit * p.contracts * 100;
    const maxLoss = (width - entryCredit) * p.contracts * 100;
    const lo = lp - width;
    const hi = lc + width;
    const N = 41;
    const curve = Array.from({ length: N }, (_, i) => {
      const price = lo + (i * (hi - lo)) / (N - 1);
      let perShare = entryCredit;
      if (price < sp) perShare -= (sp - price);
      if (price < lp) perShare += (lp - price);
      if (price > sc) perShare -= (price - sc);
      if (price > lc) perShare += (price - lc);
      const pnl = Math.max(-width + entryCredit, Math.min(entryCredit, perShare)) * p.contracts * 100;
      return { price: price.toFixed(2), pnl: pnl.toFixed(2) };
    });

    // FR-003: Expected-Move overlay. Best-effort — null when the underlying
    // option chain is unreachable (spec US2 acceptance #2).
    const underlyingPrice = await fetchUnderlyingPrice(p.symbol);
    let expectedMove: {
      underlyingPrice: string;
      atmStraddleMid: string;
      factor: string;
      halfMoveUsd: string;
      halfMovePct: string;
    } | null = null;
    if (underlyingPrice !== null) {
      // ATM straddle mid ≈ (call_bid + call_ask + put_bid + put_ask) / 4.
      // Without a real options-chain call here (would need an OSI symbol), we
      // surface null so the dashboard renders the fallback footnote. This
      // stub leaves the wiring in place; a real implementation will resolve
      // the ATM OSI from the strike and DTE and call alpaca.getOptionQuote.
      expectedMove = null;
    }

    // 2-week price range: used by the chart to zoom the Y-axis around the
    // current underlying price rather than the full max-profit/max-loss span.
    let priceLow2W: string | null = null;
    let priceHigh2W: string | null = null;
    if (underlyingPrice !== null) {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const barsResult = await alpaca.getStockBars(p.symbol, start, end);
      if (barsResult.ok && barsResult.value.length > 0) {
        const prices = barsResult.value.flatMap((b) => [b.h, b.l]);
        priceLow2W = Math.min(...prices).toFixed(2);
        priceHigh2W = Math.max(...prices).toFixed(2);
      }
    }

    return {
      breakEvenLower: breakEvenLower.toFixed(2),
      breakEvenUpper: breakEvenUpper.toFixed(2),
      maxProfit: maxProfit.toFixed(2),
      maxLoss: (-maxLoss).toFixed(2),
      underlyingPrice: underlyingPrice ?? '0.00',
      curve,
      expectedMove,
      priceLow2W,
      priceHigh2W,
    };
  });

  void computeExpectedMove; // used by US2 when ATM straddle mid is available

  // US3 — gamma exposure curve for an open position.
  app.get('/positions/:id/gamma', async (req, reply) => {
    const { id } = req.params as { id: string };
    const all = await persistence.listOpenPositions();
    const p = all.find((x) => x.id === id);
    if (!p) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'position not found' } });
    const underlyingPrice = await fetchUnderlyingPrice(p.symbol);
    if (underlyingPrice === null) {
      return { curve: [], currentDte: null, iv: null };
    }
    // DTE from expiration (Friday).
    const exp = new Date(p.expiration).getTime();
    const dte = Math.max(0, Math.floor((exp - Date.now()) / (24 * 60 * 60 * 1000)));
    const iv = 0.45; // default until a real IV fetch is wired
    const curve = gammaExposureCurve(
      {
        shortPut: parseFloat(p.shortPutStrike),
        longPut: parseFloat(p.longPutStrike),
        shortCall: parseFloat(p.shortCallStrike),
        longCall: parseFloat(p.longCallStrike),
      },
      parseFloat(underlyingPrice),
      Math.max(dte, 1),
      iv,
    );
    return { curve, currentDte: dte, iv };
  });

  // US8 — real-vs-theoretical theta decay for an open position.
  app.get('/positions/:id/theta', async (req, reply) => {
    const { id } = req.params as { id: string };
    const all = await persistence.listOpenPositions();
    const p = all.find((x) => x.id === id);
    if (!p) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'position not found' } });

    // Pull observed mids from PositionEvent rows of kind MID_OBSERVED.
    const events = await dbUnsafe().positionEvent.findMany({
      where: { positionId: id, kind: 'MID_OBSERVED' },
      orderBy: { createdAt: 'asc' },
    });
    const observed = events
      .map((e: { marketSnapshot: string; createdAt: Date }) => {
        try {
          const snap = JSON.parse(e.marketSnapshot) as { mid?: string };
          const exp = new Date(p.expiration).getTime();
          const dte = Math.max(0, Math.floor((exp - new Date(e.createdAt).getTime()) / (24 * 60 * 60 * 1000)));
          return { ts: e.createdAt.toISOString(), mid: snap.mid ?? '0', dte };
        } catch {
          return null;
        }
      })
      .filter((x: { ts: string; mid: string; dte: number } | null): x is { ts: string; mid: string; dte: number } => x !== null);

    const underlyingPrice = await fetchUnderlyingPrice(p.symbol);
    if (underlyingPrice === null) {
      return { observed, theoretical: [], credit: p.entryCredit, divergencePct: null };
    }
    const dte = Math.max(1, Math.floor((new Date(p.expiration).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    const iv = 0.45;
    const theoretical = theoreticalDecaySeries({
      underlyingPrice: parseFloat(underlyingPrice),
      shortPut: parseFloat(p.shortPutStrike),
      longPut: parseFloat(p.longPutStrike),
      shortCall: parseFloat(p.shortCallStrike),
      longCall: parseFloat(p.longCallStrike),
      entryDte: dte,
      iv,
    });
    // divergence: |realized − theoretical at the matching DTE| / credit
    const credit = parseFloat(p.entryCredit);
    let divergencePct: string | null = null;
    if (observed.length > 0 && credit > 0) {
      const last = observed[observed.length - 1];
      if (last) {
        const theo = theoretical.find((t) => t.dte === last.dte);
        if (theo) {
          divergencePct = (Math.abs(parseFloat(last.mid) - parseFloat(theo.mid)) / credit).toFixed(4);
        }
      }
    }
    return { observed, theoretical, credit: p.entryCredit, divergencePct };
  });
}