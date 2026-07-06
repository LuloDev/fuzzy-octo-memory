# Feature Specification: Algorithmic Command Center

**Feature Branch**: `[002-algo-command-center]`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Para elevar tu dashboard de un simple monitor de ganancias a un centro de comando algorítmico de alto nivel, necesitas métricas que no solo te digan cuánto vas ganando, sino qué tan segura está tu automatización y cómo está ejecutando el bot."

> Scope note: this feature is an enhancement of the existing dashboard (US4 from `specs/001-iron-condor-bot/spec.md`). It does not change the risk engine, the broker integration, the persistence schema in any way that touches orders, or the contracts between backend and broker — all additions are **read-only views over existing events / fills / market snapshots**, plus three new opt-in **kill-switch gradations** that go through the existing Panic service (Constitution Principle II / VI).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Risk Radar (Visual proximity to strikes) (Priority: P1)

As the operator I want to see **at a glance** how close the underlying price is to each open position's short strikes, so I know whether the bot is in a "calm zone" or about to fire a maneuver — without reading absolute numbers.

**Why this priority**: this is the single highest-value visual signal during market hours. A trader watching the dashboard can react in seconds instead of mentally calculating from a table. It also gives instant validation that the bot's alerts (Telegram) will fire at the right moment.

**Independent Test**: With at least one open Iron Condor (SPY 430/428 short/long put, 438/440 short/long call), open the dashboard. When the underlying trades within 1.5% of the short put, the **put-side thermometer** must read ≥90% width and turn amber. When it trades below the long put, the bar saturates at 100% and is red. A second position with a different strike width does not affect the first.

**Acceptance Scenarios**:

1. **Given** an open position and a current underlying price, **When** the dashboard renders, **Then** it shows a horizontal bar per open position with two segments (put-side and call-side), labeled with the short strike, the % distance, and the absolute price gap in USD.
2. **Given** the underlying is > 5% away from both short strikes, **When** the bar renders, **Then** both segments are **green** (safe zone).
3. **Given** the underlying is ≤ 1.5% from the short put, **When** the bar renders, **Then** the put-side segment is **amber** with the text "{tick} a X.X% del Short Put (Zona Amarilla — Alerta de Maniobra)".
4. **Given** the underlying is past a short strike (≤ shortPut or ≥ shortCall), **When** the bar renders, **Then** the corresponding segment is **red** at 100% width and the entry is annotated "IN-THE-MONEY".
5. **Given** two open positions on different symbols, **When** the dashboard renders, **Then** each is shown as a separate row with its own thermometers.
6. **Given** no open positions, **When** the dashboard renders, **Then** the section reads "Sin posiciones abiertas — el radar se activa automáticamente al abrirse una posición".

---

### User Story 2 — Expected-Move Overlays (Priority: P2)

As the operator I want to see the **Expected Move** for the underlying overlaid on the payoff diagram, so I can judge visually whether my Iron Condor's strikes fall inside or outside the market-priced move for the remaining DTE.

**Why this priority**: option pricing intuition lives in the relationship between the expected move (straddle price × factor) and the strike location. This is the second highest-value visual after the proximity radar.

**Independent Test**: With an open SPY 7-DTE Iron Condor with the current underlying at $510, render the payoff chart. The chart must show two vertical guide lines (or a shaded band) representing the ±1-σ expected move based on the ATM-straddle price for that expiration. If both short strikes lie outside this band, a label reads "Strikes fuera del Movimiento Esperado ✓". If the short put is inside the band, the label reads "Short Put dentro del Movimiento Esperado ⚠".

**Acceptance Scenarios**:

1. **Given** an open position and the underlying option chain is reachable, **When** the payoff chart renders, **Then** the chart shows two `ReferenceLine`s at `underlying ± expectedMove`, labelled "±EM" with the dollar value.
2. **Given** the expected-move data cannot be fetched, **When** the chart renders, **Then** the overlay is omitted and a footnote reads "Movimiento esperado no disponible — reintentando cada 5 min".
3. **Given** the options chain returns zero bid for an ATM straddle, **When** the chart renders, **Then** the chart shows a fallback overlay using IV-derived estimate and a footnote explains the estimate.

