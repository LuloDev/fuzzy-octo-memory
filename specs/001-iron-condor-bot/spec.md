# Feature Specification: Automated Weekly Iron Condor Trading System

**Feature Branch**: `001-iron-condor-bot`
**Created**: 2026-07-05
**Status**: Draft
**Input**: User description: "Automated weekly Iron Condor trading bot with Alpaca Options API, multi-ticker management, risk engine, and dashboard"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Multi-Ticker Iron Condor Strategies (Priority: P1)

As a retail options trader, I want to manage a list of underlying symbols
(e.g. SPY, QQQ) and the parameters that define an Iron Condor for each one
(delta targets, spread width, profit/loss thresholds, capital allocation)
from a single dashboard, so that I can run several weekly strategies in
parallel without writing code or editing config files.

**Why this priority**: Without per-ticker configuration there is no strategy
to execute — this is the foundational setup that every other capability
depends on.

**Independent Test**: A trader adds a new ticker through the UI, enables it,
and confirms that the configured parameters are visible on the dashboard
and persisted across server restarts.

**Acceptance Scenarios**:
1. **Given** the dashboard is open and no tickers are configured,
   **When** the trader adds SPY with default parameters,
   **Then** SPY appears as enabled in the ticker list and its parameters are
   editable inline.
2. **Given** SPY is enabled with default parameters,
   **When** the trader edits `targetDelta` to 0.12 and `takeProfitPercentage`
   to 50%,
   **Then** the dashboard reflects the new values within one refresh cycle
   and the next evaluation reads them.
3. **Given** a ticker's automatic maneuvers are disabled,
   **When** market conditions would otherwise trigger a take-profit or
   stop-loss action,
   **Then** the system logs the would-be action and notifies the operator,
   but does not place an order.

---

### User Story 2 - Execute Weekly Iron Condor Entries Automatically (Priority: P1)

As a trader, I want the system to automatically open a weekly Iron Condor
(7 days to expiration) on each enabled ticker at the configured entry
window (Monday morning or Friday close), so that I capture the weekly theta
decay without manual intervention.

**Why this priority**: Entry is the value-generating action. Without it the
system produces nothing.

**Independent Test**: With at least one enabled ticker and sufficient buying
power, the next scheduled entry window opens a complete 4-leg Iron Condor
on that ticker with the configured delta and width, and the position is
visible on the dashboard.

**Acceptance Scenarios**:
1. **Given** SPY is enabled and sufficient buying power is available,
   **When** the scheduled entry window opens,
   **Then** exactly one Iron Condor is opened on SPY with strikes computed
   from the configured `targetDelta` and `widthOfSpread`.
2. **Given** SPY already has an open Iron Condor from the current week,
   **When** the scheduled entry window opens again,
   **Then** the system does not open a duplicate position on SPY.
3. **Given** buying power is below the configured safety margin for the
   proposed combo,
   **When** the entry window opens,
   **Then** the system skips entry on that ticker, logs the reason, and
   notifies the operator via Telegram.

---

### User Story 3 - Apply Automatic Risk Maneuvers (Priority: P1)

As a trader, I want the system to monitor every open Iron Condor and apply
three maneuvers automatically — take profit, stop loss, and passive
defensive rolling of the untested side — so that winning positions are
locked in, losers are capped, and threatened positions are re-defended
without me watching the screen.

**Why this priority**: Risk management is the difference between a strategy
that pays for itself and one that wipes the account. Take-profit and
stop-loss are mandatory; the untested-side roll is the differentiator.

**Independent Test**: With an open Iron Condor, three separate simulated
market states each trigger exactly the corresponding maneuver without
operator action.

**Acceptance Scenarios**:
1. **Given** an open Iron Condor that has captured the configured
   `takeProfitPercentage` of its initial credit,
   **When** the next monitoring cycle evaluates the position,
   **Then** all four legs are closed and the realized PnL is logged and
   reported to Telegram.
2. **Given** an open Iron Condor whose current value exceeds the configured
   `stopLossMultiplier` × initial credit,
   **When** the next monitoring cycle evaluates the position,
   **Then** all four legs are closed at market or aggressive limit and a
   stop-loss alert is sent to Telegram.
3. **Given** an open Iron Condor and the underlying price has moved within
   1% of one short strike while the opposite side is still well untested,
   **When** the next monitoring cycle evaluates the position,
   **Then** the profitable opposite-side spread is closed for a gain and a
   new spread on the threatened side is opened at the configured delta to
   push the break-evens further out; the maneuver is logged and reported to
   Telegram.

---

### User Story 4 - Visualize Live Financial State on a Dashboard (Priority: P2)

As a trader, I want a real-time dashboard that shows my current and
historical financial state — realized PnL, unrealized PnL, projected max
profit at expiration, max risk, margin usage, an interactive payoff
diagram, and an equity curve — so that I can audit the system's behavior
without reading raw logs.

