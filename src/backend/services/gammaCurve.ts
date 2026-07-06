// US3 — Gamma exposure curve. Pure. Implements Black-Scholes Gamma on each
// leg of the IC and combines them (long wings reduce, short wings amplify).
// Capped at MIN_TAU to avoid the DTE=0 singularity (spec Assumption A4).

export type IronCondorStrikes = {
  shortPut: number;
  longPut: number;
  shortCall: number;
  longCall: number;
};

export type GammaPoint = { dteDays: number; exposurePct: number };

const MIN_TAU = 0.01; // ≈ 3.65 days; prevents the 1/√τ blow-up at expiry
const SQRT_2PI = Math.sqrt(2 * Math.PI);

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

function bsGamma(S: number, K: number, tau: number, sigma: number, r: number): number {
  const safeTau = Math.max(tau, MIN_TAU);
  const sqrtT = Math.sqrt(safeTau);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * safeTau) / (sigma * sqrtT);
  return normalPdf(d1) / (S * sigma * sqrtT);
}

function netGamma(strikes: IronCondorStrikes, S: number, tau: number, iv: number, r: number): number {
  const g = (K: number) => bsGamma(S, K, tau, iv, r);
  return -g(strikes.shortPut) - g(strikes.shortCall) + g(strikes.longPut) + g(strikes.longCall);
}

export function gammaExposureCurve(
  strikes: IronCondorStrikes,
  underlyingPrice: number,
  totalDteDays: number,
  iv: number,
  riskFreeRate = 0.05,
): GammaPoint[] {
  if (iv <= 0 || underlyingPrice <= 0) return [];
  const points: GammaPoint[] = [];
  const raw: { dte: number; absGamma: number }[] = [];
  for (let dte = totalDteDays; dte >= 0; dte--) {
    const tau = Math.max(dte, 0) / 365;
    const g = Math.abs(netGamma(strikes, underlyingPrice, tau, iv, riskFreeRate));
    raw.push({ dte, absGamma: g });
  }
  const peak = Math.max(...raw.map((r) => r.absGamma), 0);
  if (peak === 0) return [];
  for (const r of raw) {
    points.push({ dteDays: r.dte, exposurePct: Math.round((r.absGamma / peak) * 1000) / 10 });
  }
  return points.sort((a, b) => a.dteDays - b.dteDays);
}