---

### User Story 3 — Gamma Exposure Curve (Priority: P3)

As the operator I want to see how **Gamma exposure rises** as expiration approaches, so I understand why the same $1 move on Thursday destroys more PnL than on Monday.

**Why this priority**: high-value intuition but rarely actionable in real time; useful post-mortem and education more than operations. Lower priority than the proximity radar and expected-move overlay.

**Independent Test**: For a position that is currently 3 DTE, select "Gamma curve". The chart shows a smooth monotonically increasing curve from DTE=7 to DTE=0, normalized to 100%. The current DTE is highlighted with a marker.

**Acceptance Scenarios**:

1. **Given** an open position with a known expiration date, **When** the Gamma curve renders, **Then** the X-axis is "Days to Expiration" (0–7) and the Y-axis is "Estimated |Gamma| exposure %" (0–100, normalized to peak).
2. **Given** the current DTE is between 0 and 7, **When** the chart renders, **Then** a vertical marker highlights "hoy" at the current DTE with an associated Gamma exposure label.

---

### User Story 4 — Risk-Engine Audit Trail (Decisions feed) (Priority: P1)

As the operator I want a **structured, time-ordered feed** of every decision the risk engine emitted and every order it submitted, so I can post-mortem any day without grepping server logs.

**Why this priority**: without an audit trail UI, the dashboard's "live" view stops being actionable when something goes wrong. The feed is what makes the bot **legible** to the operator. Constitution Principle V mandates the underlying data already exists; this story only adds the UI on top of it.

**Independent Test**: With a position that was opened today at 09:35 and rolled at 11:15, the audit feed renders three rows:
- `09:35:12` "Monitoreando: SPY a $510.00 — entrada semanal Iron Condor abierta. credit=$1.20"
- `11:15:44` "ALERTA: SPY cae a $502.00 (−1.6%). Gatillo de Maniobra activado."
- `11:16:01` "ACCIÓN: Roll ejecutado — cierre Call Spread 530/535, apertura Call Spread 515/520."

Each row carries the `intentId` (greyed, copy-to-clipboard on hover) so the operator can correlate with the broker.

**Acceptance Scenarios**:

1. **Given** events exist in the `PositionEvent` / `OrderSubmission` tables, **When** the audit feed loads for "today", **Then** every `evaluate()` call, every `Intent`, every `OrderSubmission(status=ACCEPTED|REJECTED)` is shown in chronological order.
2. **Given** the user clicks an event row, **When** the row expands, **Then** it shows the full `intent` payload, the `marketSnapshot` (truncated if long), the `requestedOrderPayload`, the `actualOrderResponse` from Alpaca, and a link to the broker's order page when an `alpacaOrderId` is present.
3. **Given** an operator hovers over the `intentId`, **When** it stays 1 second, **Then** a tooltip offers "Copy intentId" and copies to clipboard on click.
4. **Given** no events exist (cold start), **When** the feed renders, **Then** the panel reads "Sin eventos registrados hoy — el motor evaluó pero no actuó".

---

### User Story 5 — Automation Health (Alpaca + Bot API) (Priority: P2)

As the operator I want a **persistent status indicator** showing whether the bot can reach Alpaca, the freshness of the last quote, and the recent rate-limit headroom, so I trust or distrust the displayed numbers.

**Why this priority**: a dashboard showing wrong data is worse than no dashboard. Without this indicator the operator can't distinguish "the bot is fine and the position really is up 4%" from "the bot lost connectivity 12 minutes ago and the last value is stale".

**Independent Test**: With the system idle for 6 hours (off-hours), the health widget should NOT show "DEGRADED" — only when the connection actually breaks. When the local dev server's `APCA_BASE_URL` is set to an unreachable host (`https://nonexistent.invalid`), within one monitoring cycle the widget must read "ALPACA: UNREACHABLE" red, the most recent heartbeat Telegram alert must be of category `BROKER_ERROR`, and every "PnL" number on the dashboard must be annotated "stale (18 min)".

