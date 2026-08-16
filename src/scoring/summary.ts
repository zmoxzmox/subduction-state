import type { MetricId, ScoredMetric } from "@/types";

/**
 * Deterministic current-state summary (spec §45).
 *
 * No LLM. Fixed rules over metric scores; output is a list of i18n
 * keys (+ params) rendered by the UI in the active language.
 */

export interface SummaryClause {
  key: string;
  params?: Record<string, string | number>;
}

function metric(
  metrics: ScoredMetric[],
  id: MetricId,
): Pick<ScoredMetric, "score" | "status"> {
  const m = metrics.find((x) => x.id === id);
  return m ?? { score: null, status: "missing" };
}

export function buildSummaryClauses(metrics: ScoredMetric[]): SummaryClause[] {
  const clauses: SummaryClause[] = [];

  const coupling = metric(metrics, "couplingAsperity").score;
  const slip = metric(metrics, "slipDeficitMaturity").score;
  const longGap = metric(metrics, "longTermQuiescence").score;
  const recentQui = metric(metrics, "recentQuiescence").score;
  const activation = metric(metrics, "interfaceActivation").score;
  const gnss = metric(metrics, "gnssTransient").score;
  const env = metric(metrics, "environmentalPerturbation").score;
  const remote = metric(metrics, "remotePerturbation").score;
  const migration = metric(metrics, "alongMarginMigration").score;

  // --- structural loading & quiet regime ------------------------------
  const structural = [coupling, slip, longGap].filter(
    (s): s is number => s != null,
  );
  const structuralAvg =
    structural.length > 0
      ? structural.reduce((a, b) => a + b, 0) / structural.length
      : null;

  if (
    coupling != null && coupling > 80 &&
    longGap != null && longGap > 70 &&
    recentQui != null && recentQui > 60 &&
    activation != null && activation < 30
  ) {
    clauses.push({ key: "summary.regimeLoadedQuiet" });
  } else if (structuralAvg != null && structuralAvg > 65) {
    clauses.push({ key: "summary.structuralLoadingDominates" });
  } else if (structuralAvg != null && structuralAvg > 40) {
    clauses.push({ key: "summary.structuralLoadingModerate" });
  } else if (structural.length === 0) {
    clauses.push({ key: "summary.noStructuralData" });
  } else {
    clauses.push({ key: "summary.structuralLoadingLow" });
  }

  // --- recent behaviour ----------------------------------------------
  if (recentQui != null && recentQui > 60 && activation != null && activation < 30) {
    clauses.push({ key: "summary.quietWithLimitedActivation" });
  } else if (activation != null && activation > 60) {
    clauses.push({ key: "summary.edgeActivationElevated" });
  } else if (recentQui != null && recentQui < 30) {
    clauses.push({ key: "summary.recentSeismicityNearBackground" });
  }

  // --- geodetic --------------------------------------------------------
  if (gnss == null) {
    clauses.push({ key: "summary.gnssIncomplete" });
  } else if (gnss > 60) {
    clauses.push({ key: "summary.gnssElevated" });
  }

  // --- environmental ---------------------------------------------------
  if (env != null && env > 80) {
    clauses.push({ key: "summary.environmentAnomalous" });
  } else if (env != null && env > 50) {
    clauses.push({ key: "summary.environmentElevated" });
  }

  // --- remote perturbation ---------------------------------------------
  if (remote != null && remote > 25) {
    clauses.push({ key: "summary.remotePerturbationElevated" });
  }

  // --- migration --------------------------------------------------------
  if (migration != null && migration > 60) {
    clauses.push({ key: "summary.migrationSignal" });
  }

  return clauses;
}
