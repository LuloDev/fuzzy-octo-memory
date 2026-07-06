// Shared Prisma client for tests that exercise persistence. Each test
// process gets its own SQLite file under ./prisma/<name>.db. We provision
// the schema on first connect via `prisma db push` so the test suite is
// runnable on a fresh checkout without a manual migrate step.
//
// Bootstrapping the client per-test is slow (each instance spins the
// query engine), so we cache one PrismaClient per process and reset data
// via `deleteMany` in beforeEach hooks.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

function defaultDbPath(): string {
  // Resolve to an absolute path so both prisma db push (relative to the
  // schema file) and the PrismaClient at runtime (relative to the process
  // cwd) point at the same file.
  return resolve(process.cwd(), 'prisma', 'test.db');
}

// Normalize to an absolute file URL so client + CLI agree on the path.
const rawUrl = process.env.TEST_DATABASE_URL ?? `file:${defaultDbPath()}?_journal_mode=wal&_pragma=foreign_keys(ON)`;
const withoutScheme = rawUrl.replace(/^file:/, '');
const queryIdx = withoutScheme.indexOf('?');
const rawPath = queryIdx >= 0 ? withoutScheme.slice(0, queryIdx) : withoutScheme;
const query = queryIdx >= 0 ? withoutScheme.slice(queryIdx + 1) : '';
const url = `file:${resolve(rawPath)}${query ? `?${query}` : ''}`;

let _client: PrismaClient | null = null;
let _schemaEnsured = false;

async function ensureSchema(): Promise<void> {
  if (_schemaEnsured) return;
  _schemaEnsured = true;

  // SQLite + the file path baked into url. If there's no app_state table
  // we know the schema was never pushed — run a single `db push` so the
  // test gets a usable DB.
  const probe = new PrismaClient({ datasources: { db: { url } } });
  try {
    await probe.$connect();
    await probe.appState.count();
    return;
  } catch {
    // Schema missing — fall through to db push.
  } finally {
    await probe.$disconnect().catch(() => {});
  }

  // file: URLs may include `?...` pragmas; strip them for db push.
  const cleanUrl = url.split('?')[0] ?? url;
  const absolutePath = cleanUrl.replace(/^file:/, '');
  const dir = resolve(absolutePath, '..');
  mkdirSync(dir, { recursive: true });

  const result = spawnSync('npx', ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'], {
    env: { ...process.env, DATABASE_URL: cleanUrl },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`prisma db push failed (exit ${result.status ?? 'unknown'})`);
  }
  if (!existsSync(absolutePath)) {
    throw new Error(`prisma db push did not create ${absolutePath}`);
  }
}

export async function prisma(): Promise<PrismaClient> {
  if (!_client) {
    await ensureSchema();
    _client = new PrismaClient({ datasources: { db: { url } } });
    await _client.$connect();
  }
  return _client;
}

export function testDbUrl(): string {
  return url;
}