**Acceptance Scenarios**:

1. **Given** Alpaca returns 2xx on the last poll, **When** the widget renders, **Then** it shows "ALPACA: OK · last poll 2m ago · r/p: 245/200 (request budget remaining)" in green.
2. **Given** Alpaca returns 5xx or times out on the last poll, **When** the widget renders, **Then** the widget reads "ALPACA: DEGRADED" amber and shows the time since the last successful poll.
3. **Given** Alpaca returns 429 with a `Retry-After` header, **When** the widget renders, **Then** it reads "RATE-LIMITED · retry in 47s" and the dashboard starts polling at the backoff ceiling, not the 5-minute cadence.
4. **Given** the local monitoring loop has not ticked in 30+ minutes, **When** the widget renders, **Then** it reads "MONITOR LOOP: STALLED" red and links to the runbook's "no heartbeat" section.

---

### User Story 6 — Graduated Kill Switches (Priority: P1)

As the operator I want **three differently scoped kill switches**, so I can pause the bot surgically (freeze new entries but keep managing existing positions) without nuking a perfectly good defense that is keeping me alive, OR fully liquidate when the situation is unrecoverable.

**Why this priority**: Constitution Principle VI mandates a single Panic that bypasses the Risk Engine, which remains the hard kill. But the request adds **two intermediate kill-switches** that do NOT bypass the engine — they only change what the engine is allowed to do. This is operationally critical during partial-degradation events (broker outage mid-day, market regime shift, manual intervention).

**Independent Test**: Press "Pause new entries" — the monitoring loop continues to evaluate and roll existing positions, but the entry sweep no longer submits opening orders. After pressing "Resume entries", opening orders flow again within one cycle. Press "Pause maneuvers" — automatic TP/SL/roll execution is skipped (still logged); operator can intervene manually via Alpaca's UI. Press "HARD PANIC" — the current behavior is preserved (cancel all orders + market-close everything).

**Acceptance Scenarios**:

1. **Given** the bot is healthy, **When** the operator clicks "Pause new entries", **Then** the next entry sweep records a `PositionEvent(kind=OPEN_REJECTED, reason=PAUSED_FOR_NEW_ENTRIES)` instead of submitting an order; existing positions are still managed.
2. **Given** the operator clicks "Pause new entries", **When** the operator later clicks "Resume entries", **Then** the next cycle resumes normal entry behavior and emits a `PositionEvent(kind=PAUSE_LIFTED)` to the audit feed.
3. **Given** the operator clicks "Pause maneuvers", **When** the next risk evaluation produces a TP/SL/roll intent, **Then** the intent is logged with `reason=PAUSED_FOR_MANEUVERS` and NOT translated into an order submission.
4. **Given** the operator clicks "Pause maneuvers", **When** the operator later clicks "Resume maneuvers", **Then** the next cycle resumes automatic maneuver execution.
5. **Given** the operator clicks "HARD PANIC", **When** the action is confirmed with reason=`confirm`, **Then** all open orders are canceled and all open positions are market-closed (current behavior, unchanged).
6. **Given** any kill switch toggles a state, **When** the state changes, **Then** a Telegram alert of category `HEARTBEAT` includes the new state, and the badge in the header reflects the active mode (e.g., "PAUSED" amber).

---

### User Story 7 — Slippage Tracker per leg (Priority: P2)

As the operator I want to see how much I **lost on average to slippage** per Iron Condor opened, so I can tell whether my limit-price discipline is correct or whether I should use marketable-limit hybrid orders instead.

**Why this priority**: without this metric, the operator cannot diagnose execution-quality problems. This story is read-only over already-captured data (the mid price sent to the broker vs the actual fill price).

**Independent Test**: Open 4 Iron Condors over 4 weeks against a dry-run marked with different mid/fill pairs; the dashboard's "Slippage" panel shows the median and p90 slippage in cents-per-contract and dollars-per-week. Each row links to the corresponding `OrderSubmission`.

