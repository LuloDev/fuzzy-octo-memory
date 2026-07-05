import type { FastifyInstance } from 'fastify';
import { persistence } from '@/backend/services/persistenceService';

export async function equityCurveRoutes(app: FastifyInstance): Promise<void> {
  app.get('/equity-curve', async (req) => {
    const q = req.query as { days?: string };
    const days = Math.min(365, Math.max(1, parseInt(q.days ?? '30', 10)));
    const rows = await persistence.readDailyPnL(days);
    const series = rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      equity: '0.00', // wired from account.last_equity in a real deployment
      pnl: r.realized,
    }));
    return { series };
  });
}