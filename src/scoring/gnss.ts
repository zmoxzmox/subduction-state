import { clamp, mad, median } from "@/lib/utils";

/**
 * Component 6 — GNSS / strain transient (weight 20).
 *
 * Uses processed position time series (UNR NGL tenv3). For each station:
 * remove the secular trend + annual seasonal signal, then compare the
 * recent residual to the station's own historical distribution:
 *
 *   robustZ = |recentResidual − historicalMedian| / (1.4826 × historicalMAD)
 *
 * Per station the horizontal score is the 2-D combination of the east
 * and north components. Aggregation across stations is ROBUST (median),
 * so one noisy station cannot drive the metric. If fewer than 3 usable
 * stations exist the metric is UNKNOWN — missing GNSS is never zero.
 */

export const GNSS_Z_ANCHORS: Array<[z: number, score: number]> = [
  [1.5, 0],
  [2.0, 25],
  [2.5, 50],
  [3.0, 75],
  [4.0, 100],
];

export function robustZToScore(z: number): number {
  // clamp to the anchor domain so nothing extrapolates below z = 1.5
  const x = Math.max(GNSS_Z_ANCHORS[0][0], clamp(z, 0, 4.5));
  for (let i = 0; i < GNSS_Z_ANCHORS.length - 1; i++) {
    const [x0, y0] = GNSS_Z_ANCHORS[i];
    const [x1, y1] = GNSS_Z_ANCHORS[i + 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 100;
}

export const MIN_USABLE_STATIONS = 3;
export const RECENT_WINDOW_DAYS = 60;

export interface GnssSeriesPoint {
  /** epoch ms */
  t: number;
  /** east residual in mm (trend + annual removed) */
  e: number;
  /** north residual in mm */
  n: number;
}

export interface StationAnomaly {
  stationId: string;
  zEast: number;
  zNorth: number;
  /** sqrt(zE² + zN²) — at least as large as the larger component */
  zHorizontal: number;
  recentResidualE: number;
  recentResidualN: number;
  madE: number;
  madN: number;
  series: GnssSeriesPoint[];
}

/**
 * Detrended residual anomaly for one station.
 * The caller supplies residuals (trend/seasonal already removed) OR raw
 * positions, in which case a linear + annual fit is applied here.
 */
export function computeStationAnomaly(
  stationId: string,
  samples: Array<{ t: number; e: number; n: number }>,
  now: number,
  recentWindowDays = RECENT_WINDOW_DAYS,
): StationAnomaly | null {
  if (samples.length < 200) return null; // need a meaningful history

  const residuals = removeTrendAndAnnual(samples);

  const recentCutoff = now - recentWindowDays * 86_400_000;
  const recent = residuals.filter((s) => s.t >= recentCutoff);
  const historical = residuals.filter((s) => s.t < recentCutoff);
  if (recent.length < 5 || historical.length < 100) return null;

  const medE = median(historical.map((s) => s.e));
  const medN = median(historical.map((s) => s.n));
  const robustMadE = 1.4826 * mad(historical.map((s) => s.e));
  const robustMadN = 1.4826 * mad(historical.map((s) => s.n));
  if (robustMadE <= 0 || robustMadN <= 0) return null;

  const recentE = median(recent.map((s) => s.e));
  const recentN = median(recent.map((s) => s.n));

  const zE = Math.abs(recentE - medE) / robustMadE;
  const zN = Math.abs(recentN - medN) / robustMadN;

  return {
    stationId,
    zEast: zE,
    zNorth: zN,
    zHorizontal: Math.sqrt(zE * zE + zN * zN),
    recentResidualE: recentE,
    recentResidualN: recentN,
    madE: robustMadE,
    madN: robustMadN,
    series: residuals,
  };
}

/** Fit [1, t, sin(2πt), cos(2πt)] per component via least squares, return residuals (mm). */
export function removeTrendAndAnnual(
  samples: Array<{ t: number; e: number; n: number }>,
): GnssSeriesPoint[] {
  const t0 = samples[0].t;
  const yearMs = 365.25 * 86_400_000;
  // design: [1, yearsSinceStart, sin, cos] — solve normal equations (4×4)
  const build = (vals: number[]) => {
    const X = samples.map((s) => {
      const yr = (s.t - t0) / yearMs;
      const w = (2 * Math.PI * ((s.t / yearMs) % 1));
      return [1, yr, Math.sin(w), Math.cos(w)];
    });
    return solveLeastSquares(X, vals);
  };
  const betaE = build(samples.map((s) => s.e));
  const betaN = build(samples.map((s) => s.n));

  return samples.map((s) => {
    const yr = (s.t - t0) / yearMs;
    const w = 2 * Math.PI * ((s.t / yearMs) % 1);
    const f = [1, yr, Math.sin(w), Math.cos(w)];
    return {
      t: s.t,
      e: s.e - f.reduce((acc, fi, i) => acc + fi * betaE[i], 0),
      n: s.n - f.reduce((acc, fi, i) => acc + fi * betaN[i], 0),
    };
  });
}

function solveLeastSquares(X: number[][], y: number[]): number[] {
  const m = X[0].length;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);
  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < m; i++) {
      b[i] += X[r][i] * y[r];
      for (let j = 0; j < m; j++) A[i][j] += X[r][i] * X[r][j];
    }
  }
  return gaussianSolve(A, b);
}

function gaussianSolve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    }
    [M[i], M[piv]] = [M[piv], M[i]];
    const d = M[i][i] || 1e-12;
    for (let j = i; j <= n; j++) M[i][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let j = i; j <= n; j++) M[r][j] -= f * M[i][j];
    }
  }
  return M.map((row) => row[n]);
}

export interface GnssAggregateResult {
  score: number | null;
  medianZ: number | null;
  topQuartileZ: number | null;
  stationCount: number;
  anomalies: StationAnomaly[];
  insufficientStations: boolean;
}

export function aggregateGnss(
  anomalies: StationAnomaly[],
): GnssAggregateResult {
  const usable = anomalies.filter((a) => Number.isFinite(a.zHorizontal));
  if (usable.length < MIN_USABLE_STATIONS) {
    return {
      score: null,
      medianZ: null,
      topQuartileZ: null,
      stationCount: usable.length,
      anomalies: usable,
      insufficientStations: true,
    };
  }
  const zs = usable.map((a) => a.zHorizontal).sort((a, b) => a - b);
  const medianZ = median(zs);
  const q3 = zs[Math.min(zs.length - 1, Math.floor(zs.length * 0.75))];
  return {
    score: robustZToScore(medianZ),
    medianZ,
    topQuartileZ: q3,
    stationCount: usable.length,
    anomalies: usable,
    insufficientStations: false,
  };
}
