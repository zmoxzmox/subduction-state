import { clamp } from "@/lib/utils";

/**
 * Component 5 — Local interface / edge activation (weight 10).
 *
 * Activity concentrated around asperity edges / the convergent-boundary
 * corridor while a locked interior stays quiet. The recent corridor
 * count is scored as a percentile of its own Poisson distribution under
 * the historical baseline — a transparent stand-in for a full
 * historical-percentile calculation, documented as such.
 */

/* ---------------------------- Poisson CDF --------------------------- */

function lgamma(x: number): number {
  // Lanczos approximation
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < g.length; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * P(X ≤ k) for X ~ Poisson(λ), via the regularised upper incomplete
 * gamma function (Numerical Recipes gser/gcf).
 */
export function poissonCdf(k: number, lambda: number): number {
  if (lambda <= 0) return k >= 0 ? 1 : 0;
  if (k < 0) return 0;
  const a = k + 1;
  const EPS = 3e-12;
  const ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n <= 1000; n++) {
    const apn = ap + n;
    del *= lambda / apn;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  const pser = sum * Math.exp(-lambda + a * Math.log(lambda) - lgamma(a));
  return clamp(1 - pser, 0, 1); // regularised upper gamma Q(a, λ)
}

/* --------------------------- Score mapping -------------------------- */

/**
 * Documented anchors: <50th pct → 0–10, 75th → ~35, 90th → ~60,
 * 95th → ~75, 99th+ → 100.
 */
export const ACTIVATION_ANCHORS: Array<[percentile: number, score: number]> = [
  [0, 0],
  [50, 5],
  [75, 35],
  [90, 60],
  [95, 75],
  [99, 100],
  [100, 100],
];

export function percentileToActivationScore(pct: number): number {
  const p = clamp(pct, 0, 100);
  for (let i = 0; i < ACTIVATION_ANCHORS.length - 1; i++) {
    const [x0, y0] = ACTIVATION_ANCHORS[i];
    const [x1, y1] = ACTIVATION_ANCHORS[i + 1];
    if (p <= x1) return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 100;
}

/* ------------------------------ Compute ----------------------------- */

export interface ActivationInput {
  /** independent corridor events in the current window */
  recentCount: number;
  currentWindowDays: number;
  /** historical corridor rate (events/day) under the same geometry/filter */
  baselineRate: number | null;
  baselineDays: number;
  /** whether a curated coupling polygon existed (else boundary corridor) */
  hasCouplingGeometry: boolean;
  /** moment-tensor mechanism information available? */
  hasMechanismData: boolean;
}

export interface ActivationResult {
  score: number | null;
  percentile: number | null;
  expectedCount: number | null;
  recentCount: number;
  confidence: number;
  notes: string[];
}

export function computeActivation(input: ActivationInput): ActivationResult {
  const notes: string[] = [];
  const { recentCount, currentWindowDays, baselineRate, baselineDays } = input;

  if (baselineRate == null || baselineRate <= 0) {
    return {
      score: null,
      percentile: null,
      expectedCount: null,
      recentCount,
      confidence: 0,
      notes: ["no-corridor-baseline"],
    };
  }

  const expectedCount = baselineRate * currentWindowDays;
  if (expectedCount < 2) {
    // Minimum sample: a baseline expecting < 2 events/window cannot
    // resolve an activation signal.
    notes.push("insufficient-expected-count");
    return {
      score: null,
      percentile: null,
      expectedCount,
      recentCount,
      confidence: 0,
      notes,
    };
  }

  const percentile = (1 - poissonCdf(recentCount - 1, expectedCount)) * 100;

  let confidence = 0.55;
  if (baselineDays >= 3 * 365) confidence += 0.2;
  else notes.push("weak-baseline");
  if (input.hasCouplingGeometry) confidence += 0.1;
  else notes.push("boundary-corridor-not-coupling-polygon");
  if (!input.hasMechanismData) {
    confidence -= 0.1;
    notes.push("no-moment-tensor");
  }

  return {
    score: percentileToActivationScore(percentile),
    percentile,
    expectedCount,
    recentCount,
    confidence: clamp(confidence, 0, 1),
    notes,
  };
}