**Why this priority**: After entry and risk management, visibility is what
lets a trader trust the bot enough to leave it running unattended.

**Independent Test**: With at least one open position, the dashboard
displays the four core numbers, the payoff curve with the current price
overlaid, and a daily PnL series that updates at least once per monitoring
cycle.

**Acceptance Scenarios**:
1. **Given** at least one open Iron Condor,
   **When** the trader opens the dashboard,
   **Then** realized PnL, unrealized PnL, projected max profit at
   expiration, and max risk are all displayed and update on each
   monitoring cycle.
2. **Given** at least one open Iron Condor,
   **When** the trader views the payoff diagram,
   **Then** the curve shows both break-evens, the current underlying price
   as a movable marker, and shaded profit/loss regions.
3. **Given** at least one day of trading history,
   **When** the trader views the equity curve,
   **Then** a daily PnL series is displayed that matches the values in the
   audit log.

---

### User Story 5 - Receive Critical Alerts via Telegram (Priority: P2)

As a trader who is not always in front of the dashboard, I want to receive
a Telegram message for every critical event — entry opened, defense
maneuver, take-profit, stop-loss, broker errors, margin shortfall — so
that I am aware of the system's actions within minutes.

**Why this priority**: Telegram is the operator's lifeline when the bot is
running unattended. It does not generate PnL but prevents silent loss.

**Independent Test**: Trigger each critical event type in turn (paper or
test mode) and confirm a Telegram message arrives for each one with the
required fields populated.

**Acceptance Scenarios**:
1. **Given** a successful Iron Condor entry,
   **When** the order fills,
   **Then** a Telegram message is sent with the symbol, expiration, four
   strikes, contracts and net credit received.
2. **Given** any of the three risk maneuvers or a broker error,
   **When** the event is recorded,
   **Then** a Telegram message is sent with the event type, the affected
   symbol and position, and the resulting PnL or error details.
3. **Given** a market session day is active,
   **When** no activity has occurred for 30 minutes,
   **Then** the system emits a heartbeat message indicating it is alive
   and responsive.

---

### User Story 6 - Panic-Liquidate Everything (Priority: P3)

As a trader facing an emergency (system behaving strangely, breaking news,
network instability), I want a single button that immediately cancels
every open order and market-closes every open Iron Condor on every enabled
ticker, so that I can flatten the book in seconds regardless of what the
risk engine is doing.

**Why this priority**: Rarely used but indispensable when needed; it is
the operator's kill switch.

**Independent Test**: With multiple open positions and at least one open
order, triggering the panic button cancels all open orders and submits
market-close for every open combo within one cycle, and the resulting
state is reported on the dashboard.

**Acceptance Scenarios**:
1. **Given** multiple open Iron Condors and at least one pending order,
   **When** the trader activates the panic button,
   **Then** every pending order is cancelled and every open combo is
   submitted for market-close within one minute.
2. **Given** the panic button has been activated,
   **When** the close sequence completes,
   **Then** the dashboard reflects zero open positions and a Telegram
   message confirms the panic-close event with per-position realized PnL.

### Edge Cases

- What happens when the broker API is unreachable for the entire entry
  window? → The system skips entry, logs the failure and notifies the
  operator via Telegram.
- What happens when the configured `targetDelta` is not achievable because
  no listed option matches it within tolerance? → The system widens the
  candidate set, picks the closest delta available, logs the substitution,
  and surfaces it on the dashboard and Telegram.
- What happens when two maneuvers conflict (e.g. take-profit and stop-loss
  triggered on the same cycle)? → Take-profit has priority; if both fire
  on the same evaluation the system closes the position once and emits a
  single combined Telegram message.
- What happens when a roll is required but the opposing side cannot be
  closed because of insufficient liquidity? → The system retries up to a
  bounded number of attempts, then escalates to a Telegram alert and leaves
  the position untouched for operator review.
- What happens when the database is wiped? → On next boot the system
  detects missing configuration and refuses to place orders until the
  operator recreates the ticker list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow per-ticker configuration of:
  `symbol`, `enabled`, `allocationPercentage`, `targetDelta`,
  `widthOfSpread`, `takeProfitPercentage`, and `stopLossMultiplier`,
  through both a database and a dashboard UI.
- **FR-002**: The system MUST support managing multiple tickers
  concurrently (e.g. SPY and QQQ) in a single instance, with each ticker's
  configuration independent of the others.
- **FR-003**: The system MUST automatically open one weekly Iron Condor
  per enabled ticker per week, targeting an expiration date approximately
  seven calendar days from entry and matching the configured
  `targetDelta` (within a documented tolerance) and `widthOfSpread`.
