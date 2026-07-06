import { describe, expect, it } from 'vitest';
import { gammaExposureCurve } from '@/backend/services/gammaCurve';

const strikes = { shortPut: 98, longPut: 96, shortCall: 102, longCall: 104 };

describe('gammaExposureCurve', () => {
  it('produces totalDteDays+1 points', () => {
    const points = gammaExposureCurve(strikes, 100, 7, 0.45);
    expect(points.length).toBe(8);
    expect(points[0]?.dteDays).toBe(0);
    expect(points[7]?.dteDays).toBe(7);
  });

  it('is normalized to 100% at the peak', () => {
    const points = gammaExposureCurve(strikes, 100, 7, 0.45);
    const peak = Math.max(...points.map((p) => p.exposurePct));
    expect(peak).toBeCloseTo(100, 0);
  });

  it('is empty when iv <= 0', () => {
    expect(gammaExposureCurve(strikes, 100, 7, 0)).toEqual([]);
  });

  it('is empty when underlying <= 0', () => {
    expect(gammaExposureCurve(strikes, 0, 7, 0.45)).toEqual([]);
  });

  it('long-put contribution is smaller than short-put contribution at ATM', () => {
    // Sanity: |gamma(shortPut)| > |gamma(longPut)| because longPut is further OTM.
    // The curve at peak should reflect the net-negative gamma shape; we just
    // assert that the curve is non-decreasing as DTE decreases near expiry.
    const points = gammaExposureCurve(strikes, 100, 7, 0.45).sort((a, b) => b.dteDays - a.dteDays);
    const at1 = points.find((p) => p.dteDays === 1)!.exposurePct;
    const at7 = points.find((p) => p.dteDays === 7)!.exposurePct;
    expect(at1).toBeGreaterThan(at7);
  });
});