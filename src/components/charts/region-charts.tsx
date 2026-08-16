"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RegionDetail } from "@/data/scores";
import { useI18n } from "@/i18n/provider";
import { useViz } from "@/lib/viz";
import type { GnssStationResponse } from "@/lib/queries";

/* ------------------------------------------------------------------ */
/* shared chrome                                                       */
/* ------------------------------------------------------------------ */

function useChartTheme() {
  const viz = useViz();
  return {
    viz,
    grid: viz.grid,
    tick: { fill: viz.axisText, fontSize: 10 },
    tooltipStyle: {
      background: viz.mode === "dark" ? "#171c22" : "#ffffff",
      border: `1px solid ${viz.mode === "dark" ? "#333b44" : "#c9c9c0"}`,
      borderRadius: 8,
      fontSize: 11,
      color: viz.ink,
    } as React.CSSProperties,
  };
}

/* ------------------------------------------------------------------ */
/* seismicity timeline (magnitude vs time)                             */
/* ------------------------------------------------------------------ */

export function TimelineChart({
  timeline,
  height = 200,
}: {
  timeline: RegionDetail["charts"]["timeline"];
  height?: number;
}) {
  const { t, formatTime } = useI18n();
  const { viz, grid, tick, tooltipStyle } = useChartTheme();
  const independent = timeline.filter((e) => !e.aftershock);
  const aftershocks = timeline.filter((e) => e.aftershock);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid stroke={grid} strokeWidth={1} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin - 86400000", "dataMax + 86400000"]}
          tickFormatter={(v) => new Date(v).toISOString().slice(0, 7)}
          {...tick}
        />
        <YAxis
          dataKey="mag"
          name="M"
          domain={[3.8, "dataMax + 0.4"]}
          {...tick}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(_v, _n, item) => {
            const p = item.payload as { t: number; mag: number; depthKm: number; aftershock: boolean };
            return [
              `M${p.mag.toFixed(1)} · ${Math.round(p.depthKm)} km · ${
                p.aftershock ? t("map.popover.aftershockYes") : t("map.popover.aftershockNo")
              }`,
              formatTime(p.t),
            ];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, color: viz.ink2 }}
          iconSize={8}
        />
        <Scatter
          name={t("region.charts.declustered")}
          data={independent}
          fill={viz.series(1)}
          fillOpacity={0.8}
        />
        <Scatter
          name={t("map.popover.aftershockYes")}
          data={aftershocks}
          fill={viz.mode === "dark" ? "#4b545d" : "#b3b8bd"}
          fillOpacity={0.5}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* rolling event rate                                                  */
/* ------------------------------------------------------------------ */

export function RateChart({
  rate7,
  rate30,
  baseline,
}: {
  rate7: RegionDetail["charts"]["rate7"];
  rate30: RegionDetail["charts"]["rate30"];
  baseline: number | null;
}) {
  const { t, formatNumber, formatTime } = useI18n();
  const { viz, grid, tick, tooltipStyle } = useChartTheme();
  const data = rate30.map((p) => ({
    t: p.t,
    r30: p.rate,
    r7: rate7.find((q) => Math.abs(q.t - p.t) < 3 * 86_400_000)?.rate ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={176}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -22 }}>
        <CartesianGrid stroke={grid} strokeWidth={1} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v) => new Date(v).toISOString().slice(0, 7)}
          {...tick}
        />
        <YAxis {...tick} />
        {baseline != null && baseline > 0 && (
          <ReferenceLine
            y={baseline}
            stroke={viz.axisText}
            strokeWidth={1}
            label={{
              value: t("region.charts.baseline"),
              position: "insideTopRight",
              fontSize: 9,
              fill: viz.axisText,
            }}
          />
        )}
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [
            `${formatNumber(v as number, { maximumFractionDigits: 3 })} ${t("common.perDay")}`,
            name === "r7" ? t("region.charts.rate7") : t("region.charts.rate30"),
          ]}
          labelFormatter={(v) => formatTime(v as number)}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: viz.ink2 }} iconSize={8} />
        <Line
          name={t("region.charts.rate30")}
          type="monotone"
          dataKey="r30"
          stroke={viz.series(1)}
          strokeWidth={2}
          dot={false}
        />
        <Line
          name={t("region.charts.rate7")}
          type="monotone"
          dataKey="r7"
          stroke={viz.series(2)}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* depth histogram                                                     */
