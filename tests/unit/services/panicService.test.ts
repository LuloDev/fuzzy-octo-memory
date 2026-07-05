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
    // Original opening was: sell short put, buy long put, sell short call, buy long call
    // Panic reverses every direction.
    expect(o.legs[0]?.side).toBe('buy'); // was sell short put
    expect(o.legs[1]?.side).toBe('sell'); // was buy long put
    expect(o.legs[2]?.side).toBe('buy'); // was sell short call
    expect(o.legs[3]?.side).toBe('sell'); // was buy long call
  });
});