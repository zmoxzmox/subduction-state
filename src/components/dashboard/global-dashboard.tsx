"use client";

import * as React from "react";
import Link from "next/link";
import type { RegionScoreEntry } from "@/data/scores";
import type { QuakeEvent } from "@/types";
import { useI18n } from "@/i18n/provider";
import { useResearchConfig } from "@/research/config-context";
import type { EnsoState, ScoreSummary } from "@/types";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { ScoreChip } from "./score";
import { cn } from "@/lib/utils";

function useEntries(regions: RegionScoreEntry[]) {
  const { aggregate } = useResearchConfig();
  return React.useMemo(
    () =>
      regions.map((r) => ({
        region: r,
        summary: aggregate(r.metrics),
      })),
    [regions, aggregate],
  );
}

export function HighestMatchesPanel({
  regions,
  minCoveragePct,
}: {
  regions: RegionScoreEntry[];
  minCoveragePct: number;
}) {
  const { t, formatNumber, lang } = useI18n();
  const entries = useEntries(regions);
  const rows = entries
    .filter(({ summary }) => summary.coverage * 100 >= minCoveragePct && summary.observed != null)
    .sort((a, b) => (b.summary.observed ?? 0) - (a.summary.observed ?? 0))
    .slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("home.highestMatches")}</CardTitle>
          <CardDescription className="mt-0.5">{t("home.highestMatchesNote")}</CardDescription>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-xs text-ink-3">{t("home.noRegions")}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
                <th className="px-4 py-1.5 font-medium">{t("home.columns.region")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("home.columns.score")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("home.columns.range")}</th>
                <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">
                  {t("home.columns.dominant")}
                </th>
                <th className="px-4 py-1.5 text-right font-medium">{t("home.columns.m5")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ region, summary }) => (
                <tr
                  key={region.slug}
                  className="border-b border-line last:border-0 hover:bg-surface-3/50"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/region/${region.slug}`}
                      className="font-medium text-ink hover:text-accent"
                      aria-label={t("home.viewRegion", { region: region.name[lang] })}
                    >
                      {region.name[lang]}
                      {region.featured && (
                        <span className="ml-1.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-accent">
                          ★
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <ScoreChip summary={summary} showBand={false} />
                  </td>
                  <td className="px-2 py-2 text-right text-ink-3 tnum">
                    {formatNumber(summary.minFull, { maximumFractionDigits: 0 })}–
                    {formatNumber(summary.maxFull, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="hidden px-2 py-2 text-right text-ink-3 sm:table-cell">
                    {region.dominantMetricId ? t(`metrics.${region.dominantMetricId}.name`) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-ink-3 tnum">
                    {region.m5Count30d ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

export function LargestQuakesPanel({
  events7d,
  events30d,
}: {
  events7d: QuakeEvent[];
  events30d: QuakeEvent[];
}) {
  const { t, formatTime } = useI18n();
  const [tab, setTab] = React.useState<"7d" | "30d">("7d");
  const events = tab === "7d" ? events7d : events30d;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {tab === "7d" ? t("home.largest7d") : t("home.largest30d")}
        </CardTitle>
        <Segmented
          size="sm"
          ariaLabel={t("map.timeWindow")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "7d", label: t("map.window.7d") },
            { value: "30d", label: t("map.window.30d") },
          ]}
        />
      </CardHeader>
      <CardBody className="p-0">
        {events.length === 0 ? (
          <p className="px-4 py-5 text-xs text-ink-3">{t("common.loading")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {events.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-12 shrink-0 text-sm font-semibold text-ink tnum">
                  M{e.mag.toFixed(1)}
                </span>
                <div className="min-w-0 flex-1">
                  {e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-ink-2 hover:text-accent"
                    >
                      {e.place}
                    </a>
                  ) : (
                    <span className="block truncate text-xs text-ink-2">{e.place}</span>
                  )}
                  <span className="text-[10px] text-ink-3">
                    {formatTime(e.time)} · {Math.round(e.depthKm)} km
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function metricScore(region: RegionScoreEntry, id: string): number | null {
  return region.metrics.find((m) => m.id === id)?.score ?? null;
}

export function LeadersPanel({
  regions,
  kind,
}: {
  regions: RegionScoreEntry[];
  kind: "quiescence" | "activation";
}) {
  const { t, lang } = useI18n();
  const id = kind === "quiescence" ? "recentQuiescence" : "interfaceActivation";
  const rows = regions
    .filter((r) => metricScore(r, id) != null)
    .sort((a, b) => (metricScore(b, id) ?? 0) - (metricScore(a, id) ?? 0))
    .slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {kind === "quiescence" ? t("home.quiescenceLeaders") : t("home.activationLeaders")}
        </CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const score = metricScore(r, id) ?? 0;
            return (
              <li key={r.slug} className="flex items-center justify-between px-4 py-2 text-xs">
                <Link href={`/region/${r.slug}`} className="text-ink-2 hover:text-accent">
                  {r.name[lang]}
                </Link>
                <span className="font-semibold text-ink tnum">{Math.round(score)}</span>
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="px-4 py-5 text-xs text-ink-3">{t("common.loading")}</li>
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

export function LowestCoveragePanel({ regions }: { regions: RegionScoreEntry[] }) {
  const { t, lang } = useI18n();
  const rows = [...regions]
    .sort((a, b) => a.summary.coverage - b.summary.coverage)
    .slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("home.lowestCoverage")}</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.slug} className="flex items-center justify-between px-4 py-2 text-xs">
              <Link href={`/region/${r.slug}`} className="text-ink-2 hover:text-accent">
                {r.name[lang]}
              </Link>
              <span
                className={cn(
                  "font-semibold tnum",
                  r.summary.coverage < 0.5 ? "text-[var(--viz-2)]" : "text-ink",
                )}
              >
                {Math.round(r.summary.coverage * 100)}% ·{" "}
                {t(`score.coverageBand.${r.summary.coverageBand}`)}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function EnvAnomaliesPanel({ regions }: { regions: RegionScoreEntry[] }) {
  const { t, formatNumber, lang } = useI18n();
  const rows = regions
    .map((r) => {
      const env = r.metrics.find((m) => m.id === "environmentalPerturbation");
      const sst = env?.details?.sstAnomalyC;
      return { region: r, score: env?.score ?? null, sst: typeof sst === "number" ? sst : null };
    })
    .filter((x) => x.score != null && x.score > 40)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 6);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("home.envAnomalies")}</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-line">
          {rows.map(({ region, score, sst }) => (
            <li
              key={region.slug}
              className="flex items-center justify-between px-4 py-2 text-xs"
            >
              <Link href={`/region/${region.slug}`} className="text-ink-2 hover:text-accent">
                {region.name[lang]}
              </Link>
              <span className="flex items-center gap-3">
                {sst != null && (
                  <span className="text-ink-3 tnum">
                    SST {sst > 0 ? "+" : ""}
                    {formatNumber(sst, { maximumFractionDigits: 1 })}°C
                  </span>
                )}
                <span className="font-semibold text-ink tnum">{Math.round(score ?? 0)}</span>
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-5 text-xs text-ink-3">{t("common.loading")}</li>
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

export function EnsoContextCard({ enso }: { enso: EnsoState | null }) {
  const { t, formatNumber } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("home.ensoContext")}</CardTitle>
      </CardHeader>
      <CardBody>
        {enso?.oni != null ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-ink tnum">
                {enso.oni > 0 ? "+" : ""}
                {formatNumber(enso.oni, { maximumFractionDigits: 2 })}°C
              </span>
              <span className="text-xs text-ink-2">
                {t(`home.ensoPhase.${enso.phase}`)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-3 tnum">
              ONI · {t("home.ensoSeason")}: {enso.season ?? "—"}
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-3">{t("common.unavailable")}</p>
        )}
        <p className="mt-2 text-[10px] leading-snug text-ink-3">
          {t("region.charts.ensoNote")}
        </p>
      </CardBody>
    </Card>
  );
}

export function PendingNotice({ count }: { count: number }) {
  const { t } = useI18n();
  if (count === 0) return null;
  return (
    <div
      role="status"
      className="rounded-md border border-line bg-surface-3/60 px-3 py-2 text-[11px] text-ink-2"
    >
      {t("home.pendingRegions", { count })}
    </div>
  );
}

export type { ScoreSummary };
