"use client";

import * as React from "react";
import type { MetricId, ScoredMetric } from "@/types";
import { useI18n } from "@/i18n/provider";
import { StatusBadge } from "@/components/ui/badge";
import { Sheet, SheetRow } from "@/components/ui/sheet";
import { MetricBar } from "./score";
import { metricContribution } from "@/scoring/score";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

/** Horizontal breakdown row; click opens the evidence drawer. */
export function BreakdownRow({
  metric,
  onOpen,
}: {
  metric: ScoredMetric;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const known = metric.score != null;
  return (
    <button
      onClick={onOpen}
      aria-label={t("evidence.openDrawer", {
        metric: t(`metrics.${metric.id}.fullName`),
      })}
      className={cn(
        "block w-full rounded-md border border-transparent px-3 py-2.5 text-left transition-colors",
        "hover:border-line hover:bg-surface-3/40 focus-visible:border-line",
      )}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink">
          {t(`metrics.${metric.id}.name`)}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("tnum text-xs font-semibold", !known && "text-ink-3")}>
            {known ? `${Math.round(metric.score!)}` : t("region.breakdown.unknown")}
          </span>
          <StatusBadge
            status={metric.status}
            label={t(`badges.${metric.status}`)}
          />
        </span>
      </div>
      <MetricBar metric={metric} />
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-3">
        <span>{t("region.breakdown.weightOf", { weight: metric.weight })}</span>
        <span>
          {known
            ? t("evidence.contributionValue", {
                points: (metricContribution(metric) ?? 0).toFixed(1),
                weight: metric.weight,
              })
            : t("evidence.unknownNoContribution")}
        </span>
      </div>
    </button>
  );
}

/** Full evidence drawer per metric (spec §43). */
export function EvidenceSheet({
  metric,
  regionName,
  curatedMethodology,
  curatedSourceDate,
  curatedLastReviewed,
  open,
  onClose,
}: {
  metric: ScoredMetric | null;
  regionName: string;
  curatedMethodology?: { en: string; es: string };
  curatedSourceDate?: string;
  curatedLastReviewed?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t, lang, formatNumber, formatDate } = useI18n();
  if (!metric) return null;
  const id = metric.id as MetricId;
  const known = metric.score != null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${t("evidence.title")} — ${t(`metrics.${id}.name`)}`}
    >
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold text-ink">
            {t(`metrics.${id}.fullName`)}
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
            {t(`metrics.${id}.description`)}
          </p>
        </div>

        <div className="rounded-md border border-line bg-surface-2 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-ink-3">
              {t("region.breakdown.scoreOf", {
                score: known ? Math.round(metric.score!) : "—",
              })}
            </span>
            <StatusBadge
              status={metric.status}
              label={t(`badges.${metric.status}`)}
            />
          </div>
          <div className="mt-2">
            <MetricBar metric={metric} />
          </div>
          <p className="mt-2 text-[11px] text-ink-2">
            {t("evidence.contribution")}:{" "}
            <strong className="text-ink tnum">
              {known
                ? t("evidence.contributionValue", {
                    points: (metricContribution(metric) ?? 0).toFixed(1),
                    weight: metric.weight,
                  })
                : t("evidence.unknownNoContribution")}
            </strong>
          </p>
        </div>

        {metric.status === "curated" && (
          <p className="rounded-md border border-[color-mix(in_srgb,var(--viz-4)_35%,transparent)] bg-[color-mix(in_srgb,var(--viz-4)_8%,transparent)] px-3 py-2 text-[11px] leading-relaxed text-ink-2">
            ⓘ {t("evidence.curatedNote")}
          </p>
        )}
        {metric.status === "missing" && (
          <p className="rounded-md border border-line bg-surface-3/50 px-3 py-2 text-[11px] leading-relaxed text-ink-2">
            ⓘ {t("evidence.missingNote")}
          </p>
        )}

        {curatedMethodology && (
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              {t("evidence.transformation")}
            </h4>
            <p className="text-[11px] leading-relaxed text-ink-2">
              {curatedMethodology[lang]}
            </p>
            {(curatedSourceDate || curatedLastReviewed) && (
              <p className="mt-1 text-[10px] text-ink-3 tnum">
                {curatedSourceDate && `src ${curatedSourceDate}`}
                {curatedSourceDate && curatedLastReviewed && " · "}
                {curatedLastReviewed &&
                  `${t("region.breakdown.updatedOn", { date: curatedLastReviewed })}`}
              </p>
            )}
          </div>
        )}

        {metric.details && Object.keys(metric.details).length > 0 && (
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              {t("evidence.rawValue")}
            </h4>
            {Object.entries(metric.details).map(([k, v]) => (
              <SheetRow key={k} label={k}>
                {v === null || v === undefined
                  ? "—"
                  : typeof v === "number"
                    ? formatNumber(v, { maximumFractionDigits: 3 })
                    : String(v)}
              </SheetRow>
            ))}
          </div>
        )}

        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            {t("evidence.sources")}
          </h4>
          {metric.evidence.length === 0 ? (
            <p className="text-[11px] text-ink-3">{t("common.none")}</p>
          ) : (
            <ul className="space-y-3">
              {metric.evidence.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border border-line bg-surface-2 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-ink">{ev.label}</span>
                    <StatusBadge status={ev.status} label={t(`badges.${ev.status}`)} />
                  </div>
                  {ev.value != null && (
                    <p className="mt-1 text-sm font-semibold text-ink tnum">
                      {typeof ev.value === "number"
                        ? formatNumber(ev.value, { maximumFractionDigits: 2 })
                        : ev.value}
                      {ev.unit ? ` ${ev.unit}` : ""}
                    </p>
                  )}
                  {ev.methodology && (
                    <p className="mt-1.5 text-[10px] leading-relaxed text-ink-3">
                      {ev.methodology}
                    </p>
                  )}
                  <p className="mt-1.5 text-[10px] text-ink-3">
                    {t("common.source")}: {ev.sourceName}
                    {ev.sourceUrl && (
                      <>
                        {" · "}
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline"
                        >
                          link <ExternalLink className="inline h-2.5 w-2.5" />
                        </a>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-[10px] text-ink-3 tnum">
                    {ev.observedAt && `${t("common.observed")}: ${formatDate(ev.observedAt)} · `}
                    {t("common.confidence")}:{" "}
                    {formatNumber(Math.round(ev.confidence * 100))}%
                    {ev.notes ? ` · ${ev.notes}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t border-line pt-3 text-[10px] text-ink-3">
          {regionName} · {t("app.methodologyVersion")}
        </p>
      </div>
    </Sheet>
  );
}