/* ------------------------------------------------------------------ */

export function DepthHistogram({
  bins,
}: {
  bins: RegionDetail["charts"]["depthHistogram"];
}) {
  const { t, formatNumber } = useI18n();
  const { viz, grid, tick, tooltipStyle } = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={176}>
      <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 4, left: -22 }}>
        <CartesianGrid stroke={grid} strokeWidth={1} />
        <XAxis dataKey="label" {...tick} interval={1} />
        <YAxis {...tick} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, _n, item) => [
            `${formatNumber(v as number)} ${t("region.charts.events")}`,
            `${item.payload.from}–${item.payload.to} km`,
          ]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={24}>
          {bins.map((b) => (
            <Cell key={b.label} fill={viz.depthColor(b.from + 12)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* magnitude distribution + b-value                                    */
/* ------------------------------------------------------------------ */

export function MagnitudeChart({
  timeline,
}: {
  timeline: RegionDetail["charts"]["timeline"];
}) {
  const { t, formatNumber } = useI18n();
  const { viz, grid, tick, tooltipStyle } = useChartTheme();
  const bins = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of timeline) {
      const bin = Math.floor(e.mag * 2) / 2; // 0.5-wide bins
      counts.set(bin, (counts.get(bin) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([m, count]) => ({ m, label: `M${m.toFixed(1)}`, count }));
  }, [timeline]);

  return (
    <ResponsiveContainer width="100%" height={176}>
      <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 4, left: -22 }}>
        <CartesianGrid stroke={grid} strokeWidth={1} />
        <XAxis dataKey="label" {...tick} />
        <YAxis {...tick} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [
            `${formatNumber(v as number)} ${t("region.charts.events")}`,
            t("region.charts.magnitude"),
          ]}
        />
        <Bar dataKey="count" fill={viz.series(1)} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* along-margin timeline                                               */
/* ------------------------------------------------------------------ */

export function AlongMarginChart({
  points,
}: {
  points: RegionDetail["charts"]["alongMargin"];
}) {
  const { t, formatTime } = useI18n();
  const { viz, grid, tick, tooltipStyle } = useChartTheme();
  const independent = points.filter((p) => !p.aftershock);
  const aftershocks = points.filter((p) => p.aftershock);
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={grid} strokeWidth={1} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v) => new Date(v).toISOString().slice(0, 7)}
          {...tick}
        />
        <YAxis
          dataKey="s"
          name={t("region.charts.alongStrikeKm")}
          {...tick}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(_v, _n, item) => {
            const p = item.payload as { t: number; s: number; mag: number; aftershock: boolean };
            return [
              `M${p.mag.toFixed(1)} · ${Math.round(p.s)} km`,
              formatTime(p.t),
            ];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: viz.ink2 }} iconSize={8} />
        <Scatter name={t("region.charts.declustered")} data={independent} fill={viz.series(3)} fillOpacity={0.8} />
        <Scatter
          name={t("map.popover.aftershockYes")}
          data={aftershocks}
          fill={viz.mode === "dark" ? "#4b545d" : "#b3b8bd"}
          fillOpacity={0.5}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* GNSS residual series                                                */
/* ------------------------------------------------------------------ */

export function GnssChart({ data }: { data: GnssStationResponse["series"] }) {
  const { formatDate } = useI18n();
  const { viz, grid, tick, tooltipStyle } = useChartTheme();
  const series = data.map(([t, e, n]) => ({ t, e, n }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: -14 }}>
        <CartesianGrid stroke={grid} strokeWidth={1} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v) => new Date(v).toISOString().slice(0, 7)}
          {...tick}
        />
        <YAxis {...tick} unit=" mm" width={54} />
        <ReferenceLine y={0} stroke={viz.axisText} strokeWidth={1} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [
            `${(v as number).toFixed(1)} mm`,
            name === "e" ? "E" : "N",
          ]}
          labelFormatter={(v) => formatDate(v as number)}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: viz.ink2 }} iconSize={8} />
        <Line name="E" type="monotone" dataKey="e" stroke={viz.series(1)} strokeWidth={2} dot={false} />
        <Line name="N" type="monotone" dataKey="n" stroke={viz.series(3)} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* coverage vs score bar (compare page)                                */
/* ------------------------------------------------------------------ */
