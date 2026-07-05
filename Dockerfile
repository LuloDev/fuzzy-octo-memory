# syntax=docker/dockerfile:1.7

# Iron Condor Trading Bot — Dockerfile
# Multi-stage build on node:22-bookworm-slim so we sidestep the Prisma
# "linux-nixos" 404 (Prisma publishes a normal Debian OpenSSL engine binary
# that this image can download).

# -----------------------------------------------------------------------------
# Stage 1: install all deps + build the frontend + generate the Prisma client.
# Carries the dev toolchain and is discarded before the runtime image.
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Prisma engines need libssl at download time on Debian.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Backend deps (full, including dev — used below to run prisma generate).
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Frontend deps + build. Installed in place under src/frontend/node_modules
# because the frontend has its own package.json and Vite expects that layout.
COPY src/frontend ./src/frontend
RUN cd src/frontend \
    && npm install --no-audit --no-fund \
    && npm run build

# Prisma schema + generate the client.
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate

# -----------------------------------------------------------------------------
# Stage 2: runtime — production deps only, non-root, healthcheck, tini.
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Runtime OS deps: openssl (Prisma client), curl (healthcheck), tini (PID 1
# for clean SIGTERM forwarding → monitoring.stop() + app.close()).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:./prisma/dev.db \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# Production deps + the two CLIs we need at runtime (tsx to run TS, prisma
# to apply migrations). Installed --no-save so package.json stays clean.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm install --no-save --no-package-lock --no-audit --no-fund prisma tsx \
    && npm cache clean --force

# Bring in the source tree + the Prisma client generated in the builder stage.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/src/frontend/dist ./src/frontend/dist
COPY prisma ./prisma
COPY src ./src
COPY tests ./tests
COPY tsconfig.json ./tsconfig.json
COPY vitest.config.ts ./vitest.config.ts
COPY eslint.config.js ./eslint.config.js
COPY .env.example ./.env.example

# Create writable dirs for the SQLite file + future log files; chown to the
# non-root user we're about to create.
RUN mkdir -p /app/prisma /app/logs \
    && chown -R 1001:1001 /app

# Non-root user (uid 1001) — Constitution Principle VI: least-privilege.
RUN groupadd --system --gid 1001 bot \
    && useradd --system --uid 1001 --gid bot --create-home --shell /sbin/nologin bot

USER bot

EXPOSE 3000

# Liveness probe via the /api/health route. 30 s cadence, 20 s grace period
# so the bot has time to apply migrations on first boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

# tini forwards SIGTERM/SIGINT to the bot's signal handlers
# (monitoring.stop() + app.close() + persistence.disconnect()).
ENTRYPOINT ["/usr/bin/tini", "--"]

# Every container start pushes the current `schema.prisma` to the database
# (idempotent, safe on every restart). `db push` is used in place of
# `migrate deploy` so the container works without a pre-generated migrations
# folder; once migrations are checked in, swap this to `migrate deploy`.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate && exec npx tsx src/backend/app.ts"]