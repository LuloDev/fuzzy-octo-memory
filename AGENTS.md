# Agents Guide — Options Trading Bot

## Commands

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint . --ext .ts,.tsx
npm run test        # vitest run
npm run test -- --reporter=verbose   # single-file: npm run test -- tests/unit/risk/takeProfit.test.ts
npm run test:coverage                # checks ≥90% for risk/, orders/, money.ts
npm run start:backend                # tsx src/backend/app.ts (hot-reload: dev:backend)
npm run prisma:migrate               # prisma migrate dev
npx prisma db push --accept-data-loss --skip-generate  # container startup
```

## Architecture

- **Path alias `@/`** → `src/`. All imports use `@/backend/...` or `@/types/...`, never relative paths.
- **`Money` class** (`src/types/money.ts`): All monetary values use `Money.from(string)`. Native `number` only for scalars. Applies across DB, broker, API, UI.
- **Risk Engine** (`src/backend/risk/riskEngine.ts`): Pure, deterministic, side-effect-free. Output is `Intent[]`. Evaluates TP → SL → roll priority.
- **Env validation** (`src/shared/envSchema.ts`): Zod schema, crashes on missing/bad values. Use `.env.test` for tests. `DRY_RUN=true` is the default (no real orders in dev).
- **Structured logging**: JSON lines to stdout/info or stderr/error. Pipe to `jq` or Loki.

## Testing patterns

- Vitest with `globals: true` (no explicit imports needed for `describe`/`it`/`expect`).
- Each test file defines local factory helpers (`position()`, `config()`, `snapshot()`), no shared fixtures.
- Tiered directories: `tests/unit/` (per-module), `tests/integration/` (cross-module), `tests/contract/` (empty).
- Coverage threshold: ≥90% line/statement/function for `risk/**/*.ts`, `orders/**/*.ts`, `types/money.ts`.

## Project structure quirks

- **Frontend** in `src/frontend/` has its own `package.json`. Built separately: `npm install && npm run build` inside that dir.
- **`exactOptionalPropertyTypes`** enabled: optional props must include `| undefined` in patches.
- **`@prisma/client`** loaded via `require()` in persistenceService — eslint `no-require-imports` is `off` for this reason.
- **GitHub Actions**: pushes Docker image to `ghcr.io/<repo>` on push to main/master. Tags: `edge`, branch, `pr-*`, semver, SHA.
- **No pre-commit hooks** or lint-staged.
- **Docker**: multi-stage, runs as non-root `uid 1001`, uses `tini` as PID 1, `HEALTHCHECK` on `/api/health`.

## Testing env requirements

- `DATABASE_URL` must point to a SQLite file (`.env.test` default: `file:./prisma/dev.db`).
- Alpaca/Telegram env vars can be blank in `.env.test` if tests don't hit those services.
- Call `resetEnvForTests()` from `@/backend/config/env` between test runs if env changes.
