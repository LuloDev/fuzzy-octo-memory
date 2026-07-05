import type { FastifyInstance } from 'fastify';
import { persistence } from '@/backend/services/persistenceService';

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async () => {
    const positions = await persistence.listOpenPositions();
    let realized = 0;
    let unrealized = 0;
    let maxProfit = 0;
    let maxRisk = 0;
    const dailyPnL: Record<string, string> = {};
    for (const p of positions) {
      const credit = parseFloat(p.entryCredit);
      const width = parseFloat(p.shortPutStrike) - parseFloat(p.longPutStrike);
      maxProfit += credit * p.contracts * 100;
      maxRisk += (width - credit) * p.contracts * 100;
      if (p.closingPnL) realized += parseFloat(p.closingPnL);
      if (p.currentValue) {
        // unrealized = (entry credit − current value) × contracts × 100
        unrealized += (credit - parseFloat(p.currentValue)) * p.contracts * 100;
      }
      dailyPnL[p.symbol] = (dailyPnL[p.symbol] ?? '0');
    }
    return {
      realizedPnL: realized.toFixed(2),
      unrealizedPnL: unrealized.toFixed(2),
      projectedMaxProfit: maxProfit.toFixed(2),
      maxRisk: (-maxRisk).toFixed(2),
      marginUsed: '0.00', // wired from AlpacaService.getAccount() in a real deployment
      marginFree: '0.00',
      dailyPnL,
    };
  });
}