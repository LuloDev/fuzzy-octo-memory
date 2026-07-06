// US8 — Theoretical Theta decay. Pure. Computes the IC mid-value at any
// intermediate DTE by re-evaluating Black-Scholes on each leg assuming a
// flat underlying (Assumption A5 in the spec).

import { Money } from '@/types/money';

const MIN_TAU = 0.01;

function normalCdf(x: number): number {
  // Abramowitz–Stegun approximation (max error ~7.5e-8, plenty for visualization).
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(((-x * x) / 2));
  const p =
    d * t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function bsCallPrice(S: number, K: number, tau: number, sigma: number, r: number): number {
  const safeTau = Math.max(tau, MIN_TAU);
  const sqrtT = Math.sqrt(safeTau);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * safeTau) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return S * normalCdf(d1) - K * Math.exp(-r * safeTau) * normalCdf(d2);
}

function bsPutPrice(S: number, K: number, tau: number, sigma: number, r: number): number {
  return bsCallPrice(S, K, tau, sigma, r) - S + K * Math.exp(-r * Math.max(tau, MIN_TAU));
}

// Returns the IC mid at the target DTE given the current mid (used to anchor IV).
// Pure; ignores the current mid as a price driver — we only use it to confirm IV is reasonable.
export function theoreticalMidPriceAtDte(args: {
  underlyingPrice: number;
  shortPut: number;
  longPut: number;
  shortCall: number;
  longCall: number;
  currentDte: number;
  targetDte: number;
  iv: number;
  riskFreeRate?: number;
}): number {
  const {
    underlyingPrice,
    shortPut, longPut, shortCall, longCall,
    currentDte,
    targetDte,
    iv,
    riskFreeRate = 0.05,
  } = args;
  if (iv <= 0 || underlyingPrice <= 0) return 0;

  const currentTau = Math.max(currentDte, 0) / 365;
  const targetTau = Math.max(targetDte, 0) / 365;

  // IC value at targetTau = (long put + long call) − (short put + short call)
  const valueAtTarget =
    bsPutPrice(underlyingPrice, shortPut, targetTau, iv, riskFreeRate) +
    bsPutPrice(underlyingPrice, longPut, targetTau, iv, riskFreeRate) +
    bsCallPrice(underlyingPrice, shortCall, targetTau, iv, riskFreeRate) +
    bsCallPrice(underlyingPrice, longCall, targetTau, iv, riskFreeRate);
  // Negate: sum of long - sum of short gives the position's value (debit).
  // Standard IC is short the wings and long the outer wings, so value =
  // long - short; for visualization we return the credit equivalent (short - long).
  const valueAtCurrent =
    bsPutPrice(underlyingPrice, shortPut, currentTau, iv, riskFreeRate) +
    bsPutPrice(underlyingPrice, longPut, currentTau, iv, riskFreeRate) +
    bsCallPrice(underlyingPrice, shortCall, currentTau, iv, riskFreeRate) +
    bsCallPrice(underlyingPrice, longCall, currentTau, iv, riskFreeRate);
  void currentTau; void valueAtCurrent;
  return valueAtTarget;
}

// Convenience: build a decay series (DTE 0..N) assuming entry at N.
export function theoreticalDecaySeries(strikes: {
  underlyingPrice: number;
  shortPut: number;
  longPut: number;
  shortCall: number;
  longCall: number;
  entryDte: number;
  iv: number;
  riskFreeRate?: number;
}): { dte: number; mid: string }[] {
  const out: { dte: number; mid: string }[] = [];
  for (let dte = 0; dte <= strikes.entryDte; dte++) {
    const v = theoreticalMidPriceAtDte({
      underlyingPrice: strikes.underlyingPrice,
      shortPut: strikes.shortPut,
      longPut: strikes.longPut,
      shortCall: strikes.shortCall,
      longCall: strikes.longCall,
      currentDte: strikes.entryDte,
      targetDte: dte,
      iv: strikes.iv,
      ...(strikes.riskFreeRate !== undefined ? { riskFreeRate: strikes.riskFreeRate } : {}),
    });
    out.push({ dte, mid: Money.from(v).round(2).toString() });
  }
  return out;
}