**Acceptance Scenarios**:

1. **Given** the `OrderSubmission.requestPayload.limit_price` (the sent mid) and `OrderSubmission.responsePayload.filled_avg_price` (Alpaca fill) are stored, **When** the slippage panel loads, **Then** for each closed trade it shows `sent - filled` in cents per share and dollars per combo, grouped by symbol.
2. **Given** 30+ closed combos are available, **When** the panel renders, **Then** it shows median, p90, and a histogram with three buckets: <5¢, 5-15¢, >15¢.
3. **Given** a trade did not fill, **When** the panel renders, **Then** the row reads "NOT FILLED" and is excluded from percentiles.

---

### User Story 8 — Real-vs-Theoretical Theta decay curve (Priority: P3)

As the operator I want a chart that overlays the **theoretical theta decay** of the position against the **realized daily P&L** of that same position, so I can detect when intra-day volatility is "stealing" the time-decay I expected.

**Why this priority**: educational and diagnostic; useful for regime-change detection but not real-time operational. Lower priority than the kill switches and radar.

**Independent Test**: With a 4-day-old Iron Condor that has been in the profit zone the whole time, the chart shows the theoretical decay curve (smooth, monotonically falling as DTE → 0) and a series of points for `currentValue - entryCredit` measured at each heartbeat. When the realized PnL diverges upward or downward by > 10% of the credit, a band is shaded.

**Acceptance Scenarios**:

1. **Given** an open Iron Condor with recorded mid-prices at least once per day, **When** the chart renders, **Then** it shows the theoretical decay (smooth) and the observed mid-price at each timestamp.
2. **Given** the realized is consistently above the theoretical, **When** the chart renders, **Then** a footer reads "El subyacente se mueve en contra de los cortos — deslizamiento vega positivo".

---

### User Story 9 — System Performance Statistics (Priority: P2)

As the operator I want to see **aggregate performance metrics** of the strategy over time (profit factor, max consecutive losses, max drawdown, win rate), so I can decide whether the system is worth keeping on or whether its sizing is inadequate.

**Why this priority**: this is the headline number an operator uses to decide whether the strategy is alive. It is read-only and follows from the same `Position` / `OrderSubmission` data that already exists.

**Independent Test**: Seed the system with 10 closed positions (7 winners at +$50 net, 3 losers at −$80 net). Open the statistics panel. Profit factor reads `7*50 / (3*80) = 1.458`. Max consecutive losses reads `2`. Max drawdown reads `-$110` (the cumulative loss of the two worst consecutive losers). Win rate reads `70%`. Each metric shows a sparkline of the trailing 4 weeks.

**Acceptance Scenarios**:

1. **Given** at least one closed position exists, **When** the metrics panel loads, **Then** it shows: profit factor, win rate, average winner, average loser, max consecutive losses, max drawdown, expectancy per trade.
2. **Given** fewer than 5 closed positions exist, **When** the panel renders, **Then** the panel reads "Muestras insuficientes — vuelve con ≥5 trades cerrados" and does not display misleadingly unstable numbers.
3. **Given** the trailing 4-week profit factor is < 1.0, **When** the panel renders, **Then** the metric label is amber and includes a tooltip linking to the runbook's "diagnóstico de sistema perdedor" section.

---

### Edge Cases

