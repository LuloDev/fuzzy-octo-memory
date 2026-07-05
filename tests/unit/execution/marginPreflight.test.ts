import { describe, it, expect } from 'vitest';
import { marginPreflight, worstCaseLoss } from '@/backend/services/executionService';
import { ExecutionService } from '@/backend/services/executionService';

describe('worstCaseLoss', () => {
  it('(width − credit) × contracts × 100', () => {
    // width=2, credit=0.85 (total for 1 combo, but helper divides by 100 first)
    // per contract: (2 − 0.85) × 100 = 115 ; × 1 = 115
    expect(worstCaseLoss('2.00', '85', 1).toString()).toBe('115');
    // 2 contracts
    expect(worstCaseLoss('2.00', '85', 2).toString()).toBe('230');
  });
});

describe('marginPreflight', () => {
  it('rejects when free BP < 1.5× worst-case loss', () => {
    // worst = 115, required = 172.5 ; BP=100 → reject
    const r = marginPreflight('100', '2.00', '85', 1);
    expect(r.ok).toBe(false);
    expect(r.required).toBe('172.5');
  });

  it('accepts when free BP >= 1.5× worst-case loss', () => {
    const r = marginPreflight('200', '2.00', '85', 1);
    expect(r.ok).toBe(true);
  });

  it('exactly at boundary is accepted (>=)', () => {
    const r = marginPreflight('172.5', '2.00', '85', 1);
    expect(r.ok).toBe(true);
  });
});

describe('ExecutionService static exports', () => {
  it('exposes preflight and worstCaseLoss for tests', () => {
    expect(typeof ExecutionService.preflight).toBe('function');
    expect(typeof ExecutionService.worstCaseLoss).toBe('function');
  });
});