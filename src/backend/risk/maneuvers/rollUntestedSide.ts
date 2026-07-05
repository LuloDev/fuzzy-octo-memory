import { Money } from '@/types/money';
import type { Intent, Position, TickerConfig, MarketSnapshot, OptionQuote } from '@/types/domain';

// Untested-side roll (passive defense):
// If the underlying is within 1% of one short strike while the opposite
// side is still untested, close the opposite spread and open a new spread
// on the threatened side at the configured target delta.
//
// Pure function: returns Intent[] — never orders anything itself.

const ROLL_PROXIMITY = '0.01'; // 1%

function withinOnePercent(price: Money, strike: Money): boolean {
  // |price - strike| / strike <= 0.01
  const diff = price.minus(strike).abs();
  const ratio = diff.div(strike);
  return ratio.lte(Money.from(ROLL_PROXIMITY));
}

// Find the option quote whose |delta| is closest to the configured targetDelta,
// and return its strike (and the strike `widthOfSpread` away for the long leg).
function pickStrikesByDelta(
  quotes: OptionQuote[],
  targetDelta: string,
  widthOfSpread: string,
  side: 'put' | 'call',
): { newShortStrike: string; newLongStrike: string } | null {
  const target = Money.from(targetDelta).abs();
  const width = Money.from(widthOfSpread);
  let best: OptionQuote | null = null;
  let bestDiff = Infinity;
  for (const q of quotes) {
    if (q.side !== side) continue;
    if (q.delta == null) continue;
    const d = Money.from(q.delta).abs();
    const diff = d.minus(target).abs().toNumber();
    if (diff < bestDiff) {
      bestDiff = diff;
      best = q;
    }
  }
  if (!best) return null;
  const short = Money.from(best.strike);
  const long = side === 'put' ? short.minus(width) : short.plus(width);
  return { newShortStrike: short.toString(), newLongStrike: long.toString() };
}

// Fallback when no delta-tagged quotes exist: re-use the existing threatened
// short strike shifted by one strike-width outward.
function fallbackStrikes(
  position: Position,
  side: 'put' | 'call',
  config: TickerConfig,
): { newShortStrike: string; newLongStrike: string } {
  const width = Money.from(config.widthOfSpread);
  if (side === 'put') {
    const newShort = Money.from(position.shortPutStrike).minus(width);
    const newLong = newShort.minus(width);
    return { newShortStrike: newShort.toString(), newLongStrike: newLong.toString() };
  }
  const newShort = Money.from(position.shortCallStrike).plus(width);
  const newLong = newShort.plus(width);
  return { newShortStrike: newShort.toString(), newLongStrike: newLong.toString() };
}

export function evaluateRollUntestedSide(
  position: Position,
  snapshot: MarketSnapshot,
  config: TickerConfig,
): Intent[] {
  if (!config.automaticManeuversEnabled) return [];
  if (position.status !== 'OPEN') return [];

  const px = Money.from(snapshot.underlyingPrice);
  const shortPut = Money.from(position.shortPutStrike);
  const shortCall = Money.from(position.shortCallStrike);

  const putThreatened = withinOnePercent(px, shortPut) && px.lt(shortPut);
  const callThreatened = withinOnePercent(px, shortCall) && px.gt(shortCall);

  // The side being threatened determines which side we re-defend.
  if (!putThreatened && !callThreatened) return [];

  const side: 'put' | 'call' = putThreatened ? 'put' : 'call';

  const picked =
    pickStrikesByDelta(snapshot.quotes, config.targetDelta, config.widthOfSpread, side) ??
    fallbackStrikes(position, side, config);

  return [
    {
      kind: 'RollUntestedSide',
      positionId: position.id,
      threatenedSide: side,
      newShortStrike: picked.newShortStrike,
      newLongStrike: picked.newLongStrike,
    },
  ];
}