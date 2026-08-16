import { clamp } from "@/lib/utils";

/**
 * Component 4 — Recent local seismic quiescence (weight 10).
 *
 * Compares the region's recent independent-event rate against its own
 * historical baseline. Regions are never compared to each other.
 *
 * Suppression uses a Gamma–Poisson (negative-binomial) posterior for the
 * recent rate so that a tiny sample cannot produce a maximal score from
 * pure sampling noise: the prior is centred on the historical baseline
 * rate with a strength equivalent to `PRIOR_DAYS` days of observation.
 */

export const PRIOR_DAYS = 30;

/** Documented anchor points of the suppression → score transform. */
export const SUPPRESSION_ANCHORS: Array<[suppression: number, score: number]> = [
  [0.0, 0],
  [0.2, 25],
  [0.4, 50],
  [0.55, 75],
  [0.7, 100],
];

/** Piecewise-linear transform with clamping (smoothing, not hard steps). */
export function suppressionToScore(suppression: number): number {
  const s = clamp(suppression, 0, 1);
  for (let i = 0; i < SUPPRESSION_ANCHORS.length - 1; i++) {
    const [x0, y0] = SUPPRESSION_ANCHORS[i];
    const [x1, y1] = SUPPRESSION_ANCHORS[i + 1];
    if (s <= x1) {
      return y0 + ((s - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 100;
}

export interface QuiescenceInput {
  /** independent (declustered) events in the recent window, M ≥ threshold */
  recentCount: number;
  recentWindowDays: number;
  /** historical independent-equivalent count over the baseline (raw catalog count; see note) */
  baselineCount: number | null;
  baselineDays: number;
}

export interface QuiescenceResult {
  score: number | null;
  currentRate: number;
  baselineRate: number | null;
  posteriorRate: number;
  suppression: number | null;
  confidence: number;
  notes: string[];
}

export function computeQuiescence(input: QuiescenceInput): QuiescenceResult {
  const notes: string[] = [];
  const { recentCount, recentWindowDays, baselineCount, baselineDays } = input;

  const currentRate = recentCount / recentWindowDays;

  if (baselineCount == null || baselineDays <= 0) {
    return {
      score: null,
      currentRate,
      baselineRate: null,
      posteriorRate: NaN,
      suppression: null,
      confidence: 0,
      notes: ["no-historical-baseline"],
    };
  }

  const baselineRate = baselineCount / baselineDays;
  if (baselineRate <= 0) {
    return {
      score: null,
      currentRate,
      baselineRate,
      posteriorRate: NaN,
      suppression: null,
      confidence: 0,
      notes: ["zero-baseline-rate"],
    };
  }

  // Gamma–Poisson shrinkage: posterior mean of the recent rate with a
  // Gamma prior centred on the baseline rate, strength PRIOR_DAYS.
  const priorRate = baselineRate;
  const posteriorRate =
    (recentCount + priorRate * PRIOR_DAYS) / (recentWindowDays + PRIOR_DAYS);

  const suppression = 1 - posteriorRate / baselineRate;

  let confidence = 0.6;
  if (baselineDays >= 3 * 365) confidence = 0.85;
  else {
    notes.push("weak-baseline");
    if (baselineDays < 365) confidence = 0.35;
  }
  if (recentWindowDays < 14) confidence -= 0.15;
  if (recentCount === 0 && recentWindowDays < 14) {
    notes.push("very-short-window-zero");
  }

  return {
    score: suppression > 0 ? suppressionToScore(suppression) : 0,
    currentRate,
    baselineRate,
    posteriorRate,
    suppression,
    confidence: clamp(confidence, 0, 1),
    notes,
  };
}
