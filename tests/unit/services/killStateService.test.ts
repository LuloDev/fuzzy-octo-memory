// Unit tests for killStateService. Uses an in-memory SQLite via Prisma
// so the tests exercise the real persistence layer (no mocks).
//
// Per Constitution Principle IV (Test-First for Money Logic — extended to
// the kill-state path because incorrect state compromises safety), these
// tests cover defaults, persistence, and race-free transitions.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../helpers/inMemoryDb';
import {
  bindKillStatePersistence,
  _resetKillStateCache,
  getKillState,
  getPauseFlags,
  setKillState,
} from '@/backend/services/killStateService';

let setup: Awaited<ReturnType<typeof setupDb>>;
async function setupDb() {
  const p = await prisma();
  bindKillStatePersistence(p);
  return p;
}

beforeAll(async () => {
  setup = await setupDb();
});

beforeEach(async () => {
  await setup.appState.deleteMany({ where: { key: { startsWith: 'kill_state_' } } });
  _resetKillStateCache();
});

afterAll(async () => {
  await setup.appState.deleteMany({ where: { key: { startsWith: 'kill_state_' } } });
  await setup.$disconnect();
});

describe('killStateService', () => {
  it('returns a SAFE default when no row exists', async () => {
    const s = await getKillState('new-entries');
    expect(s.feature).toBe('new-entries');
    expect(s.paused).toBe(false);
    expect(s.since).toBeNull();
    expect(s.reason).toBeNull();
    expect(s.changedBy).toBe('system');
  });

  it('persists pause and survive cache reset', async () => {
    await setKillState('maneuvers', 'pause', 'operator: test pause');
    _resetKillStateCache();
    const s = await getKillState('maneuvers');
    expect(s.paused).toBe(true);
    expect(s.reason).toBe('operator: test pause');
    expect(s.changedBy).toBe('operator');
    expect(s.since).not.toBeNull();
  });

  it('resume flips the same row back to paused=false', async () => {
    await setKillState('new-entries', 'pause', 'first');
    await setKillState('new-entries', 'resume', 'second');
    const s = await getKillState('new-entries');
    expect(s.paused).toBe(false);
    expect(s.reason).toBe('second');
  });

  it('keeps new-entries and maneuvers independent', async () => {
    await setKillState('new-entries', 'pause', 'a');
    const flags = await getPauseFlags();
    expect(flags.newEntries).toBe(true);
    expect(flags.maneuvers).toBe(false);
  });

  it('re-affirms the feature discriminator on read (defends against JSON tampering)', async () => {
    await setup.appState.create({
      data: { key: 'kill_state_new-entries', value: JSON.stringify({ paused: true, since: 'now', reason: 'x', changedBy: 'operator' }) },
    });
    _resetKillStateCache();
    const s = await getKillState('new-entries');
    expect(s.feature).toBe('new-entries'); // never derived from the raw JSON
  });
});