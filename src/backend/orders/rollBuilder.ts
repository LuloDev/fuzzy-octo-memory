import type { IronCondorOrder } from './ironCondorBuilder';
import { defaultOsi } from './ironCondorBuilder';
import type { Position } from '@/types/domain';
import { Money } from '@/types/money';

// A roll is two coordinated 2-leg mleg orders: close the untested side for
// a gain, then open a new spread on the threatened side.

export type RollLegs = {
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: 'limit';
  time_in_force: 'day';
  order_class: 'mleg';
  limit_price: string;
  legs: { symbol: string; side: 'buy' | 'sell'; ratio_qty: string }[];
};

// Close the untested-side spread (two legs only). Per the spec, this is a
// gain — so we use a limit price of "0.01" (whatever the current mark is)
// in the builder; the executor supplies the actual mark from the snapshot.
export function buildRollCloseLegs(
  position: Position,
  side: 'put' | 'call',
  limitPrice: string,
): RollLegs {
  const symbol = position.symbol;
  const exp = position.expiration;
  const contracts = position.contracts.toString();
  if (side === 'call') {
    return {
      symbol,
      qty: contracts,
      side: 'buy',
      type: 'limit',
      time_in_force: 'day',
      order_class: 'mleg',
      limit_price: limitPrice,
      legs: [
        { symbol: defaultOsi('call', position.shortCallStrike, exp, symbol), side: 'buy', ratio_qty: '1' },
        { symbol: defaultOsi('call', position.longCallStrike, exp, symbol), side: 'sell', ratio_qty: '1' },
      ],
    };
  }
  // put side
  return {
    symbol,
    qty: contracts,
    side: 'buy',
    type: 'limit',
    time_in_force: 'day',
    order_class: 'mleg',
    limit_price: limitPrice,
    legs: [
      { symbol: defaultOsi('put', position.shortPutStrike, exp, symbol), side: 'buy', ratio_qty: '1' },
      { symbol: defaultOsi('put', position.longPutStrike, exp, symbol), side: 'sell', ratio_qty: '1' },
    ],
  };
}

// Open a new spread on the threatened side at the recomputed strikes.
export function buildRollOpenLegs(
  position: Position,
  side: 'put' | 'call',
  newShortStrike: string,
  newLongStrike: string,
  credit: string,
): IronCondorOrder {
  const symbol = position.symbol;
  const exp = position.expiration;
  return {
    symbol,
    qty: position.contracts.toString(),
    side: 'buy',
    type: 'limit',
    time_in_force: 'day',
    order_class: 'mleg',
    limit_price: credit,
    legs: [
      { symbol: defaultOsi(side, newLongStrike, exp, symbol), side: 'buy', ratio_qty: '1' },
      { symbol: defaultOsi(side, newShortStrike, exp, symbol), side: 'sell', ratio_qty: '1' },
    ],
  };
}

// Quick helper to summarize credits/debits in a roll.
export function rollNetCost(openCredit: string, closeCost: string): Money {
  return Money.from(openCredit).minus(Money.from(closeCost));
}