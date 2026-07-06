// Unit tests for classifyProximity. Pure, exhaustive boundaries.
import { describe, expect, it } from 'vitest';
import { classifyProximity } from '@/backend/services/proximityClassifier';

const SP = '100'; // short put
const SC = '110'; // short call

describe('classifyProximity', () => {
  it('classifies SAFE when distance > 5%', () => {
    const r = classifyProximity('105', SP, SC);
    expect(r?.putSide).toBe('SAFE'); // 5% exactly
    expect(r?.callSide).toBe('SAFE'); // 4.5%
  });

  it('classifies SAFE when underlying is exactly between strikes', () => {
    const r = classifyProximity('106', SP, SC);
    expect(r?.putSide).toBe('SAFE'); // 6%
    expect(r?.callSide).toBe('SAFE'); // 3.6%
  });

  it('classifies WARNING at 1.5%', () => {
    // Put side: underlying is 1.5% ABOVE the short put (still safe but close).
    const r = classifyProximity('101.5', SP, SC);
    expect(r?.putSide).toBe('WARNING');
    expect(r?.callSide).toBe('SAFE');
  });

  it('classifies SAFE between 1.5% and 5% (warning is strictly ≤1.5%)', () => {
    const r = classifyProximity('102', SP, SC); // 2% above short put
    expect(r?.putSide).toBe('SAFE');
  });

  it('classifies BREACH when underlying is below short put', () => {
    const r = classifyProximity('99.99', SP, SC); // 0.01% below short put
    expect(r?.putSide).toBe('BREACH');
  });

  it('classifies BREACH when underlying is above short call', () => {
    const r = classifyProximity('110.01', SP, SC);
    expect(r?.callSide).toBe('BREACH');
  });

  it('returns null when underlying is zero', () => {
    expect(classifyProximity('0', SP, SC)).toBeNull();
  });

  it('returns null when short strike is zero', () => {
    expect(classifyProximity('100', '0', SC)).toBeNull();
  });

  it('rounds percent to 2 decimal places', () => {
    const r = classifyProximity('103.333', SP, SC);
    expect(r?.putDistancePct).toMatch(/^\d+\.\d{2}$/);
  });
});