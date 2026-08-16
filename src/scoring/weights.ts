import type { MetricId } from "@/types";

/**
 * Loaded–Quiet Megathrust Regime Score — canonical V0.1 weights.
 *
 * These weights are the methodological contract of the prototype.
 * Do not modify casually. Research mode may override them, but the
 * canonical set is always restorable and always displayed alongside
 * any custom configuration.
 */
export const METHODOLOGY_VERSION = "0.1";

export const CANONICAL_WEIGHTS: Record<MetricId, number> = {
  couplingAsperity: 20, // Megathrust coupling / asperity geometry
  slipDeficitMaturity: 15, // Accumulated slip deficit / cycle maturity
  longTermQuiescence: 10, // Long-term seismic gap / persistent quiescence
  recentQuiescence: 10, // Recent local seismic quiescence
  interfaceActivation: 10, // Local interface / edge activation
  gnssTransient: 20, // Current GNSS / strain transient
  environmentalPerturbation: 5, // Ocean / climate / hydrological perturbation
  remotePerturbation: 3, // Remote dynamic / same-margin perturbation
  volcanicResponse: 2, // Volcanic multidomain response
  alongMarginMigration: 5, // Along-margin migration
};

export const METRIC_IDS = Object.keys(CANONICAL_WEIGHTS) as MetricId[];

/** Sum of the canonical weights — must always be exactly 100. */
export function canonicalWeightTotal(): number {
  return METRIC_IDS.reduce((sum, id) => sum + CANONICAL_WEIGHTS[id], 0);
}

export function isValidWeightSet(weights: Record<MetricId, number>): boolean {
  const ids = Object.keys(weights) as MetricId[];
  if (ids.length !== METRIC_IDS.length) return false;
  return (
    ids.every(
      (id) =>
        Number.isFinite(weights[id]) && weights[id] >= 0 && weights[id] <= 100,
    ) && Math.abs(ids.reduce((s, id) => s + weights[id], 0) - 100) < 1e-9
  );
}
