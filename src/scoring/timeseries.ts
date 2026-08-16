import type { QuakeEvent, RegionProfile } from "@/types";
import { alongStrikeKm } from "./migration";
import { distanceKm } from "@/lib/utils";
import { pointInCircle } from "@/lib/geo";

/**
 * Chart-series computations for the region dashboard. Pure functions
 * over the cached regional catalog — no extra upstream calls.
 */

export interface RatePoint {
  t: number;
  rate: number;
}

/** Rolling rate (events/day) at fixed step over the given range. */
export function rollingRate(
  events: QuakeEvent[],
  windowDays: number,
  rangeDays: number,
  stepDays: number,
  minMag = 4,
  now = Date.now(),
): RatePoint[] {
  const out: RatePoint[] = [];
  const stepMs = stepDays * 86_400_000;
  const windowMs = windowDays * 86_400_000;
  for (let end = now; end > now - rangeDays * 86_400_000; end -= stepMs) {
    const count = events.filter(
      (e) => e.mag >= minMag && !e.aftershockCandidate && e.time <= end && e.time > end - windowMs,
    ).length;
    out.push({ t: end, rate: +(count / windowDays).toFixed(4) });
  }
  return out.reverse();
}

export interface DepthBin {
  label: string;
  from: number;
  to: number;
  count: number;
}

export function depthHistogram(
  events: QuakeEvent[],
  binSize = 25,
  maxDepth = 700,
): DepthBin[] {
  const bins: DepthBin[] = [];
  for (let from = 0; from < maxDepth; from += binSize) {
    bins.push({
      label: `${from}`,
      from,
      to: from + binSize,
      count: 0,
    });
  }
  for (const e of events) {
    const d = Math.max(0, e.depthKm);
    const idx = Math.min(bins.length - 1, Math.floor(d / binSize));
    bins[idx].count += 1;
  }
  return bins;
}

export interface AlongMarginPoint {
  t: number;
  s: number; // along-strike km
  mag: number;
  aftershock: boolean;
}

export function alongMarginSeries(
  events: QuakeEvent[],
  profile: RegionProfile,
  minMag = 4.5,
  days = 365,
  now = Date.now(),
): AlongMarginPoint[] {
  return events
    .filter(
      (e) =>
        e.mag >= minMag &&
        e.time > now - days * 86_400_000 &&
        pointInCircle(e.lon, e.lat, profile.center[0], profile.center[1], profile.radiusKm),
    )
    .map((e) => ({
      t: e.time,
      s: +alongStrikeKm(
        e.lon,
        e.lat,
        profile.center[0],
        profile.center[1],
        profile.strikeAzimuthDeg,
      ).toFixed(0),
      mag: e.mag,
      aftershock: e.aftershockCandidate,
    }))
    .sort((a, b) => a.t - b.t);
}

/** Seismic moment (Nm, Hanks & Kanamori) over recent windows */
export function momentRelease(
  events: QuakeEvent[],
  windowsDays: number[],
  now = Date.now(),
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const days of windowsDays) {
    out[days] = events
      .filter((e) => e.time > now - days * 86_400_000)
      .reduce((s, e) => s + 10 ** (1.5 * (e.mag + 10.7) - 24.46), 0);
  }
  return out;
}

export interface DepthStats {
  medianDepthKm: number | null;
  shallowFraction: number | null;
  medianDepthPrior90d: number | null;
  depthTrend: "deepening" | "shallowing" | "stable" | null;
}

export function depthStats(
  events: QuakeEvent[],
  now = Date.now(),
  minMag = 4,
): DepthStats {
  const recent = events.filter(
    (e) => e.mag >= minMag && e.time > now - 30 * 86_400_000,
  );
  const prior = events.filter(
    (e) =>
      e.mag >= minMag &&
      e.time <= now - 30 * 86_400_000 &&
      e.time > now - 120 * 86_400_000,
  );
  const med = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const recentMed = med(recent.map((e) => e.depthKm));
  const priorMed = med(prior.map((e) => e.depthKm));
  let trend: DepthStats["depthTrend"] = null;
  if (recentMed != null && priorMed != null) {
    const diff = recentMed - priorMed;
    trend = diff > 10 ? "deepening" : diff < -10 ? "shallowing" : "stable";
  }
  return {
    medianDepthKm: recentMed,
    shallowFraction:
      recent.length > 0
        ? +(recent.filter((e) => e.depthKm < 50).length / recent.length).toFixed(2)
        : null,
    medianDepthPrior90d: priorMed,
    depthTrend: trend,
  };
}

/** Nearest region (slug + distance) for an event — map popover */
export function nearestRegion(
  lon: number,
  lat: number,
  profiles: RegionProfile[],
): { slug: string; distanceKm: number } | null {
  let best: { slug: string; distanceKm: number } | null = null;
  for (const p of profiles) {
    const d = distanceKm(lon, lat, p.center[0], p.center[1]);
    if (!best || d < best.distanceKm) best = { slug: p.slug, distanceKm: d };
  }
  return best;
}
