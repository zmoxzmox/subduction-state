import type { MetricId } from "@/types";
import { CANONICAL_WEIGHTS, METRIC_IDS, isValidWeightSet } from "./weights";

/**
 * Research configuration. The canonical V0.1 configuration is the
 * default; any deviation is displayed as
 * "CUSTOM RESEARCH CONFIGURATION" in the UI.
 */

export interface ResearchConfig {
  version: string;
  /** metric → weight; canonical when equal to CANONICAL_WEIGHTS */
  weights: Record<MetricId, number>;
  /** metrics excluded from scoring entirely */
  disabledMetrics: MetricId[];
  thresholds: {
    /** minimum magnitude for quiescence/activation event selection */
    minMagnitude: number;
    /** GNSS robust-Z threshold considered anomalous (anchor midpoint) */
    gnssZThreshold: number;
  };
  windows: {
    /** recent quiescence window in days */
    recentDays: number;
    /** historical baseline length in days */
    baselineDays: number;
    /** remote perturbation radius in km */
    remoteRadiusKm: number;
  };
  declustering: boolean;
}

export const CANONICAL_CONFIG: ResearchConfig = {
  version: "0.1",
  weights: { ...CANONICAL_WEIGHTS },
  disabledMetrics: [],
  thresholds: {
    minMagnitude: 4.0,
    gnssZThreshold: 2.5,
  },
  windows: {
    recentDays: 30,
    baselineDays: 5 * 365,
    remoteRadiusKm: 2500,
  },
  declustering: true,
};

export function isCanonical(config: ResearchConfig): boolean {
  return (
    config.declustering === CANONICAL_CONFIG.declustering &&
    config.disabledMetrics.length === 0 &&
    config.thresholds.minMagnitude === CANONICAL_CONFIG.thresholds.minMagnitude &&
    config.thresholds.gnssZThreshold === CANONICAL_CONFIG.thresholds.gnssZThreshold &&
    config.windows.recentDays === CANONICAL_CONFIG.windows.recentDays &&
    config.windows.baselineDays === CANONICAL_CONFIG.windows.baselineDays &&
    config.windows.remoteRadiusKm === CANONICAL_CONFIG.windows.remoteRadiusKm &&
    METRIC_IDS.every(
      (id) => config.weights[id] === CANONICAL_WEIGHTS[id],
    )
  );
}

export function validateConfig(config: unknown): ResearchConfig | null {
  if (typeof config !== "object" || config === null) return null;
  const c = config as Partial<ResearchConfig>;
  if (
    !c.weights ||
    !isValidWeightSet(c.weights as Record<MetricId, number>)
  ) {
    return null;
  }
  const weights = c.weights as Record<MetricId, number>;
  const disabled = Array.isArray(c.disabledMetrics)
    ? (c.disabledMetrics.filter((m) =>
        METRIC_IDS.includes(m as MetricId),
      ) as MetricId[])
    : [];
  // disabled metrics must redistribute their weight to remain a valid set
  const effective: Record<MetricId, number> = { ...weights };
  for (const m of disabled) effective[m] = 0;
  const total = METRIC_IDS.reduce((s, id) => s + (effective[id] ?? 0), 0);
  if (Math.abs(total - 100) > 1e-9) return null;

  return {
    version: typeof c.version === "string" ? c.version : "0.1",
    weights,
    disabledMetrics: disabled,
    thresholds: {
      minMagnitude: clampNum(c.thresholds?.minMagnitude, 3, 6, 4.0),
      gnssZThreshold: clampNum(c.thresholds?.gnssZThreshold, 1.5, 4, 2.5),
    },
    windows: {
      recentDays: clampNum(c.windows?.recentDays, 7, 90, 30),
      baselineDays: clampNum(c.windows?.baselineDays, 365, 5 * 365, 5 * 365),
      remoteRadiusKm: clampNum(c.windows?.remoteRadiusKm, 500, 5000, 2500),
    },
    declustering: c.declustering !== false,
  };
}

function clampNum(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
