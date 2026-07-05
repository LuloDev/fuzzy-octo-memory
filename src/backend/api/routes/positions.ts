import type { FastifyInstance } from 'fastify';
import { persistence } from '@/backend/services/persistenceService';

export async function positionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/positions', async (req) => {
    const q = req.query as { status?: string };
    const all = await persistence.listOpenPositions();
    if (q.status) {
      // listOpenPositions already filters OPEN; allow future filter expansion.
      return { positions: all };
    }
    return { positions: all };
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
    return {
      breakEvenLower: breakEvenLower.toFixed(2),
      breakEvenUpper: breakEvenUpper.toFixed(2),
      maxProfit: maxProfit.toFixed(2),
      maxLoss: (-maxLoss).toFixed(2),
      underlyingPrice: '0.00', // wired from the latest snapshot in a real deployment
      curve,
    };
  });
}