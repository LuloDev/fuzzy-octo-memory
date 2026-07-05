import { Money } from '@/types/money';

// ============================================================
// TickerConfig — trader's per-underlying configuration.
// ============================================================
export type TickerConfig = {
  id: string;
  symbol: string;
  enabled: boolean;
  /** true = take-profit/stop-loss/roll apply automatically; false = log only. */
  automaticManeuversEnabled: boolean;
  /** % of account capital assigned to this symbol. Stored as string over the wire. */
  allocationPercentage: string;
  /** Target delta for the short strikes (e.g. "0.10" or "0.15"). */
  targetDelta: string;
  /** Spread width in USD (e.g. "2.00" or "5.00"). */
  widthOfSpread: string;
  /** % of credit to capture before closing (e.g. "0.50"). */
  takeProfitPercentage: string;
  /** Multiple of credit that triggers a stop loss (e.g. "3.00"). */
  stopLossMultiplier: string;
  /** % of allocation; entries halt when daily loss crosses this (default "-0.03"). */
  dailyLossLimit: string;
  createdAt: string;
  updatedAt: string;
};

/** Sparse partial compatible with `exactOptionalPropertyTypes` consumers. */
export type TickerConfigPatch = {
  enabled?: boolean | undefined;
  automaticManeuversEnabled?: boolean | undefined;
  allocationPercentage?: string | undefined;
  targetDelta?: string | undefined;
  widthOfSpread?: string | undefined;
  takeProfitPercentage?: string | undefined;
  stopLossMultiplier?: string | undefined;
  dailyLossLimit?: string | undefined;
};

// ============================================================
// Position — a live or recently closed Iron Condor.
// ============================================================
export type PositionStatus =
  | 'OPEN'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'ROLLED'
  | 'PANIC_CLOSED';

export type Position = {
  id: string;
  symbol: string;
  /** Friday of the trading week, UTC. */
  expiration: string;
  shortPutStrike: string;
  longPutStrike: string;
  shortCallStrike: string;
  longCallStrike: string;
  contracts: number;
  entryCredit: string;
  entryTimestamp: string;
  currentValue: string | null;
  status: PositionStatus;
  closedAt: string | null;
  closingPnL: string | null;
};

// ============================================================
// Market snapshot for the risk engine.
// ============================================================
export type OptionQuote = {
  symbol: string; // OSI
  side: 'put' | 'call';
  strike: string;
  bid: string;
  ask: string;
  /** ISO timestamp; alerts quote freshness. */
  quotedAt: string;
  delta?: string;
};

export type MarketSnapshot = {
  symbol: string;
  underlyingPrice: string;
  /** IV for the expiration. */
  iv?: string;
  quotes: OptionQuote[];
  /** ISO timestamp when the snapshot was assembled. */
  observedAt: string;
};

// ============================================================
// Intent — the risk engine's output. Algebraic / discriminated union.
// ============================================================
export type RejectReason =
  | 'MANEUVERS_DISABLED'
  | 'DAILY_LOSS_LIMIT'
  | 'MARGIN_INSUFFICIENT'
  | 'INVALID_STATE'
  | 'SNAPSHOT_STALE'
  | 'BROKER_UNREACHABLE';

export type Intent =
  | { kind: 'Hold' }
  | { kind: 'CloseAll'; positionId: string; reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'PANIC' | 'EXPIRY' }
  | {
      kind: 'RollUntestedSide';
      positionId: string;
      threatenedSide: 'put' | 'call';
      // Strikes recomputed to the configured delta.
      newShortStrike: string;
      newLongStrike: string;
      newExpiration?: string; // defaults to existing expiration
    }
  | { kind: 'Open'; configId: string; expiration: string }
  | { kind: 'Reject'; reason: RejectReason; detail?: string };

// ============================================================
// Convenience guards
// ============================================================
export function isActionable(intent: Intent): boolean {
  return intent.kind !== 'Hold' && intent.kind !== 'Reject';
}

// Helper accessor for the PnL of a position — purely cosmetic, all math goes via Money.
export function positionCredit(p: Position): Money {
  return Money.from(p.entryCredit);
}