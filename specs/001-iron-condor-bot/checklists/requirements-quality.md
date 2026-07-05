# Requirements-Quality Checklist (Comprehensive)

**Purpose**: Cross-domain requirements-quality checklist for the
Iron Condor bot. Every item asks whether a requirement is present,
clear, consistent and measurable. This complements the focus checklists
(e.g. `risk-safety.md`) by covering requirement quality dimensions
that are not specific to one domain.
**Created**: 2026-07-05
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [tasks.md](../tasks.md) · [constitution](../../.specify/memory/constitution.md)
**Audience**: code-reviewers + the author during PR

## Completeness

- [ ] CHK001 — Are the per-ticker configurable fields enumerated in both
  the data model and the spec? [Completeness, Spec §FR-001 +
  data-model.md `TickerConfig`]
- [ ] CHK002 — Is the "Automatic maneuvers enabled" per-ticker toggle
  required by spec US1 acceptance #3 present in the data model and in
  the persistence schema? [Gap, Analysis F1 — HIGH severity]
- [ ] CHK003 — Are entry-window selection rules (Monday morning vs
  Friday close, configurable time, holiday calendar) stated as
  requirements rather than as prose in the original prompt? [Gap, Spec
  §User Story 2 description vs §FR-003]
- [ ] CHK004 — Are exit-window rules specified for the weekly position
  (DTE→0 behaviour, expiry-day handling)? [Gap, Spec implicit only]
- [ ] CHK005 — Are the dashboard widgets enumerated (realized PnL,
  unrealized PnL, projected max profit, max risk, margin used vs free,
  payoff diagram, equity curve, ticker panel, panic button) and is
  each named as a separate, individually-testable requirement?
  [Completeness, Spec §FR-011/§FR-012/§FR-013]
- [ ] CHK006 — Are the Telegram event categories enumerated
  exhaustively (entry, take-profit, stop-loss, untested-side roll,
  panic-close, broker error, margin shortfall, heartbeat, circuit
  breaker) and is each bound to a payload schema? [Completeness,
  Spec §FR-014]
- [ ] CHK007 — Is there a documented exception for *what is NOT* in
  scope for v1 (multi-user auth, hedge pairs, dynamic allocation
  optimisation, etc.) so reviewers don't open ambiguous PRs against
  it? [Coverage, Spec §Assumptions — partial]

## Clarity

- [ ] CHK008 — Is the term "Iron Condor" defined once and used
  consistently (4-leg: short put spread + short call spread)?
  [Clarity, Spec §US2 + glossary gap]
- [ ] CHK009 — Is "underlying price" defined with the source of the
  price (last trade, mid, official close) and the venue (consolidated
  vs primary listing)? [Clarity, Gap — affects US3 roll trigger and
  quickstart V5]
- [ ] CHK010 — Is the difference between "open combinations" and
  "realized PnL" stated once and used consistently in the dashboard
  metrics? [Clarity, Spec §FR-011]
- [ ] CHK011 — Are the "current value of the combo" semantics defined
  for the take-profit and stop-loss checks (bid side, mid, last,
  synthetic mark)? [Clarity, Gap — Spec §FR-006 + §FR-007]
- [ ] CHK012 — Is "buying power" defined as Alpaca's `buying_power`
  value, with the assumption that the broker's value already nets
  existing positions? [Clarity, Spec §FR-015]

## Consistency

- [ ] CHK013 — Are field names in spec.md, data-model.md and
  contracts/rest-api.md identical (e.g. `takeProfitPercentage`,
  `stopLossMultiplier`, `widthOfSpread`)? [Consistency, Analysis F3
  partial]
- [ ] CHK014 — Is the same term used for "combo's initial credit"
  across spec.md FR-006/§FR-007, data-model.md `Position.entryCredit`,
  and quickstart.md V3 fixture? [Consistency, Analysis F3]
- [ ] CHK015 — Are endpoint paths and methods in tasks.md consistent
  with contracts/rest-api.md? [Consistency, Analysis F2 — new
  `/api/audit/export` endpoint mentioned in T083 but absent from
  contracts/rest-api.md]
