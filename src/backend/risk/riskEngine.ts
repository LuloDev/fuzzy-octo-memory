import type { Intent, Position, TickerConfig, MarketSnapshot } from '@/types/domain';
import { evaluateTakeProfit } from '@/backend/risk/maneuvers/takeProfit';
import { evaluateStopLoss } from '@/backend/risk/maneuvers/stopLoss';
import { evaluateRollUntestedSide } from '@/backend/risk/maneuvers/rollUntestedSide';

// Risk Engine (Constitution Principle III): the highest-priority artifact.
// Pure, deterministic, side-effect-free.
//
//   evaluate(position, snapshot, config) -> Intent[]
//
// Priority rules (when multiple maneuvers qualify on the same cycle):
//   1. Take-profit beats stop-loss when both fire (spec §Edge Cases).
//   2. Stop-loss suppresses the untested-side roll (close everything beats
//      re-defending one side).
//   3. The roll only fires when neither close has fired.
//
// Never throws on benign input. Invalid states return a single Reject intent
// with a structured reason; the caller is responsible for alerts.
export function evaluate(
  position: Position,
  snapshot: MarketSnapshot,
  config: TickerConfig,
): Intent[] {
  if (!config.enabled) {
    return [{ kind: 'Reject', reason: 'MANEUVERS_DISABLED' }];
  }
  if (position.status !== 'OPEN') {
    return [{ kind: 'Reject', reason: 'INVALID_STATE', detail: `status=${position.status}` }];
  }

  const tp = evaluateTakeProfit(position, snapshot, config);
  if (tp.length > 0) return tp;

  const sl = evaluateStopLoss(position, snapshot, config);
  if (sl.length > 0) return sl;

  const roll = evaluateRollUntestedSide(position, snapshot, config);
  if (roll.length > 0) return roll;

  return [{ kind: 'Hold' }];
}