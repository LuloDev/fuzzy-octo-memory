import { Money } from '@/types/money';
import type { Intent, Position, TickerConfig, MarketSnapshot } from '@/types/domain';

// Stop Loss: if currentValue >= stopLossMultiplier × entryCredit,
// close all four legs immediately. Decimal-safe math.
export function evaluateStopLoss(
  position: Position,
  _snapshot: MarketSnapshot,
  config: TickerConfig,
): Intent[] {
  if (!config.automaticManeuversEnabled) return [];
  if (position.status !== 'OPEN') return [];
  if (position.currentValue == null) return [];

  const credit = Money.from(position.entryCredit);
  const threshold = credit.mul(Money.from(config.stopLossMultiplier));
  const current = Money.from(position.currentValue);

  if (current.gte(threshold)) {
    return [{ kind: 'CloseAll', positionId: position.id, reason: 'STOP_LOSS' }];
  }
  return [];
}