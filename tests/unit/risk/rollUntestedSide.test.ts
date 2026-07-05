import { describe, it, expect } from 'vitest';
import { evaluateRollUntestedSide } from '@/backend/risk/maneuvers/rollUntestedSide';
import type { Position, TickerConfig, MarketSnapshot, OptionQuote } from '@/types/domain';

const _optionQuoteFields: OptionQuote = {
  symbol: '', side: 'put', strike: '0', bid: '0', ask: '0', quotedAt: 't',
};
void _optionQuoteFields;

function position(over: Partial<Position> = {}): Position {
  return {
    id: 'p1', symbol: 'SPY', expiration: '2026-07-10T00:00:00.000Z',
    shortPutStrike: '430', longPutStrike: '428',
    shortCallStrike: '438', longCallStrike: '440',
    contracts: 1, entryCredit: '1.00',
    entryTimestamp: '2026-07-01T00:00:00.000Z',
    currentValue: '0.50', status: 'OPEN',
    closedAt: null, closingPnL: null, ...over,
  };
}
function config(over: Partial<TickerConfig> = {}): TickerConfig {
  return {
    id: 'c1', symbol: 'SPY', enabled: true, automaticManeuversEnabled: true,
    allocationPercentage: '30', targetDelta: '0.12', widthOfSpread: '2.00',
    takeProfitPercentage: '0.50', stopLossMultiplier: '3.00',
    dailyLossLimit: '-0.03',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}
function snapshot(price: string, extra: OptionQuote[] = []): MarketSnapshot {
  return {
    symbol: 'SPY',
    underlyingPrice: price,
    quotes: extra,
    observedAt: '2026-07-02T00:00:00.000Z',
  };
}

describe('evaluateRollUntestedSide', () => {
  it('emits RollUntestedSide for put side when within 1% of short put strike', () => {
    // shortPut=430, underlying=427 → within ~0.7%
    const out = evaluateRollUntestedSide(position(), snapshot('427.00'), config());
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('RollUntestedSide');
    if (out[0]?.kind === 'RollUntestedSide') {
      expect(out[0].threatenedSide).toBe('put');
      expect(out[0].newShortStrike).toBeTruthy();
      expect(out[0].newLongStrike).toBeTruthy();
    }
  });

  it('emits RollUntestedSide for call side when within 1% of short call strike', () => {
    // shortCall=438, underlying=441 → within ~0.68%
    const out = evaluateRollUntestedSide(position(), snapshot('441.00'), config());
    expect(out[0]?.kind).toBe('RollUntestedSide');
    if (out[0]?.kind === 'RollUntestedSide') expect(out[0].threatenedSide).toBe('call');
  });

  it('returns [] when underlying is well outside both short strikes', () => {
    const out = evaluateRollUntestedSide(position(), snapshot('435.00'), config());
    expect(out).toEqual([]);
  });

  it('respects automaticManeuversEnabled = false', () => {
    const out = evaluateRollUntestedSide(
      position(),
      snapshot('427.00'),
      config({ automaticManeuversEnabled: false }),
    );
    expect(out).toEqual([]);
  });

  it('recomputed strikes honor targetDelta when matching quotes exist', () => {
    // delta=-0.12 quote exists near strike 426; expect new short to match that strike.
    const quotes: OptionQuote[] = [
      { symbol: 'SPY260710P00426000', side: 'put', strike: '426', bid: '1.00', ask: '1.10', quotedAt: '2026-07-02T00:00:00.000Z', delta: '-0.12' },
      { symbol: 'SPY260710P00424000', side: 'put', strike: '424', bid: '0.80', ask: '0.90', quotedAt: '2026-07-02T00:00:00.000Z', delta: '-0.10' },
    ];
    const out = evaluateRollUntestedSide(position(), snapshot('427.00', quotes), config({ targetDelta: '0.12' }));
    expect(out[0]?.kind).toBe('RollUntestedSide');
    if (out[0]?.kind === 'RollUntestedSide') {
      // picks the strike whose |delta| is closest to 0.12 with the same sign
      expect(out[0].newShortStrike).toBe('426');
      expect(out[0].newLongStrike).toBe('424');
    }
  });
});