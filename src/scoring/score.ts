import type {
  CoverageBand,
  MetricId,
  ScoreBand,
  ScoreSummary,
  ScoredMetric,
} from "@/types";
import { CANONICAL_WEIGHTS, METRIC_IDS } from "./weights";

/* ------------------------------------------------------------------ */
/* Semantic bands                                                      */
/* ------------------------------------------------------------------ */

/**
 * Score bands are *regime match* language, never hazard language.
 * "Strong match" describes similarity to the hypothesised
 * loaded-but-quiet regime — it is NOT an alert level.
 */
export function scoreBand(score: number): ScoreBand {
  if (score < 25) return "weak";
  if (score < 45) return "limited";
  if (score < 65) return "moderate";
  if (score < 80) return "substantial";
  return "strong";
}

export function coverageBand(coverage: number): CoverageBand {
  if (coverage >= 0.9) return "excellent";
  if (coverage >= 0.75) return "good";
  if (coverage >= 0.5) return "partial";
  if (coverage >= 0.25) return "sparse";
  return "insufficient";
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

export interface WeightedMetricInput {
  id: string;
  score: number | null;
  weight?: number;
}

/**
 * Core score mathematics. Unknown metrics contribute nothing and are
 * never imputed as zero:
 *
 *   knownContribution = Σ(weightᵢ × scoreᵢ / 100)
 *   knownWeight       = Σ(weightᵢ where scoreᵢ ≠ null)
 *   observed          = knownContribution / knownWeight × 100
 *   full interval     = [knownContribution, knownContribution + missingWeight]
 *   neutralImputed    = knownContribution + missingWeight × 0.5
 *   coverage          = knownWeight / 100
 */
export function aggregateScoredMetrics(
  metrics: WeightedMetricInput[],
  weights: Record<MetricId, number> = CANONICAL_WEIGHTS,
): ScoreSummary {
  let knownContribution = 0;
  let knownWeight = 0;

  for (const metric of metrics) {
    const weight = metric.weight ?? weights[metric.id as MetricId] ?? 0;
    if (metric.score == null || !Number.isFinite(metric.score)) continue;
    knownContribution += (weight * clampScore(metric.score)) / 100;
    knownWeight += weight;
  }

  const missingWeight = Math.max(0, 100 - knownWeight);
  const coverage = knownWeight / 100;
  const observed =
    knownWeight > 0 ? (knownContribution / knownWeight) * 100 : null;

  return {
    knownContribution: round2(knownContribution),
    knownWeight: round2(knownWeight),
    missingWeight: round2(missingWeight),
    observed: observed == null ? null : round2(observed),
    minFull: round2(knownContribution),
    maxFull: round2(knownContribution + missingWeight),
    neutralImputed: round2(knownContribution + missingWeight * 0.5),
    coverage: round2(coverage),
    observedBand: observed == null ? null : scoreBand(observed),
    coverageBand: coverageBand(coverage),
  };
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Helpers over full metric sets                                       */
/* ------------------------------------------------------------------ */

export function metricContribution(
  metric: Pick<ScoredMetric, "score" | "weight">,
): number | null {
  if (metric.score == null) return null;
  return round2((metric.weight * clampScore(metric.score)) / 100);
}

/** id of the known metric contributing most weight×score to the total */
export function dominantMetric(
  metrics: ScoredMetric[],
): MetricId | null {
  let best: { id: MetricId; contribution: number } | null = null;
  for (const m of metrics) {
    if (m.score == null) continue;
    const c = (m.weight * clampScore(m.score)) / 100;
    if (!best || c > best.contribution) best = { id: m.id as MetricId, contribution: c };
  }
  return best?.id ?? null;
}

export function missingMetricIds(metrics: ScoredMetric[]): MetricId[] {
  const missing = metrics
    .filter((m) => m.score == null)
    .map((m) => m.id as MetricId);
  const order = new Map(METRIC_IDS.map((id, i) => [id, i]));
  return missing.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