- **FR-004**: The system MUST prevent duplicate entries for the same
  underlying within the same weekly expiration cycle.
- **FR-005**: The system MUST monitor all open Iron Condors on a regular
  cadence (every five minutes by default) and evaluate risk conditions on
  every cycle.
- **FR-006**: The system MUST close all four legs of an open Iron Condor
  when the captured profit reaches the configured
  `takeProfitPercentage` of the initial credit.
- **FR-007**: The system MUST close all four legs of an open Iron Condor
  when the position's current cost-to-close exceeds
  `stopLossMultiplier` × initial credit.
- **FR-008**: The system MUST, when the underlying moves within 1% of one
  short strike, close the opposite-side spread for a gain and open a new
  spread on the threatened side recomputed to the configured delta, in a
  single coordinated maneuver.
- **FR-009**: The system MUST submit multi-leg positions as a single
  atomic order so that partial fills cannot leave a naked leg.
- **FR-010**: The system MUST provide a global panic button that cancels
  every open order and market-closes every open Iron Condor on every
  enabled ticker, bypassing any other decision logic.
- **FR-011**: The system MUST display on the dashboard, per session:
  realized PnL (historical), unrealized PnL (open positions), projected
  max profit at expiration, max risk, and margin usage (used vs free).
- **FR-012**: The system MUST display an interactive payoff diagram for
  the current portfolio with break-evens, profit/loss zones, and a marker
  for the current underlying price.
- **FR-013**: The system MUST display a daily PnL series and an equity
  curve for the account.
- **FR-014**: The system MUST send a Telegram alert for every critical
  event: entry opened, defense maneuver, take-profit exit, stop-loss exit,
  broker error, margin shortfall, and a periodic heartbeat.
- **FR-015**: The system MUST refuse to send any opening order when free
  buying power is below a documented safety multiple of the worst-case
  loss of the proposed combo, and MUST surface the rejection via Telegram.
- **FR-016**: The system MUST persist an immutable record of every
  position state transition and every order submission, retained for at
  least twelve months, so that any historical trade can be reconstructed
  from its inputs.
- **FR-017**: The system MUST support a dry-run mode in which all
  evaluations and decisions are computed and logged but no orders are
  sent to the broker.

### Key Entities *(include if feature involves data)*

- **TickerConfig**: A trader's configuration for one underlying
  (symbol, enabled flag, allocation, delta target, spread width, profit
  threshold, loss multiplier, audit timestamps).
- **Position**: A live Iron Condor on one underlying for one weekly cycle
  (symbol, expiration, four strikes, four contract legs, entry credit,
  current market value, status).
- **PositionEvent**: An immutable record of one transition of a position
  (open, take-profit close, stop-loss close, roll, panic-close) including
  triggering market snapshot and resulting PnL.
- **OrderSubmission**: A record of one order sent to the broker
  (request payload, response payload, intent id, position id, status,
  timestamps).
- **TickerConfigRevision**: A historical version of a TickerConfig that
  captures the previous values whenever the configuration is mutated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A trader can add a new ticker, enable it and see it in the
  active ticker list in under 60 seconds, without restarting the service.
- **SC-002**: For every enabled ticker, a weekly Iron Condor is opened
  within the configured entry window in 100% of weeks where the broker is
  reachable and buying power is sufficient.
- **SC-003**: Take-profit, stop-loss and untested-side roll maneuvers
  trigger within one monitoring cycle (≤ 5 minutes by default) of their
  qualifying market state.
- **SC-004**: The panic button flattens all open positions and cancels
  all open orders within one minute of activation, regardless of how
  many positions are open.
- **SC-005**: 100% of critical events generate a corresponding Telegram
  message within 30 seconds of the event being recorded.
- **SC-006**: The dashboard's realized and unrealized PnL numbers
  reconcile with the persisted PositionEvent records to the cent on every
  load.
- **SC-007**: An operator can reconstruct the inputs to any historical
  trade (symbol, strikes, contracts, entry credit, exit reason, PnL) from
  the audit trail alone.
- **SC-008**: Dry-run mode produces identical decisions to live mode for
  the same market state, and emits zero orders to the broker.

## Assumptions

- The trader has a working account with a US options broker that exposes
  a programmatic multileg order API (Alpaca is the assumed broker; the
  spec is otherwise broker-agnostic).
- The trader's account has sufficient buying power and margin to support
  the configured per-ticker allocations.
- Market data and order execution are available during standard US
  equity options trading hours; out-of-hours behavior is out of scope for
  v1.
- The trader is the sole operator of the system in v1; multi-user
  authentication, role-based access control and audit of operator
  identity are out of scope.
- Paper and live trading are both supported; the broker endpoint is
  configured by environment and is not changed at runtime.
- Telegram bot credentials are configured by environment before the
  service starts; an in-app credential rotation flow is out of scope.