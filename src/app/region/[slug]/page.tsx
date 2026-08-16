"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Check, History } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useRegionDetail } from "@/lib/queries";
import { useResearchConfig } from "@/research/config-context";
import type { ScoredMetric } from "@/types";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/controls";
import { Segmented } from "@/components/ui/segmented";
import { ScoreHero, ModeLabel } from "@/components/dashboard/score";
import { BreakdownRow, EvidenceSheet } from "@/components/dashboard/breakdown";
import {
  AlongMarginChart,
  DepthHistogram,
  GnssChart,
  MagnitudeChart,
  RateChart,
  TimelineChart,
} from "@/components/charts/region-charts";
import { useGnssStation } from "@/lib/queries";
import { Sheet } from "@/components/ui/sheet";
import { METHODOLOGY_VERSION } from "@/scoring/weights";
import { missingMetricIds } from "@/scoring/score";

type RangeKey = "30d" | "90d" | "1y" | "5y";
const RANGE_DAYS: Record<RangeKey, number> = { "30d": 30, "90d": 90, "1y": 365, "5y": 1825 };

export default function RegionPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { t, lang, formatDate } = useI18n();
  const { data, isPending, error } = useRegionDetail(slug);
  const { aggregate, isCustom } = useResearchConfig();
  const [evidenceMetric, setEvidenceMetric] = React.useState<ScoredMetric | null>(null);
  const [range, setRange] = React.useState<RangeKey>("1y");
  const [copied, setCopied] = React.useState(false);
  const [replayDate, setReplayDate] = React.useState<string>("");
  const replay = useRegionDetail(slug, replayDate || undefined);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-10 text-sm text-ink-2">
        <p>{t("common.error")}</p>
        <Link href="/" className="mt-2 inline-block text-accent hover:underline">
          ← {t("nav.map")}
        </Link>
      </div>
    );
  }

  const d = replayDate && replay.data ? replay.data : data;
  const summary = aggregate(d.metrics);
  const missing = missingMetricIds(d.metrics);
  const rangeMs = RANGE_DAYS[range] * 86_400_000;
  // anchor chart windows to the data generation time (pure during render)
  const now = Date.parse(d.generatedAt) || 0;

  const copySnapshot = async () => {
    const snapshot = {
      region: d.slug,
      timestamp: new Date().toISOString(),
      methodologyVersion: METHODOLOGY_VERSION,
      customWeightsActive: isCustom,
      score: {
        observed: summary.observed,
        coverage: summary.coverage,
        fullRange: [summary.minFull, summary.maxFull],
        neutralImputed: summary.neutralImputed,
      },
      metrics: Object.fromEntries(
        d.metrics.map((m) => [
          m.id,
          { score: m.score, weight: m.weight, status: m.status, details: m.details },
        ]),
      ),
      missingVariables: missing,
      m5Count30d: d.m5Count30d,
      events: d.charts.timeline.slice(-200),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable
    }
  };

  const timelineRange = d.charts.timeline.filter((e) => e.t > now - rangeMs);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5">
      {/* header */}
      <div>
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" /> {t("nav.map")}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {d.name[lang]}
          </h1>
          {d.featured && (
            <Badge tone="accent">★ {t("app.featuredBadge")}</Badge>
          )}
          {d.replayMode && (
            <Badge tone="serious">
              <History className="h-3 w-3" /> {t("region.scoreCard.replayTitle")}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-2">
          {d.platePair[lang]} · {t("region.subductionMargin")}
          {d.convergence && (
            <>
              {" · "}
              {t("region.convergence")} ≈ {d.convergence.rateMmYr} mm/yr
            </>
          )}
        </p>
        {d.context && (
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-ink-3">
            {d.context[lang]}
          </p>
        )}
        {d.featured && (
          <p className="mt-1.5 max-w-3xl rounded-md border border-line bg-surface-3/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-2">
            ⓘ {t("region.curatedProfile")}
          </p>
        )}
      </div>

      {/* score cards */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                  {t("score.regimeMatchLong")}
                </h2>
                <ScoreHero summary={summary} className="mt-3" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <ModeLabel mode={data.modes.catalog} />
                <Button size="sm" variant="outline" onClick={copySnapshot}>
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> {t("common.copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />{" "}
                      {t("region.scoreCard.exportSnapshot")}
                    </>
                  )}
                </Button>
                <span className="text-[10px] text-ink-3">
                  {t("common.updated")} {formatDate(d.generatedAt)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("region.scoreCard.summaryTitle")}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5">
              {d.summaryClauses.map((clause, i) => (
                <p key={i} className="text-xs leading-relaxed text-ink-2">
                  • {t(clause.key, clause.params)}
                </p>
              ))}
              {d.replayMode && (
                <p className="text-[10px] leading-relaxed text-ink-3">
                  {t("region.scoreCard.replayNote")}
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* breakdown */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("region.breakdown.title")}</CardTitle>
            <CardDescription className="mt-0.5">
              {t("region.breakdown.subtitle")}
            </CardDescription>
          </div>
          {missing.length > 0 && (
            <span className="text-[10px] text-ink-3">
              {t("metrics.gnssTransient.name") !== "" &&
                `${missing.length} × ${t("badges.missing")}`}
            </span>
          )}
        </CardHeader>
        <CardBody className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
          {d.metrics.map((m) => (
            <BreakdownRow
              key={m.id}
              metric={m}
              onOpen={() => setEvidenceMetric(m)}
            />
          ))}
        </CardBody>
      </Card>

      {/* charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("region.charts.timeline")}</CardTitle>
            <Segmented
              size="sm"
              ariaLabel={t("region.charts.timeline")}
              value={range}
              onChange={setRange}
              options={
                [
                  { value: "30d", label: "30d" },
                  { value: "90d", label: "90d" },
                  { value: "1y", label: "1y" },
                  { value: "5y", label: "5y" },
                ] as const
              }
            />
          </CardHeader>
          <CardBody>
            <p className="mb-1 text-[11px] text-ink-3">
              {t("region.charts.timelineDesc")}
            </p>
            <TimelineChart timeline={timelineRange} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("region.charts.rate")}</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-1 text-[11px] text-ink-3">{t("region.charts.rateDesc")}</p>
            <RateChart
              rate7={d.charts.rate7}
              rate30={d.charts.rate30}
              baseline={d.charts.baselineRate30}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("region.charts.depth")}</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-1 text-[11px] text-ink-3">{t("region.charts.depthDesc")}</p>
            <DepthHistogram bins={d.charts.depthHistogram} />
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-ink-2">
              <span className="tnum">
                {t("region.charts.medianDepth")}:{" "}
                <strong className="text-ink">
                  {d.charts.depthStats.medianDepthKm != null
                    ? `${Math.round(d.charts.depthStats.medianDepthKm)} km`
                    : "—"}
                </strong>
              </span>
              <span className="tnum">
                {t("region.charts.shallowFraction")}:{" "}
                <strong className="text-ink">
                  {d.charts.depthStats.shallowFraction != null
                    ? `${Math.round(d.charts.depthStats.shallowFraction * 100)}%`
                    : "—"}
                </strong>
              </span>
              <span className="tnum">
                {t("region.charts.depthTrend")}:{" "}
                <strong className="text-ink">
                  {d.charts.depthStats.depthTrend
                    ? t(
                        d.charts.depthStats.depthTrend === "deepening"
                          ? "region.charts.trendDeepening"
                          : d.charts.depthStats.depthTrend === "shallowing"
                            ? "region.charts.trendShallowing"
                            : "region.charts.trendStable",
                      )
                    : "—"}
                </strong>
              </span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("region.charts.magnitude")}</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-1 text-[11px] text-ink-3">
              {t("region.charts.magnitudeDesc")}
            </p>
            <MagnitudeChart timeline={d.charts.timeline} />
            {d.charts.bValueCurrent.displayable ? (
              <>
                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-ink-2">
                  <span className="tnum">
                    {t("region.charts.bValue")}:{" "}
                    <strong className="text-ink">{d.charts.bValueCurrent.b?.toFixed(2)}</strong> ±{" "}
                    {d.charts.bValueCurrent.sigma?.toFixed(2)}
                  </span>
                  <span className="tnum">
                    {t("region.charts.bBaseline")}:{" "}
                    <strong className="text-ink">
                      {d.charts.bValueBaseline.b?.toFixed(2) ?? "—"}
                    </strong>
                  </span>
                  <span className="tnum">
                    {t("region.charts.completeness")}: M
                    {d.charts.bValueCurrent.completenessMagnitude?.toFixed(1)}
                  </span>
                  <span className="tnum">
                    {d.charts.bValueCurrent.eventCount} {t("region.charts.events")}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-ink-3">
                {t("region.charts.notEnoughForB")}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("region.charts.alongMargin")}</CardTitle>
            <StatusBadge status="experimental" label={t("badges.experimental")} />
          </CardHeader>
          <CardBody>
            <p className="mb-1 text-[11px] text-ink-3">
              {t("region.charts.alongMarginDesc")}
            </p>
            <AlongMarginChart points={d.charts.alongMargin} />
          </CardBody>
        </Card>

        {/* moment + environment */}
        <Card>
          <CardHeader>
            <CardTitle>{t("region.charts.moment")}</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-3 gap-3">
            {([7, 30, 365] as const).map((w) => (
              <div key={w} className="rounded-md border border-line bg-surface-2 p-3">
                <div className="text-[10px] uppercase tracking-wider text-ink-3">
                  {w === 365 ? "1y" : `${w}d`}
                </div>
                <div className="mt-1 text-sm font-semibold text-ink">
                  {formatExponent(d.charts.moment[w])}
                </div>
                <div className="text-[10px] text-ink-3">N·m</div>
              </div>
            ))}
          </CardBody>
          <CardBody className="border-t border-line">
            <h3 className="mb-2 text-xs font-semibold text-ink">
              {t("region.charts.environment")}
            </h3>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <div>
                <div className="text-ink-3">{t("region.charts.sst")}</div>
                <div className="text-sm font-semibold text-ink tnum">
                  {d.env?.sstAnomalyC != null
                    ? `${d.env.sstAnomalyC > 0 ? "+" : ""}${d.env.sstAnomalyC}°C`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-ink-3">{t("region.charts.ssh")}</div>
                <div className="text-sm font-semibold text-ink tnum">
                  {d.env?.sshAnomalyCm != null ? `${d.env.sshAnomalyCm} cm` : "—"}
                </div>
              </div>
              <div>
                <div className="text-ink-3">{t("region.charts.enso")}</div>
                <div className="text-sm font-semibold text-ink tnum">
                  {d.enso?.oni != null ? `${d.enso.oni > 0 ? "+" : ""}${d.enso.oni}°C` : "—"}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-ink-3">{t("region.charts.ensoNote")}</p>
          </CardBody>
        </Card>
      </div>

      {/* GNSS */}
      <GnssSection slug={slug} />

      {/* volcanoes */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("region.volcanoes.title")}</CardTitle>
            <CardDescription className="mt-0.5">
              {t("region.volcanoes.disclaimer")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {d.volcanoes == null || d.volcanoes.length === 0 ? (
            <p className="px-4 py-5 text-xs text-ink-3">{t("common.unavailable")}</p>
          ) : (
            <div className="thin-scroll max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
                    <th className="px-4 py-1.5 font-medium">{t("region.volcanoes.name")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("region.volcanoes.country")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("region.volcanoes.type")}</th>
                    <th className="px-2 py-1.5 font-right text-right font-medium">
                      {t("region.volcanoes.lastEruption")}
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      {t("region.volcanoes.distance")}
                    </th>
                    <th className="px-4 py-1.5 text-right font-medium">
                      {t("region.volcanoes.state")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.volcanoes.slice(0, 40).map((v) => (
                    <tr key={v.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-1.5 font-medium text-ink">{v.name}</td>
                      <td className="px-2 py-1.5 text-ink-2">{v.country}</td>
                      <td className="px-2 py-1.5 text-ink-3">{v.type}</td>
                      <td className="px-2 py-1.5 text-right text-ink-2 tnum">
                        {v.lastEruptionYear != null
                          ? v.lastEruptionYear > 0
                            ? v.lastEruptionYear
                            : `${Math.abs(v.lastEruptionYear)} BCE`
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-ink-3 tnum">
                        {v.distanceKm} km
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <span
                          className={
                            v.activityState === "recent-eruption"
                              ? "text-[var(--viz-2)]"
                              : "text-ink-3"
                          }
                        >
                          ●
                        </span>{" "}
                        {t(
                            v.activityState === "recent-eruption"
                              ? "region.volcanoes.stateRecent"
                              : v.activityState === "historical"
                                ? "region.volcanoes.stateHistorical"
                                : "region.volcanoes.stateLocation",
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* change feed + replay */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("region.timeline.title")}</CardTitle>
          </CardHeader>
          <CardBody>
            {d.changeFeed.length === 0 ? (
              <p className="text-xs text-ink-3">{t("region.timeline.noChanges")}</p>
            ) : (
              <ul className="space-y-2">
                {d.changeFeed.map((item) => (
                  <li key={item.id} className="flex items-baseline gap-3 text-xs">
                    <span className="w-20 shrink-0 text-ink-3 tnum">
                      {formatDate(item.date)}
                    </span>
                    {item.deltaScore != null && (
                      <span
                        className={
                          item.deltaScore > 0
                            ? "font-semibold text-ink tnum"
                            : "font-semibold text-ink-3 tnum"
                        }
                      >
                        {item.deltaScore > 0 ? "+" : ""}
                        {item.deltaScore.toFixed(1)}
                      </span>
                    )}
                    <span className="text-ink-2">
                      {t(item.descriptionKey, {
                        ...item.descriptionParams,
                        delta: item.deltaScore ?? 0,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[10px] text-ink-3">
              {t("region.timeline.seismicHistoryNote")}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("region.scoreCard.replayTitle")}</CardTitle>
              <CardDescription className="mt-0.5">
                {t("region.scoreCard.replayNote")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-ink-3">
                  {t("region.scoreCard.replayDate")}
                </span>
                <input
                  type="date"
                  value={replayDate}
                  min="1960-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setReplayDate(e.target.value)}
                  className="h-8 rounded-md border border-line-2 bg-surface px-2 text-xs text-ink"
                />
              </label>
              {replayDate && (
                <Button size="sm" variant="ghost" onClick={() => setReplayDate("")}>
                  {t("common.reset")}
                </Button>
              )}
            </div>
            {replay.isFetching && (
              <p className="text-[11px] text-ink-3">{t("common.loading")}</p>
            )}
            {replay.data && replayDate && (
              <div className="rounded-md border border-line bg-surface-2 p-3">
                <ScoreHero summary={aggregate(replay.data.metrics)} size="sm" />
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <EvidenceSheet
        metric={evidenceMetric}
        regionName={d.name[lang]}
        open={!!evidenceMetric}
        onClose={() => setEvidenceMetric(null)}
        curatedMethodology={
          evidenceMetric?.status === "curated"
            ? { en: evidenceMetric.evidence[0]?.methodology ?? "", es: "" }
            : undefined
        }
      />
    </div>
  );
}

function formatExponent(v: number | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "—";
  const exp = Math.log10(v);
  return `10^${exp.toFixed(1)}`;
}

/* ------------------------------------------------------------------ */
/* GNSS section                                                        */
/* ------------------------------------------------------------------ */

function GnssSection({ slug }: { slug: string }) {
  const { t, formatNumber } = useI18n();
  const { data } = useRegionDetail(slug);
  const [station, setStation] = React.useState<string | null>(null);
  const stationData = useGnssStation(station);

  if (!data) return null;
  const stations = data.gnssStations ?? [];
  const gnssMetric = data.metrics.find((m) => m.id === "gnssTransient");
  const unknown = !stations.some((s) => s.robustZ != null);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("region.gnss.title")}</CardTitle>
          <CardDescription className="mt-0.5">
            {t("region.charts.gnssDesc")}
          </CardDescription>
        </div>
        {gnssMetric && (
          <StatusBadge
            status={gnssMetric.score != null ? "derived" : "missing"}
            label={gnssMetric.score != null ? t("badges.derived") : t("badges.missing")}
          />
        )}
      </CardHeader>
      <CardBody>
        {unknown ? (
          <p className="rounded-md border border-line bg-surface-3/40 px-3 py-3 text-xs leading-relaxed text-ink-2">
            {t("region.charts.gnssUnavailable")}
            {stations.length > 0 && (
              <span className="block pt-1 text-[11px] text-ink-3">
                {t("region.gnss.requiresThree", { count: stations.filter((s) => s.robustZ != null).length })}
              </span>
            )}
            {stations.length === 0 && (
              <span className="block pt-1 text-[11px] text-ink-3">
                {t("region.gnss.unknownReason")}
              </span>
            )}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stations.map((s) => (
              <button
                key={s.id}
                onClick={() => setStation(s.id)}
                className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2 text-xs hover:border-accent/50"
              >
                <span className="font-semibold text-ink">{s.id}</span>
                <span className="tnum text-ink-2">
                  z ={" "}
                  {s.robustZ != null
                    ? formatNumber(s.robustZ, { maximumFractionDigits: 2 })
                    : t("common.unknown")}
                </span>
              </button>
            ))}
          </div>
        )}
      </CardBody>

      <Sheet
        open={!!station}
        onClose={() => setStation(null)}
        title={`GNSS ${station ?? ""}`}
      >
        {stationData.data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border border-line bg-surface-2 p-2">
                <div className="text-ink-3">zE</div>
                <div className="font-semibold text-ink tnum">
                  {stationData.data.anomaly?.zEast?.toFixed(2) ?? "—"}
                </div>
              </div>
              <div className="rounded-md border border-line bg-surface-2 p-2">
                <div className="text-ink-3">zN</div>
                <div className="font-semibold text-ink tnum">
                  {stationData.data.anomaly?.zNorth?.toFixed(2) ?? "—"}
                </div>
              </div>
              <div className="rounded-md border border-line bg-surface-2 p-2">
                <div className="text-ink-3">z horizontal</div>
                <div className="font-semibold text-ink tnum">
                  {stationData.data.anomaly?.zHorizontal?.toFixed(2) ?? "—"}
                </div>
              </div>
            </div>
            <GnssChart data={stationData.data.series} />
            <p className="text-[10px] text-ink-3">Source: UNR NGL · IGS20</p>
          </div>
        ) : (
          <p className="text-xs text-ink-3">{t("common.loading")}</p>
        )}
      </Sheet>
    </Card>
  );
}
