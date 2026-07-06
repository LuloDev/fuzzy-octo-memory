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

The dashboard renders a chronological event feed at `/audit` with expandable
JSON payloads. Each row exposes the `intentId` (click to copy) so you can
correlate with the broker.

```sh
# UI
open http://127.0.0.1:3000/audit

# JSON, paginated with cursor
curl 'http://127.0.0.1:3000/api/events?limit=200'

# Filter by intent (paste the intentId copied from a row)
curl 'http://127.0.0.1:3000/api/events?intentId=<paste>'

# JSONL dump of everything (still available, used by audit rotation)
curl 'http://127.0.0.1:3000/api/audit/export?from=2026-06-01&to=2026-07-05'
```

The legacy `/api/audit/export` endpoint returns a JSONL stream. Use the new
`/api/events` endpoint when you need paging semantics or a typed projection.

## Running the test suite on NixOS

Prisma's CDN does not publish a `linux-nixos` engine build, so a fresh
checkout needs a one-time setup before tests will pass:

```sh
# One-time: downloads the debian-openssl-3.0.x engines to ~/.cache and
# creates wrappers that load via nix-ld.
scripts/fetch-prisma-engines.sh

# Tests then work without any env vars. The vitest setup file at
# tests/setup/nixos-prisma.ts auto-detects the cache and points Prisma at it.
npx vitest run
```

The setup file is a no-op on non-NixOS systems, so the same `vitest run`
invocation works on Linux/macOS without the fetch step.

## Graduated kill switches (002-algo-command-center)

Two intermediate pause toggles sit between "all clear" and "HARD PANIC":

- **Pause new entries** — the entry sweep is skipped every cycle; existing
  positions are still managed. Use when you want to halt fresh exposure but
  keep the defense running on the current book.
- **Pause maneuvers** — automatic TP/SL/roll execution is skipped, but the
  engine keeps evaluating. Use when you want to manage exits by hand.

Both states persist across container restarts (they live in `AppState`).

```sh
# Pause new entries
curl -X POST http://127.0.0.1:3000/api/kill/new-entries \
  -H 'content-type: application/json' \
  -d '{"action":"pause","reason":"manual"}'

# Resume maneuvers
curl -X POST http://127.0.0.1:3000/api/kill/maneuvers \
  -H 'content-type: application/json' \
  -d '{"action":"resume","reason":"back to normal"}'

# Inspect combined state (header badge polls this at 5s cadence)
curl http://127.0.0.1:3000/api/kill/state | jq
```

The **HARD PANIC** (`POST /api/panic`) remains the single legitimate bypass
of the risk engine — it cancels all open orders and closes every position
to market. Reserve it for unrecoverable situations.

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