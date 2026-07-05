import { Money } from '@/types/money';
import type { Intent, Position, TickerConfig, MarketSnapshot } from '@/types/domain';

// Take Profit: if currentValue <= entryCredit × takeProfitPercentage,
// close all four legs. Decimal-safe math (Constitution Principle I).
//
// Returns [] when no intent (Hold). Per Constitution Principle III the
// engine never throws on benign input.
export function evaluateTakeProfit(
  position: Position,
  _snapshot: MarketSnapshot,
  config: TickerConfig,
): Intent[] {
  if (!config.automaticManeuversEnabled) return [];
  if (position.status !== 'OPEN') return [];
  if (position.currentValue == null) return [];

  const credit = Money.from(position.entryCredit);
  const threshold = credit.mul(Money.from(config.takeProfitPercentage));
  const current = Money.from(position.currentValue);

  if (current.lte(threshold)) {
    return [{ kind: 'CloseAll', positionId: position.id, reason: 'TAKE_PROFIT' }];
  }
  return [];
}