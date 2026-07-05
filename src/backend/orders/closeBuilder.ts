import type { IronCondorOrder } from './ironCondorBuilder';
import { planFromPosition, defaultOsi } from './ironCondorBuilder';
import type { Position } from '@/types/domain';

// Build the closing mleg payload for a full Iron Condor (take-profit, stop-loss, panic).
// Reverses the direction of each leg vs the opening order.
export function buildCloseOrder(position: Position, limitPrice: string): IronCondorOrder {
  const plan = planFromPosition(position);
  const symbol = position.symbol;
  const legs = [
    { symbol: defaultOsi('put', plan.shortPut, plan.expiration, symbol), side: 'buy' as const, ratio_qty: '1' },
    { symbol: defaultOsi('put', plan.longPut, plan.expiration, symbol), side: 'sell' as const, ratio_qty: '1' },
    { symbol: defaultOsi('call', plan.shortCall, plan.expiration, symbol), side: 'buy' as const, ratio_qty: '1' },
    { symbol: defaultOsi('call', plan.longCall, plan.expiration, symbol), side: 'sell' as const, ratio_qty: '1' },
  ];
  return {
    symbol,
    qty: position.contracts.toString(),
    side: 'sell',
    type: 'limit',
    time_in_force: 'day',
    order_class: 'mleg',
    limit_price: limitPrice,
    legs,
  };
}

// A market-class closing payload used by Panic (no limit_price).
export type MarketMleg = Omit<IronCondorOrder, 'limit_price' | 'type'> & { type: 'market' };

export function buildPanicCloseOrder(position: Position): MarketMleg {
  const plan = planFromPosition(position);
  const symbol = position.symbol;
  const legs = [
    { symbol: defaultOsi('put', plan.shortPut, plan.expiration, symbol), side: 'buy' as const, ratio_qty: '1' },
    { symbol: defaultOsi('put', plan.longPut, plan.expiration, symbol), side: 'sell' as const, ratio_qty: '1' },
    { symbol: defaultOsi('call', plan.shortCall, plan.expiration, symbol), side: 'buy' as const, ratio_qty: '1' },
    { symbol: defaultOsi('call', plan.longCall, plan.expiration, symbol), side: 'sell' as const, ratio_qty: '1' },
  ];
  return {
    symbol,
    qty: position.contracts.toString(),
    side: 'sell',
    type: 'market',
    time_in_force: 'day',
    order_class: 'mleg',
    legs,
  };
}