- [ ] CHK016 — Is the storage choice (SQLite by default, PostgreSQL
  optional) reflected as a single switch point in plan.md with no
  conflicting statements? [Consistency, plan.md §Technical Context +
  research.md decision #3]
- [ ] CHK017 — Is the panic flow (POST /api/panic vs UI button vs
  operator CLI) stated consistently across spec.md, plan.md and
  contracts/rest-api.md? [Consistency, all three files]

## Measurability

- [ ] CHK018 — Is every Success Criterion in spec.md § Success Criteria
  expressible with a number, percentage, time-window or pass/fail
  predicate? [Measurability, Spec §SC-001…§SC-008]
- [ ] CHK019 — Is SC-006 ("reconcile to the cent") restated with an
  acceptable rounding convention (e.g. "all PnL values rounded to
  two decimal places")? [Measurability, Spec §SC-006]
- [ ] CHK020 — Is the formula for "projected max profit at expiration"
  pinned to a definition in spec.md and identical to the formula in
  contracts/rest-api.md (payoff endpoint)? [Measurability, Spec
  §FR-011 + contracts/rest-api.md `/api/positions/:id/payoff`]
- [ ] CHK021 — Is "max risk" defined as a single, unambiguous formula
  (`(widthOfSpread − entryCredit) × contracts × 100`) with the
  convention for partial allocations? [Measurability, Spec §FR-011]
- [ ] CHK022 — Is "current value" measured at each cycle (and stale
  quotes rejected per cycle) so SC-003 is testable? [Measurability,
  Spec §FR-005 + §SC-003]

## Acceptance Criteria Quality

- [ ] CHK023 — Does every user-story acceptance scenario map to a
  numbered requirement or success criterion? [Traceability, Spec
  §US1/§US2/§US3/§US4/§US5/§US6]
- [ ] CHK024 — Are the "Given/When/Then" acceptance scenarios
  exhaustively covering the variations of each user story, including
  the disabled state? [Coverage, Spec §US1 acceptance #3 — gap]
- [ ] CHK025 — Is the dependency between User Story 1 (configuration)
  and User Story 3 (risk maneuvers) documented (e.g. "without US1, the
  engine has nothing to operate on")? [Dependency, Spec implicit]

## Scenario Coverage

- [ ] CHK026 — Are alternate-flow requirements specified for the case
  where the preferred entry window produces wider spreads than the
  configured width? [Coverage, Gap]
- [ ] CHK027 — Are exception-flow requirements specified for a
  concurrent operator edit to a ticker config during a monitoring
  cycle? [Coverage, Exception, Gap]
- [ ] CHK028 — Are exception-flow requirements specified for an
  Alpaca rate-limit response (429/1000-by-default) on the entry sweep?
  [Coverage, Exception, Gap]
- [ ] CHK029 — Are requirements specified for the dashboard when the
  backend is unreachable (offline state, last-known-good data,
  reconnect cadence)? [Coverage, Non-Functional, Gap]
- [ ] CHK030 — Are non-functional requirements specified for the
  process supervisor (restart-on-crash, max downtime, watchdog)?
  [Coverage, Non-Functional, Constitution §VI partial]
- [ ] CHK031 — Are non-functional requirements specified for Telegram
  rate limiting and message-queue behavior under burst? [Coverage,
  Non-Functional, Gap]

## Edge-Case Coverage

- [ ] CHK032 — Are the edge cases listed in spec.md § Edge Cases each
  tied to a numbered requirement (FR-…) rather than living only in
  the prose section? [Edge Case, Spec §Edge Cases]
- [ ] CHK033 — Are edge-case requirements specified for the multi-
  leg `mleg` order rejecting because of cross-leg price checks
  (collared, position-intent-violating)? [Edge Case, Gap]
- [ ] CHK034 — Are edge-case requirements specified for a market-holiday
  week where the weekly expiration falls on the holiday? [Edge Case,
  Gap]

## Dependencies & Assumptions

- [ ] CHK035 — Is every assumption in spec.md § Assumptions restated as
  a constraint on the system (e.g. "single operator ⇒ no RBAC layer")
  rather than as a hand-wave? [Clarity, Spec §Assumptions]
- [ ] CHK036 — Is the Alpaca paper ↔ live switching path documented as a
  requirement (single env var, no UI toggle, restart-required vs hot-
  swap)? [Completeness, Spec §Assumptions vague]
- [ ] CHK037 — Is the operating-system target (Linux) and the process
  supervisor (systemd) named in the requirements, not only in plan.md?
  [Completeness, Gap]

## Ambiguities & Conflicts

- [ ] CHK038 — Are there any pairs of requirements that contradict
  each other (e.g. "entry automatic on Monday morning OR Friday
  close" — does "or" mean configurable, first-of, random, or alternation)?
  [Conflict, Spec §US2 + plan.md §FR-003]
- [ ] CHK039 — Are terms like "prominent display", "live",
  "real-time" replaced with measurable thresholds (e.g. "refresh
  within one monitoring cycle, ≤5 min" rather than "live")? [Clarity,
  Spec §FR-011 + §FR-014]
- [ ] CHK040 — Is the meaning of "DRY_RUN=true" hardened as a
  *requirement* against any future code path that could submit orders
  while running under DRY_RUN? [Clarity, Spec §FR-017 + Constitution
  §Guardrails #5]
