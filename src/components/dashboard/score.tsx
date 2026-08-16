"use client";

import * as React from "react";
import type { ScoreSummary, ScoredMetric } from "@/types";
import { useI18n } from "@/i18n/provider";
import { useViz } from "@/lib/viz";
import { cn } from "@/lib/utils";
import { aggregateScoredMetrics } from "@/scoring/score";
import { useResearchConfig } from "@/research/config-context";
import { Tooltip } from "@/components/ui/controls";

/** The hero score presentation: observed + band + coverage + range. */
export function ScoreHero({
  summary,
  size = "lg",
  className,
}: {
  summary: ScoreSummary;
  size?: "lg" | "sm";
  className?: string;
}) {
  const { t, formatNumber } = useI18n();
  const viz = useViz();
  const observed = summary.observed;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end gap-3">
        <div
          className={cn(
            "font-semibold leading-none tracking-tight",
            size === "lg" ? "text-5xl" : "text-3xl",
          )}
          style={observed != null ? { color: viz.scoreColor(observed) } : undefined}
          aria-label={t("score.observedLabel")}
        >
          {observed != null ? formatNumber(Math.round(observed)) : "—"}
        </div>
        <span className="pb-1 text-sm text-ink-3">/ 100</span>
        {observed != null && (
          <span className="pb-1.5 text-xs font-medium text-ink-2">
            {t(`score.band.${summary.observedBand}`)}
          </span>
        )}
      </div>

      {observed == null && (
        <p className="text-xs font-medium text-ink-3">{t("score.insufficientData")}</p>
      )}

      <CoverageMeter summary={summary} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span className="tnum">
          {t("score.fullRange")}:{" "}
          <strong className="font-semibold text-ink">
            {formatNumber(summary.minFull, { maximumFractionDigits: 1 })}–
            {formatNumber(summary.maxFull, { maximumFractionDigits: 1 })}
          </strong>
        </span>
        <Tooltip content={t("score.neutralImputed")}>
          <span className="tnum text-ink-3">
            ⊘ {formatNumber(summary.neutralImputed, { maximumFractionDigits: 1 })}
          </span>
        </Tooltip>
      </div>
      <p className="text-[11px] text-ink-3">{t("score.notProbability")}</p>
    </div>
  );
}

/** Coverage is as visible as the score (spec §11). */
export function CoverageMeter({ summary }: { summary: ScoreSummary }) {
  const { t, formatNumber } = useI18n();
  const viz = useViz();
  const pct = Math.round(summary.coverage * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          {t("score.coverage")}
        </span>
        <span className="text-xs text-ink-2 tnum">
          {pct}% · {t(`score.coverageBand.${summary.coverageBand}`)}
        </span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${t("score.coverage")}: ${pct}%`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background:
              summary.coverageBand === "insufficient" || summary.coverageBand === "sparse"
                ? undefined
                : viz.coverageColor(pct),
          }}
        >
          {(summary.coverageBand === "insufficient" || summary.coverageBand === "sparse") && (
            <div className="hatch-low-coverage h-full w-full" />
          )}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-ink-3">
        {t("score.dataKnown", { pct: formatNumber(pct) })}
      </p>
    </div>
  );
}

/** Compact inline score + coverage chip (tables, map panels). */
export function ScoreChip({
  summary,
  showBand = true,
}: {
  summary: ScoreSummary;
  showBand?: boolean;
}) {
  const { t, formatNumber } = useI18n();
  const viz = useViz();
  const observed = summary.observed;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-[3px]"
        style={{
          background: observed != null ? viz.scoreColor(observed) : undefined,
        }}
        aria-hidden
      >
        {observed == null && <span className="hatch-low-coverage block h-full w-full" />}
      </span>
      <span className="font-semibold text-ink tnum">
        {observed != null ? formatNumber(Math.round(observed)) : "—"}
      </span>
      {showBand && observed != null && (
        <span className="text-[11px] text-ink-3">
          {t(`score.band.${summary.observedBand}`)}
        </span>
      )}
      <span className="text-[11px] text-ink-3 tnum">
        ({Math.round(summary.coverage * 100)}%)
      </span>
    </span>
  );
}

/** Horizontal metric bar for the score breakdown. */
export function MetricBar({ metric }: { metric: ScoredMetric }) {
  const viz = useViz();
  const score = metric.score;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
      {score != null ? (
        <div
          className="h-full rounded-full"
          style={{
            width: `${score}%`,
            background: viz.scoreColor(score),
          }}
        />
      ) : (
        <div className="hatch-low-coverage h-full w-full opacity-60" />
      )}
    </div>
  );
}

/** Re-aggregates metrics with the active research weights. */
export function useSummary(metrics: ScoredMetric[]): ScoreSummary {
  const { aggregate } = useResearchConfig();
  return React.useMemo(() => aggregate(metrics), [aggregate, metrics]);
}

export { aggregateScoredMetrics };

/** Mode label for data provenance (live / cached / fixture). */
export function ModeLabel({ mode }: { mode: string }) {
  const { t } = useI18n();
  if (mode === "fixture") {
    return (
      <span className="rounded border border-[color-mix(in_srgb,var(--viz-2)_35%,transparent)] bg-[color-mix(in_srgb,var(--viz-2)_10%,transparent)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[var(--viz-2)]">
        {t("common.fixtureData")}
      </span>
    );
  }
  if (mode === "cached") {
    return (
      <span className="rounded border border-line-2 bg-surface-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-ink-3">
        {t("common.cachedData")}
      </span>
    );
  }
  return null;
}