- **No open positions**: every P1/P2 visual (radar, expected move, gamma) must render an empty state with explanatory copy (covered in acceptance scenarios). The audit feed is the only panel that must always populate.
- **Broker 404 on the option chain at iteration time**: Gamma curve and expected-move overlay fall back to a footnote. The rest of the dashboard continues to render.
- **Multiple positions on the same symbol** (roll generates a new one before the old one closes): each `positionId` is a separate row. The dashboard never merges them implicitly.
- **Clock skew between the bot container and the broker**: every timestamp rendered in the audit feed is normalized to UTC and labeled "UTC". Any local "today" filter is computed in the operator's locale but stored timestamps never carry TZ ambiguity.
- **Stale quotes** (Alpaca quote > 30 seconds old at polling time): the dashboard annotates the affected position with "stale quote — figure may lag".
- **Operator toggles two kills in rapid succession**: only the most recent state is applied. The audit feed records every transition with its reason.
- **Backend unreachable (dashboard polls 5xx)**: the dashboard shows "Cannot reach backend — last successful call was Nm ago" and offers a "Retry" button. The dashboard NEVER falls back to cached state silently.
- **`DRY_RUN=true` mode**: any kill switch remains fully functional (it would flush only the recorded events). The slippage panel shows "—" for dry-run trades since no fills exist.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Visual Risk Layer

- **FR-001**: System MUST display, per open position, a horizontal "thermometer" (two segments: put-side, call-side) showing the percentage distance from the current underlying price to the nearest short strike (short put for the put-side segment, short call for the call-side segment).
- **FR-002**: System MUST classify each thermometer segment into three states — `SAFE` (> 5% distance, green), `WARNING` (≤ 1.5% distance, amber), `BREACH` (price past the short strike, red) — and render the corresponding color + label.
- **FR-003**: System MUST overlay the Expected Move (ATM straddle price × factor derived from days-to-expiry) as two `ReferenceLine`s on the payoff chart for any open position whose underlying's option chain is reachable.
- **FR-004**: System MUST render a Gamma exposure curve for any open position, X-axis "DTE", Y-axis "% of peak |Gamma|", normalized to 100% at the data-driven peak.
- **FR-005**: All four visuals (FR-001 to FR-004) MUST be derived from data already captured by the existing monitoring loop and risk engine; the feature MUST NOT introduce new broker calls beyond the existing one-quote-per-position polling cadence.
- **FR-006**: All four visuals MUST degrade to an explanatory empty state when their underlying data is missing or the underlying option chain is unreachable.

#### Audit Trail UI

- **FR-007**: System MUST provide a `/api/events` endpoint that returns the latest `PositionEvent` and `OrderSubmission` rows in chronological order, optionally filtered by date range and/or `positionId`.
- **FR-008**: System MUST render the events feed in the dashboard with at minimum: timestamp (UTC), verb (Monitoreando / Alerta / Acción / Rechazado / Pausa), summary, and an expandable detail panel showing the full `intent` payload, `marketSnapshot`, and (when applicable) the Alpaca order payload + fill response.
- **FR-009**: Every event row MUST expose its `intentId` as a copy-to-clipboard affordance.

#### Health & Automation Indicators

- **FR-010**: System MUST persist and surface the timestamp and HTTP status of the last Alpaca broker call (operations side), the last quote fetch (data side), and the last Telegram delivery (alerting side).
- **FR-011**: System MUST display, in a persistent header widget, the freshness of each of the three signals above, classed green/amber/red against published thresholds (last broker call < 5 min, last quote < 10 min, last Telegram < 60 min during market hours).
- **FR-012**: System MUST track, over a rolling 60-minute window, the count of HTTP 429 responses from Alpaca and surface a "RATE-LIMITED" state when ≥ 1 such response is observed with a non-expired `Retry-After`.

#### Graduated Kill Switches

- **FR-013**: System MUST expose three stop-levels via distinct endpoints:
  - `POST /api/kill/new-entries` — pause (or resume) entry sweeping only.
  - `POST /api/kill/maneuvers` — pause (or resume) automatic TP/SL/roll execution only.
  - `POST /api/panic` — existing hard panic (unchanged).
- **FR-014**: Each pause endpoint MUST accept `{ "action": "pause" | "resume", "reason": string }` and persist the state in a singleton `AppState(key=kill_state_new_entries|kill_state_maneuvers)` row.
- **FR-015**: The monitoring loop MUST read these states at the start of every `tick()` and MUST short-circuit the corresponding pipeline step (entry sweep, maneuver dispatch) when paused.
- **FR-016**: Every state transition MUST record a `PositionEvent(kind=KILL_STATE_CHANGED, ...)` so the operator sees the change in the audit feed and on Telegram.
- **FR-017**: The header badge MUST reflect the active combination of states (e.g., `LIVE`, `PAUSED:ENTRIES`, `PAUSED:MANEUVERS`, `PAUSED:ALL`, `PANICKED`).
- **FR-018**: Kill-switch state MUST survive container restarts (persisted in DB, not in memory).

