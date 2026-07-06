// Audit-trail event types. Persisted as immutable rows per Constitution Principle V.

export type PositionEventKind =
  | 'OPENED'
  | 'TAKE_PROFIT_TRIGGERED'
  | 'STOP_LOSS_TRIGGERED'
  | 'UNTESTED_ROLL'
  | 'ROLL_EXECUTED'
  | 'PANIC_CLOSED'
  | 'HEARTBEAT'
  | 'OPEN_REJECTED'
  | 'KILL_STATE_CHANGED'
  | 'PAUSED_FOR_MANEUVERS'
  | 'MID_OBSERVED';

export type PositionEvent = {
  id: string;
  positionId: string;
  kind: PositionEventKind;
  /** JSON-serialized snapshot of the underlying/quote state at the moment of decision. */
  marketSnapshot: string;
  realizedPnL: string | null;
  /** JSON-serialized originating Intent, if any. */
  intentPayload: string | null;
  createdAt: string;
};

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'FILLED'
  | 'PARTIALLY_FILLED'
  | 'CANCELED'
  | 'REJECTED';

export type OrderSubmission = {
  id: string;
  positionEventId: string | null;
  positionId: string;
  intentId: string;
  alpacaOrderId: string | null;
  /** JSON-serialized body sent to Alpaca /v2/orders. */
  requestPayload: string;
  /** JSON-serialized response from Alpaca. */
  responsePayload: string | null;
  status: OrderStatus;
  submittedAt: string;
  acknowledgedAt: string | null;
  filledAt: string | null;
};

export type TickerConfigRevision = {
  id: string;
  tickerConfigId: string;
  previousValue: string; // JSON
  newValue: string; // JSON
  reason: string | null;
  createdAt: string;
};

// ============================================================
// Telegram alert categorization.
// ============================================================
export type AlertKind =
  | 'ENTRY_OPENED'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'UNTESTED_ROLL'
  | 'PANIC_CLOSE'
  | 'BROKER_ERROR'
  | 'MARGIN_SHORTFALL'
  | 'CIRCUIT_BREAKER'
  | 'HEARTBEAT'
  | 'WARN_NO_HEARTBEAT'
  | 'WARN_KILL_SWITCH_ENTRIES';

export type Alert = {
  kind: AlertKind;
  title: string;
  body: string;
  ticker?: string;
  positionId?: string;
  intentId?: string;
  pnl?: string;
};