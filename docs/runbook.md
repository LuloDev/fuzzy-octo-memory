# Operator Runbook

**Use this when something has gone wrong, or before any operation that
moves money.** The Risk Engine is the source of truth for what the system
will do next; the Panic button is the source of truth for what to do when
the system is misbehaving.

## When to act immediately

1. **A Telegram message says "BROKER_ERROR" or "PANIC".** Inspect the
   intent (`intentId`) in the audit table (`GET /api/audit/export`).
2. **No heartbeat for 30 minutes during market hours.** The bot is stuck.
   Hit the panic button, then restart the process.
3. **An order is accepted but its `PositionEvent` is missing.** Reconstruct
   from the `OrderSubmission` row; if it's a closing order, manually close
   the position in the Alpaca UI and patch the DB to reflect `closingPnL`.

## Panic flatten

```sh
curl -X POST http://127.0.0.1:3000/api/panic \
  -H 'content-type: application/json' \
  -d '{"reason":"manual"}'
```

The endpoint bypasses the Risk Engine (Constitution §VI) and market-closes
every open Iron Condor. With `PANIC_REQUIRES_CONFIRMATION=true`, set
`"reason":"confirm"` to acknowledge.

## Rotating credentials

1. Update `.env` (or the systemd unit's `EnvironmentFile=`).
2. `systemctl restart options-trading-bot`.
3. Confirm `/api/health` returns 200 and a heartbeat arrives within the
   next minute.

## Disabling DRY_RUN

```sh
sed -i 's/DRY_RUN=true/DRY_RUN=false/' /etc/options-trading-bot.env
systemctl restart options-trading-bot
```

Verify by checking the `dr:alert` payload in the next Telegram heartbeat.

## Inspecting an audit trail

```sh
curl 'http://127.0.0.1:3000/api/audit/export?from=2026-06-01&to=2026-07-05'
```

## Common failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| All entries skipped for a week | Margin pre-flight rejected (BP < 1.5× worst-case loss) | Reduce `allocationPercentage` or close some positions manually |
| Take-profit not firing | `takeProfitPercentage` too tight (credit captured before trigger) | Tune `takeProfitPercentage` via PATCH; new value applied on next cycle |
| Stop-loss not firing | Mark-to-market not refreshed (Alpaca 404 on stale option chain) | Restart bot; check `lastHeartbeatAt` |
| Roll failing on opening side | Liquidity shortage on the new strike | Telegram alert will say "Roll open leg rejected"; operator must manually re-defend |
| Telegram missing | Bot token revoked or chat id wrong | Test with `curl -X POST 'https://api.telegram.org/bot<TOKEN>/sendMessage' -d '{"chat_id":<ID>,"text":"test"}'` |

## Why the panic button is different

The Risk Engine is the only component that emits order-producing Intents.
The panic path is the **one** legitimate bypass — it does not consult the
engine, does not enforce margin pre-flight, and does not wait for a
monitoring cycle. Use it freely; restore via `/api/tickers/.../update` after
the dust settles.