#### Slippage Analysis

- **FR-019**: System MUST compute slippage per closed position as `(sentLimitPrice - filledAvgPrice) × contracts × 100`, grouped by symbol, and expose it via `/api/metrics/slippage`.
- **FR-020**: System MUST surface median and p90 slippage in cents per share and dollars per combo, with a three-bucket histogram (`< 5¢`, `5–15¢`, `> 15¢`).

#### Theta Real-vs-Theoretical

- **FR-021**: System MUST, for any open position with at least one history snapshot, compute the theoretical mid-price decay assuming a flat underlying (constant IV at the last observed value) and overlay it against observed mid-prices captured at each evaluation cycle.
- **FR-022**: System MUST emit a footnote when the realized PnL diverges from the theoretical by more than 10% of the credit.

#### System Performance Statistics

- **FR-023**: System MUST compute, over the operator-selectable trailing window (7d, 30d, 90d, all-time), the following aggregates over closed positions: profit factor, win rate, average winner, average loser, max consecutive losses, max drawdown (peak-to-trough equity), and expectancy per trade.
- **FR-024**: System MUST refuse to render numerical values for any aggregate requiring ≥ 5 closed positions when fewer than 5 are available; the panel shows "Insufficient samples" instead.
- **FR-025**: System MUST persist these aggregates in `AppState` so they survive restarts.

#### Layout (Cross-cutting)

- **FR-026**: System MUST lay out the dashboard as a three-column desktop grid: left (configuration), center (live monitoring + visuals from FR-001 to FR-005), right (audit feed + statistics + system health). On viewports < 1024 px wide, columns collapse vertically with center rendered first.

### Non-Functional Requirements

- **NFR-001**: All new visuals MUST refresh via the existing React Query polling cadence (default 30s). No new polling source.
- **NFR-002**: All new endpoints added by this feature MUST follow the existing contract (zod-validated request, `{ error: { code, message } }` error envelope, typed response).
- **NFR-003**: All new monetary computations MUST use the existing `Money` (decimal.js) helper — no `number` arithmetic crosses a boundary.
- **NFR-004**: Every new endpoint MUST be added to `docs/runbook.md` under the "Inspecting an audit trail" section style, and to the FR-mapping table in `docs/traceability.md`.
- **NFR-005**: The dashboard MUST NOT issue broker calls directly; all data comes via the backend REST API.

### Key Entities *(include if feature involves data)*

