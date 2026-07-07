import { describe, it, expect } from 'vitest';
import { buildPanicCloseOrder } from '@/backend/orders/closeBuilder';
import type { Position } from '@/types/domain';

// Panic service's order-building path. We test the pure helper here; the
// integration test wires the panic service against a fake broker + DB.

function position(): Position {
  return {
    id: 'p1', symbol: 'SPY', expiration: '2026-07-10T00:00:00.000Z',
    shortPutStrike: '430', longPutStrike: '428',
    shortCallStrike: '438', longCallStrike: '440',
    contracts: 1, entryCredit: '1.00',
    entryTimestamp: '2026-07-01T00:00:00.000Z',
    currentValue: '0.50', status: 'OPEN',
    closedAt: null, closingPnL: null,
  };
}

describe('buildPanicCloseOrder', () => {
  it('reverses every leg direction and uses market type (no limit_price)', () => {
    const o = buildPanicCloseOrder(position());
    expect(o.type).toBe('market');
    expect(o.order_class).toBe('mleg');
    expect('limit_price' in o).toBe(false);
    expect(o.legs).toHaveLength(4);
    // Legs ordered: calls first, puts second; short before long.
    // Opening: shortCall(sell_to_open), longCall(buy_to_open), shortPut(sell_to_open), longPut(buy_to_open)
    // Close reverses every direction.
    expect(o.legs[0]?.side).toBe('buy');  // buy_to_close short call
    expect(o.legs[0]?.position_intent).toBe('buy_to_close');
    expect(o.legs[1]?.side).toBe('sell'); // sell_to_close long call
    expect(o.legs[1]?.position_intent).toBe('sell_to_close');
    expect(o.legs[2]?.side).toBe('buy');  // buy_to_close short put
    expect(o.legs[2]?.position_intent).toBe('buy_to_close');
    expect(o.legs[3]?.side).toBe('sell'); // sell_to_close long put
    expect(o.legs[3]?.position_intent).toBe('sell_to_close');
  });
});