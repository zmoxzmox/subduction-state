import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { cachedFetch } from "@/data/http";
import type { RegionProfile } from "@/types";

/**
 * NOAA SST anomaly adapter — Coral Reef Watch daily 5 km SST anomaly
 * (NOAA CoastWatch ERDDAP, `noaacrwsstanomalyDaily`).
 *
 * Samples the region's offshore point:
 *  - mean anomaly over the latest ~5 days
 *  - ~10 years of same-season (±15 d) anomalies for a local percentile
 *
 * Percentile is preferred over absolute thresholds; when the history
 * fetch fails the caller falls back to absolute-anomaly anchors with
 * lower confidence.
 */

const enc = (u: string) => u.replace(/\[/g, "%5B").replace(/\]/g, "%5D");

const seriesSchema = z.array(
  z.object({ t: z.string(), v: z.number() }),
);

function parseCsvSeries(raw: unknown) {
  if (typeof raw !== "string") throw new Error("expected csv text");
  const lines = raw.trim().split("\n");
  if (lines.length < 3) throw new Error("empty series");
  const out: Array<{ t: string; v: number }> = [];
  for (const line of lines.slice(2)) {
    const [t, , , v] = line.split(",");
    const val = parseFloat(v);
    if (!Number.isNaN(val)) out.push({ t, v: val });
  }
  return seriesSchema.parse(out);
}

export interface SstSample {
  anomalyC: number | null;
  percentile: number | null;
  observedAt: string | null;
  historyPoints: number;
}

export async function getSstSample(
  profile: RegionProfile,
): Promise<SstSample | null> {
  const [lon, lat] = profile.envSamplePoint;
  const base = "https://coastwatch.noaa.gov/erddap/griddap/noaacrwsstanomalyDaily.csv?sea_surface_temperature_anomaly";

  // 1) latest ~5-day mean
  const recentStart = new Date(Date.now() - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  let recent: Array<{ t: string; v: number }> = [];
  try {
    const res = await cachedFetch(
      enc(`${base}[(${recentStart}):(${today()})][(${lat.toFixed(1)})][(${lon.toFixed(1)})]`),
      parseCsvSeries,
      {
        key: `sst-recent-${profile.slug}`,
        ttlMs: 24 * 3_600_000,
        source: "NOAA SST anomaly (CRW/ERDDAP)",
        timeoutMs: 15_000,
      },
    );
    recent = res.data;
  } catch {
    recent = [];
  }

  // 2) ~10y same-season history for the local percentile
  const start = new Date(Date.now() - 10 * 365.25 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  let history: Array<{ t: string; v: number }> = [];
  try {
    const res = await cachedFetch(
      enc(`${base}[(${start}):(${today()})][(${lat.toFixed(1)})][(${lon.toFixed(1)})]`),
      parseCsvSeries,
      {
        key: `sst-history-${profile.slug}`,
        ttlMs: 7 * 24 * 3_600_000,
        source: "NOAA SST anomaly (CRW/ERDDAP)",
        timeoutMs: 30_000,
      },
    );
    history = res.data;
  } catch {
    history = [];
  }

  if (recent.length === 0) return null;
  const anomaly =
    recent.reduce((s, r) => s + r.v, 0) / recent.length;
  const observedAt = recent[recent.length - 1].t;

  const doy = dayOfYear(new Date(observedAt));
  const seasonal = history.filter((h) => {
    const d = dayOfYear(new Date(h.t));
    const diff = Math.abs(d - doy);
    return Math.min(diff, 365 - diff) <= 15;
  });
  const percentile =
    seasonal.length >= 200
      ? seasonal.filter((h) => h.v <= anomaly).length / seasonal.length
      : null;

  return {
    anomalyC: +anomaly.toFixed(2),
    percentile: percentile == null ? null : +percentile.toFixed(3),
    observedAt,
    historyPoints: seasonal.length,
  };
}

/** Fixture fallback values (captured snapshot, labeled by the caller). */
export function getSstFixture(
  slug: string,
): { anomalyC: number; percentile: null } | null {
  try {
    const all = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "fixtures/noaa/env_points.json"),
        "utf8",
      ),
    ) as Record<string, { sstAnomalyC?: number }>;
    const v = all[slug]?.sstAnomalyC;
    return v == null ? null : { anomalyC: v, percentile: null };
  } catch {
    return null;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayOfYear(d: Date): number {
  return Math.floor(
    (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000,
  );
}
