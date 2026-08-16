import { clamp } from "@/lib/utils";
import type { EnsoState, EnvSample } from "@/types";

/**
 * Component 7 — Ocean / climate / hydrological perturbation (weight 5).
 *
 * Deliberately low weight: the causal earthquake-predictive value of
 * these signals is unvalidated. This is an experimental
 * boundary-condition indicator, nothing more. ENSO is global context,
 * never a local earthquake predictor.
 *
 * Sub-weights: 50% local SST anomaly, 30% sea-surface-height anomaly,
 * 20% ENSO / large-scale Pacific state.
 */

export const ENV_SUBWEIGHTS = { sst: 0.5, ssh: 0.3, enso: 0.2 } as const;

/** Map a local percentile (0..1) to a symmetric anomaly intensity score. */
export function percentileToIntensity(pct: number | null): number | null {
  if (pct == null) return null;
  // distance from the median, doubled: 0.5 → 0, 0.02/0.98 → 0.96
  return clamp(Math.abs(pct - 0.5) * 2 * 100, 0, 100);
}

/** |SSH anomaly| cm anchors → score */
export function sshAnomalyToScore(cm: number | null): number | null {
  if (cm == null) return null;
  return piecewiseLinear(Math.abs(cm), [
    [0, 0],
    [5, 25],
    [10, 50],
    [15, 75],
    [20, 100],
  ]);
}

/** |ONI| °C anchors → score */
export function oniToScore(oni: number | null): number | null {
  if (oni == null) return null;
  return piecewiseLinear(Math.abs(oni), [
    [0.5, 0],
    [0.8, 25],
    [1.2, 50],
    [1.6, 75],
    [2.0, 100],
  ]);
}

function piecewiseLinear(
  x: number,
  anchors: Array<[number, number]>,
): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return anchors[anchors.length - 1][1];
}

export interface EnvironmentResult {
  score: number | null;
  sstScore: number | null;
  sshScore: number | null;
  ensoScore: number | null;
  knownFraction: number;
  confidence: number;
}

export function computeEnvironment(
  sample: EnvSample | null,
  enso: EnsoState | null,
): EnvironmentResult {
  const sstScore = sample
    ? (percentileToIntensity(sample.sstPercentile) ??
      // fallback when only the raw anomaly is available (documented weaker)
      (sample.sstAnomalyC != null
        ? piecewiseLinear(Math.abs(sample.sstAnomalyC), [
            [0.25, 0],
            [0.5, 25],
            [1.0, 50],
            [1.75, 75],
            [2.5, 100],
          ])
        : null))
    : null;
  const sshScore = sample ? sshAnomalyToScore(sample.sshAnomalyCm) : null;
  const ensoScore = enso ? oniToScore(enso.oni) : null;

  const parts: Array<{ score: number; w: number }> = [];
  if (sstScore != null) parts.push({ score: sstScore, w: ENV_SUBWEIGHTS.sst });
  if (sshScore != null) parts.push({ score: sshScore, w: ENV_SUBWEIGHTS.ssh });
  if (ensoScore != null) parts.push({ score: ensoScore, w: ENV_SUBWEIGHTS.enso });

  if (parts.length === 0) {
    return {
      score: null,
      sstScore: null,
      sshScore: null,
      ensoScore: null,
      knownFraction: 0,
      confidence: 0,
    };
  }

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const score = parts.reduce((s, p) => s + p.score * p.w, 0) / totalW;
  const knownFraction = totalW;

  return {
    score: clamp(score, 0, 100),
    sstScore,
    sshScore,
    ensoScore,
    knownFraction,
    // experimental by construction; partial data lowers it further
    confidence: clamp(0.3 * knownFraction, 0, 0.35),
  };
}
