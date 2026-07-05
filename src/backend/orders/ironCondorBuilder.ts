import { Money } from '@/types/money';
import type { Position, TickerConfig, OptionQuote, MarketSnapshot } from '@/types/domain';
import { logger } from '@/backend/services/structuredLogger';

// Opening Iron Condor: single atomic mleg order, 4 legs, credit-priced.
// All math goes through the Money helper (Constitution Principle I).

export type IronCondorOrder = {
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: 'limit';
  time_in_force: 'day';
  order_class: 'mleg';
  limit_price: string;
  legs: { symbol: string; side: 'buy' | 'sell'; ratio_qty: string }[];
};

export type StrikePlan = {
  expiration: string;
  shortPut: string;
  longPut: string;
  shortCall: string;
  longCall: string;
  contracts: number;
};

/**
 * Pick strikes for the opening combo.
 * Strikes come from `snapshot.quotes` filtered to `expiration`, sorted by
 * delta proximity to the configured target. Falls back to a +/-1 width
 * walk from the underlying if no delta-tagged quotes are available.
 */
export function planStrikes(
  config: TickerConfig,
  snapshot: MarketSnapshot,
  expiration: string,
  contracts: number,
): StrikePlan {
  const target = Money.from(config.targetDelta).abs();
  const width = Money.from(config.widthOfSpread);
  // OSI symbols embed YYMMDD (e.g. SPY260710P…); derive that suffix.
  const iso = expiration.slice(0, 10); // YYYY-MM-DD
  const yy = iso.slice(2, 4);
  const dd = iso.slice(8, 10);
  const mm = iso.slice(5, 7);
  const osiDateFragment = `${yy}${mm}${dd}`;

  const puts = snapshot.quotes.filter((q) => q.side === 'put' && q.symbol.includes(osiDateFragment));
  const calls = snapshot.quotes.filter((q) => q.side === 'call' && q.symbol.includes(osiDateFragment));

  const pickShort = (quotes: OptionQuote[]): Money => {
    let best: OptionQuote | null = null;
    let bestDiff = Infinity;
    for (const q of quotes) {
      if (q.delta == null) continue;
      const d = Money.from(q.delta).abs();
      const diff = d.minus(target).abs().toNumber();
      if (diff < bestDiff) {
        bestDiff = diff;
        best = q;
      }
    }
    if (best) return Money.from(best.strike);
    // fallback: widthOfSpread away from underlying on each side
    const px = Money.from(snapshot.underlyingPrice);
    return px.minus(width);
  };

  const pickShortCall = (quotes: OptionQuote[]): Money => {
    let best: OptionQuote | null = null;
    let bestDiff = Infinity;
    for (const q of quotes) {
      if (q.delta == null) continue;
      const d = Money.from(q.delta).abs();
      const diff = d.minus(target).abs().toNumber();
      if (diff < bestDiff) {
        bestDiff = diff;
        best = q;
      }
    }
    if (best) return Money.from(best.strike);
    const px = Money.from(snapshot.underlyingPrice);
    return px.plus(width);
  };

  const shortPut = pickShort(puts);
  const shortCall = pickShortCall(calls);
  const longPut = shortPut.minus(width);
  const longCall = shortCall.plus(width);

  return {
    expiration,
    shortPut: shortPut.toString(),
    longPut: longPut.toString(),
    shortCall: shortCall.toString(),
    longCall: longCall.toString(),
    contracts,
  };
}

/**
 * Compute the net credit per contract: (sell put + sell call) − (buy put + buy call).
 * Per-share values, multiplied by 100 once for a single contract.
 */
export function computeNetCredit(plan: StrikePlan, quotes: OptionQuote[]): Money {
  const iso = plan.expiration.slice(0, 10);
  const yy = iso.slice(2, 4);
  const dd = iso.slice(8, 10);
  const mm = iso.slice(5, 7);
  const osiDateFragment = `${yy}${mm}${dd}`;
  const find = (side: 'put' | 'call', strike: string): Money => {
    const q = quotes.find((x) => x.side === side && x.symbol.includes(osiDateFragment) && x.strike === strike);
    if (!q) {
      logger.warn('orders', 'no quote for leg; using 0 credit', { side, strike });
      return Money.zero();
    }
    // mid price is conservative
    return Money.from(q.bid).plus(Money.from(q.ask)).div(Money.from('2'));
  };

  const shortPut = find('put', plan.shortPut);
  const longPut = find('put', plan.longPut);
  const shortCall = find('call', plan.shortCall);
  const longCall = find('call', plan.longCall);

  // We are sellers on the short strikes and buyers on the long strikes.
  // net credit = shortPut + shortCall − longPut − longCall
  return shortPut.plus(shortCall).minus(longPut).minus(longCall).mul(Money.from('100'));
}

/**
 * Build the opening mleg payload matching contracts/alpaca-orders.md.
 * `osi` for each leg is produced from the OSI factory function.
 */
export function buildOpenOrder(
  config: TickerConfig,
  snapshot: MarketSnapshot,
  expiration: string,
  contracts: number,
  osiBuilder: (side: 'put' | 'call', strike: string, expiration: string, symbol: string) => string = defaultOsi,
): { payload: IronCondorOrder; plan: StrikePlan; credit: string } {
  const plan = planStrikes(config, snapshot, expiration, contracts);
  const credit = computeNetCredit(plan, snapshot.quotes).toString();

  const symbol = config.symbol;
  const legs = [
    { symbol: osiBuilder('put', plan.shortPut, expiration, symbol), side: 'sell' as const, ratio_qty: '1' },
    { symbol: osiBuilder('put', plan.longPut, expiration, symbol), side: 'buy' as const, ratio_qty: '1' },
    { symbol: osiBuilder('call', plan.shortCall, expiration, symbol), side: 'sell' as const, ratio_qty: '1' },
    { symbol: osiBuilder('call', plan.longCall, expiration, symbol), side: 'buy' as const, ratio_qty: '1' },
  ];

  return {
    plan,
    credit,
    payload: {
      symbol,
      qty: contracts.toString(),
      side: 'buy',
      type: 'limit',
      time_in_force: 'day',
      order_class: 'mleg',
      limit_price: credit,
      legs,
    },
  };
}

/** Produce an OSI-style option symbol: SPY  YYMMDD  P  00430000 → SPY250710P00430000 */
export function defaultOsi(
  side: 'put' | 'call',
  strike: string,
  expiration: string, // YYYY-MM-DD
  symbol: string,
): string {
  const [yyyy, mm, dd] = expiration.split('-');
  if (!yyyy || !mm || !dd) {
    throw new Error(`defaultOsi: invalid expiration "${expiration}"`);
  }
  const yy = yyyy.slice(2);
  const pad = (n: string) => n.padStart(2, '0');
  // Alpaca uses 8-digit strike price × 1000. Strikes here are integers in USD.
  const strikeInt = Math.round(parseFloat(strike) * 1000).toString().padStart(8, '0');
  return `${symbol}${yy}${pad(mm)}${pad(dd)}${side === 'put' ? 'P' : 'C'}${strikeInt}`;
}

export function planFromPosition(p: Position): StrikePlan {
  return {
    expiration: p.expiration,
    shortPut: p.shortPutStrike,
    longPut: p.longPutStrike,
    shortCall: p.shortCallStrike,
    longCall: p.longCallStrike,
    contracts: p.contracts,
  };
}