- **AuditEventView**: projection of `PositionEvent` + `OrderSubmission` rows for UI consumption. Fields: `id, positionId, intentId, ticker, kind, timestamp (UTC), summary, intentJson, marketSnapshotJson, orderRequestJson, orderResponseJson, alpacaOrderId`. Read-only.
- **KillState**: singleton row keyed by `({ feature: 'new-entries' | 'maneuvers' })`. Fields: `paused: boolean, since: ISO8601, reason: string, changedBy: 'operator' | 'system'`. Persists across restarts.
- **SlippageObservation**: derived aggregate per closed `Position`. Fields: `positionId, symbol, sentLimitPrice (Decimal), filledAvgPrice (Decimal), contracts, slippagePerShare (Decimal), slippagePerCombo (Decimal)`. Computed on demand from `Position` + `OrderSubmission`.
- **HealthSnapshot**: rolling-state aggregate exposed by `/api/health` extension. Fields: `lastBrokerCall (timestamp+status), lastQuoteFetch (timestamp+ageMs), lastTelegramDelivery (timestamp+status), recentRateLimitHits (count over last 60 min)`. Persisted in `AppState` so reads are O(1).
- **PerformanceAggregate**: precomputed metrics for a window. Fields: `window (7d|30d|90d|all), profitFactor, winRate, averageWinner, averageLoser, maxConsecutiveLosses, maxDrawdown, expectancy, computedAt`. Recomputed on each new close; persisted in `AppState`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can identify whether an open position is in the safe / warning / breach zone within **2 seconds** of viewing the dashboard, without doing arithmetic in their head (verified by task-completion timing on a 10-position fixture).
- **SC-002**: 100% of risk-engine decisions and broker submissions made during market hours are visible in the audit feed within one polling cycle (≤ 30 seconds) of occurrence.
- **SC-003**: The kill-switch states (`new-entries`, `maneuvers`) change within **5 seconds** of operator action (verified end-to-end: dashboard → backend → monitoring loop → DB persisted state).
- **SC-004**: When Alpaca returns 429, the dashboard displays "RATE-LIMITED · retry in Ns" within one monitoring cycle and stops hammering the broker (verified: 0 broker calls occur between the 429 response and the `Retry-After` deadline).
- **SC-005**: The slippage panel correctly classifies ≥ 95% of the historical trades into the correct bucket (verified against a fixture with known fills).
- **SC-006**: Profit factor and max-drawdown displayed in the dashboard equal those computed by an off-the-shelf PnL analysis on the same fixture data, to the cent.
- **SC-007**: 0 broker calls originate from the dashboard directly — every command goes through the backend (verified by inspecting the broker's request log for source IPs/ports that map to the bot's process only).
- **SC-008**: The graduated kill switches reduce end-to-end operator reaction time during partial-degradation events from "find panic button, click, confirm" to "click corresponding button" — measured as the average number of clicks from "alert received" to "appropriate state active" drops from 3 to **1** (verified by V6 of the existing acceptance scenarios).

---

## Assumptions

- **A1**: The existing `/api/audit/export` (implemented in 001) is the eventual "everything" dump; `/api/events` added by this feature is a thin convenience endpoint that wraps the same audit tables with pagination and richer projection. Either suffices for V9 acceptance; we add `/api/events` here because the dashboard poll needs paging semantics.
- **A2**: The Graduated Kill Switch states are operator-only commands. There is no automatic trigger for them in the bot's logic. (An automatic trigger would be a separate "if drawdown > X, freeze entries" feature; out of scope here.)
- **A3**: Expected-Move is computed from ATM straddle mid (provider-default factor ≈ 0.85 × straddle / underlying); this is the same convention as the existing `Iron Condor` industry practice. We don't subscribe to a separate data feed for IV.
- **A4**: Gamma curve is a deterministic curve computed from strikes + remaining DTE + ATM IV (Black-Scholes). It is NOT the broker's reported gamma. Acceptable because the goal is pattern visualization, not exact Greeks.
- **A5**: Real-vs-Theoretical Theta decay assumes flat underlying. We don't compute a stochastic path; the divergence between theoretical and realized is the diagnostic signal.
- **A6**: The system-performance panel uses closed positions only — open positions are excluded from profit-factor calculation because realized-vs-unrealized mixing produces misleading numbers.
- **A7**: A "closed position" means `status IN ('TAKE_PROFIT', 'STOP_LOSS', 'ROLLED', 'PANIC_CLOSED')`. We exclude manual broker-side closures from the aggregate since they are not part of any strategy.
- **A8**: `lastBrokerCall` and `lastQuoteFetch` are recorded by the existing `AlpacaService` on every poll; this feature extends that service to also record the timestamp + status, without changing the polling cadence.

---

## Out of Scope

- Authenticated multi-user dashboard (the bot is single-operator; Constitution Principle VI).
- Mobile native app.
- Browser push notifications (Telegram is the alerting channel; the dashboard is the always-on console).
- Replay / backtest of historical weekly cycles (offline analytics; explicitly excluded by Constitution).
- Refactor of the existing risk engine or persistence schema.
- Any **new broker call** beyond the existing per-cycle polling.