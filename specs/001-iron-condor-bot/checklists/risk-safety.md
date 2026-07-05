# Risk-Safety Requirements Quality Checklist

**Purpose**: Validate that the Iron Condor bot's risk and safety
requirements are written to a standard that an engineer (and an auditor)
can implement and review without re-derivation. This is a **requirements-
quality** checklist — every item asks whether the requirement is present,
clear, consistent and measurable, NOT whether the implementation works.
**Created**: 2026-07-05
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [tasks.md](../tasks.md) · [constitution](../../.specify/memory/constitution.md)
**Audience**: code-reviewers + the author during PR

## Requirement Completeness

- [ ] CHK001 — Are the three mandatory maneuvers (take-profit, stop-loss,
  untested-side roll) each stated as an individually-named requirement
  with its own threshold? [Completeness, Spec §FR-006/§FR-007/§FR-008]
- [ ] CHK002 — Are daily-loss circuit breaker requirements (threshold,
  reset cadence, what action is taken when tripped) stated as a
  discoverable requirement rather than implied? [Completeness, Gap —
  Constitution §Risk Guardrails #3]
- [ ] CHK003 — Is the "no naked leg" guarantee stated as a requirement
  on order construction (single atomic `mleg`), and does it specify the
  behavior on partial fill? [Completeness, Spec §FR-009]
- [ ] CHK004 — Is the margin pre-flight safety multiple explicitly
  documented as a requirement, with the value and the bound the value
  must respect? [Completeness, Spec §FR-015]
- [ ] CHK005 — Is dry-run mode documented as a mandatory default for
  non-production, with the rule that no broker-side effect can escape
  it? [Completeness, Spec §FR-017, Constitution §Guardrails #5]
- [ ] CHK006 — Is there an explicit, scoped bypass clause that names the
  Panic path as the only legitimate bypass of the Risk Engine? [Gap,
  Constitution §VI]

## Requirement Clarity

- [ ] CHK007 — Is the take-profit threshold defined in terms of the
  recorded initial credit (not the current value, not the absolute
  premium) and is the comparison direction unambiguous
  (`value ≤ credit × takeProfitPercentage`)? [Clarity, Spec §FR-006]
- [ ] CHK008 — Is the stop-loss threshold defined symmetrically
  (`cost-to-close ≥ stopLossMultiplier × credit`) and is the time of
  measurement specified (close-of-cycle vs fill price)? [Clarity,
  Spec §FR-007]
- [ ] CHK009 — Is "within 1% of the short strike" quantified with the
  underlying price field used for the comparison (last trade, mid,
  VWAP) and the side (put vs call) preserved? [Clarity, Spec §FR-008]
- [ ] CHK010 — Is "market or aggressive limit" for the stop-loss close
  resolved to one choice in the spec, or at minimum to a documented
  selection rule? [Clarity, Spec §FR-007]
- [ ] CHK011 — When two maneuvers fire on the same cycle, is the
  precedence rule stated as a requirement (not as an implementation
  hint in tasks.md)? [Clarity, Gap — currently lives in edge cases +
  tasks.md Phase 5 preamble only]
- [ ] CHK012 — Are intent types enumerated exhaustively in the spec, or
  at minimum listed with an "any state not matching a maneuver returns
  a Reject intent" requirement? [Clarity, plan.md §Risk Engine First]

## Requirement Consistency

- [ ] CHK013 — Do the maneuver thresholds in spec.md (`takeProfitPercentage`,
  `stopLossMultiplier`) match the `TickerConfig` field names in
  data-model.md? [Consistency, Spec §US1 + data-model.md]
- [ ] CHK014 — Does the spec's "initial credit" terminology match the
  `Position.entryCredit` field in data-model.md and the
  "combo's current value" in quickstart.md V3? [Consistency, Analysis F3]
- [ ] CHK015 — Does the "1% of short strike" roll trigger align with the
  >0.85% capture-then-roll expiry heuristic implied by US3's acceptance
  scenario #3 (no double-closure) — i.e. is the relationship between the
  roll trigger and subsequent re-roll threshold documented? [Consistency,
  Spec §US3 acceptance #3]
- [ ] CHK016 — Is the margin pre-flight multiplier (1.5×) consistent
  between plan.md and contracts/alpaca-orders.md and the spec's "documented
  safety multiple"? [Consistency, Spec §FR-015 + plan.md]

## Acceptance-Criteria Quality

- [ ] CHK017 — Is SC-003 ("trigger within one monitoring cycle") restated
  with a measurable numeric bound (e.g. "≤ 5 minutes from qualifying
  snapshot to `OrderSubmission(ACCEPTED)`")? [Measurability, Spec §SC-003]
- [ ] CHK018 — Is SC-004 ("panic flattens all within one minute")
  measurable as written, or is the start of the one-minute window
  ambiguous (button click vs API receipt vs risk-engine tick)? 
  [Measurability, Spec §SC-004]
- [ ] CHK019 — Is SC-005 ("critical event → Telegram ≤ 30s") measurable
  when the trigger is broker-side rather than system-side (broker
  rejects an order: which clock starts the 30s)? [Measurability, Spec
  §SC-005]
- [ ] CHK020 — Is the daily-loss circuit breaker state observable in
  the dashboard or only in Telegram, and is that observability made a
  requirement? [Measurability, Gap]

## Scenario Coverage

- [ ] CHK021 — Are alternate-flow requirements specified when the
  broker rejects an opening order (state transitions: `Position` row
  created or never created; `OrderSubmission.status=REJECTED`; Telegram
  fired)? [Coverage, Exception Flow, Gap]
- [ ] CHK022 — Are recovery-flow requirements specified for a partial
  fill on the closing `mleg` of a take-profit or stop-loss? [Coverage,
  Recovery, Gap]
- [ ] CHK023 — Are exception-flow requirements specified for an
  untested-side roll that succeeds on the close but fails on the open
  (partial state)? [Coverage, Exception, Gap]
- [ ] CHK024 — Are exception-flow requirements specified for an
  unachievable target delta (no listed option within tolerance)? 
  [Coverage, Spec §Edge Cases, partially addressed]
- [ ] CHK025 — Are exception-flow requirements specified for a full
  entry-window outage (broker API unreachable for the whole window)? 
  [Coverage, Spec §Edge Cases, has analysis gap F6 in tasks.md]
- [ ] CHK026 — Is the panic-button's interaction with in-flight
  roll-execution requirements specified (e.g. "if a roll mid-leg, panic
  market-closes the remaining leg at all costs")? [Coverage, Gap]
- [ ] CHK027 — Are concurrent monitoring-cycle requirements specified
  (single-process guarantee vs lock-with-timeout for cross-ticker
  writes)? [Coverage, Non-Functional, Gap]

## Edge-Case Coverage

- [ ] CHK028 — Are requirements documented for "two maneuvers fire on
  the same cycle" (priority, single Telegram message, position closed
  once)? [Edge Case, Spec §Edge Cases partial]
- [ ] CHK029 — Are requirements documented for "target delta not
  achievable within tolerance" (substitution policy, log + alert)?
  [Edge Case, Spec §Edge Cases partial]
- [ ] CHK030 — Are requirements documented for "roll illiquid on the
  opening side" (retry budget, escalation, position state)? [Edge
  Case, Spec §Edge Cases partial]
- [ ] CHK031 — Are requirements documented for "database wiped on next
  boot" (refuse-to-trade until config restored, log + Telegram)?
  [Edge Case, Spec §Edge Cases listed, no implementing requirement]
- [ ] CHK032 — Are requirements documented for "Alpaca returns a stale
  option quote" (quote age threshold, fallback)? [Edge Case, Gap]

## Audit & Traceability

- [ ] CHK033 — Is the audit-trail retention period stated as a
  measurable requirement with date arithmetic defined (12 months from
  what? row creation, position close, calendar quarter)? [Measurability,
  Spec §FR-016]
- [ ] CHK034 — Is there a requirement that every broker order carries
  the originating `intentId` *and* the originating `intentSource` (which
  maneuver triggered it, with timestamp)? [Completeness, Constitution
  §Guardrails #1]
- [ ] CHK035 — Is there a requirement that the audit trail itself can be
  reconstructed for a closed `Position` from `PositionEvent` and
  `OrderSubmission` rows alone — i.e. the position row's contents must
  be derivable, not the primary source? [Coverage, Spec §SC-007]

## Fail-Safe & Dead-Man's Switch

- [ ] CHK036 — Is the heartbeat cadence and absence-detection window
  (30 min) stated as a requirement, and is the Telegram `WARN` payload
  defined? [Completeness, Constitution §VI]
- [ ] CHK037 — Is the distinction between "panic" (legitimate risk-
  engine bypass) and "emergency stop" requirements documented
  separately, or are they conflated? [Clarity, Gap]
- [ ] CHK038 — Is there a requirement that process startup MUST fail
  fast on missing broker or Telegram credentials? [Completeness,
  Constitution §Technical Constraints]
- [ ] CHK039 — Is the requirement stated that the operator can stop
  the bot's effects within one human action (and that action is named)?
  [Coverage, Spec §FR-010]
