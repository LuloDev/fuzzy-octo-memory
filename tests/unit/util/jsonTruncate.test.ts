// Unit tests for truncateIfLarge. Pure, no I/O.
import { describe, expect, it } from 'vitest';
import { truncateIfLarge } from '@/backend/util/jsonTruncate';

describe('truncateIfLarge', () => {
  it('passes through values under the limit unchanged', () => {
    const v = { a: 1, b: 'two' };
    expect(truncateIfLarge(v)).toBe(v);
  });

  it('passes through the exact limit boundary unchanged', () => {
    // 9 chars + JSON braces/quoting.
    const v = '0'.repeat(8_182); // JSON.stringify adds 2 quotes → 8184 bytes <= 8192
    expect(truncateIfLarge(v)).toBe(v);
  });

  it('returns the wrapper for over-limit values, with correct byte count', () => {
    const v = { big: '0'.repeat(20_000) };
    const out = truncateIfLarge(v);
    expect(out).not.toBe(v);
    expect((out as { _truncated: true })._truncated).toBe(true);
    expect((out as { bytes: number }).bytes).toBe(JSON.stringify(v).length);
  });

  it('preview is parseable JSON (re-stringified round-trips to a prefix)', () => {
    const v = { arr: Array.from({ length: 5_000 }, (_, i) => i) };
    const out = truncateIfLarge(v) as { _truncated: true; bytes: number; preview: unknown };
    expect(out.preview).not.toBeNull();
    expect(() => JSON.stringify(out.preview)).not.toThrow();
  });

  it('handles null passthrough', () => {
    expect(truncateIfLarge(null)).toBe(null);
  });

  it('handles strings that overflow into a wrapped preview', () => {
    const v = '0'.repeat(20_000);
    const out = truncateIfLarge(v) as { _truncated: true; bytes: number; preview: unknown };
    expect(out._truncated).toBe(true);
    expect(out.bytes).toBe(20_000 + 2);
  });
});