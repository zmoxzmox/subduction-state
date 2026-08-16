import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { QuakeEvent, RegionProfile } from "@/types";
import { cachedFetch, type FetchResult } from "@/data/http";

/**
 * USGS earthquake adapter — real-time GeoJSON feeds for display and
 * FDSN event WS for historical analysis. Every payload passes through
 * Zod. Real-time caches 5–15 min; regional historical catalogs 6 h.
 *
 * USGS ComCat: https://earthquake.usgs.gov/fdsnws/event/1/
 */

const FEATURE = z.object({
  id: z.union([z.string(), z.number()]).nullable().optional(),
  properties: z.object({
    mag: z.number().nullable().catch(null),
    place: z.string().nullable().catch(null),
    time: z.number(),
    url: z.string().nullable().catch(null),
    tsunami: z.number().nullable().catch(null),
  }),
  geometry: z.object({
    coordinates: z.array(z.number()),
  }),
});

const FEATURE_COLLECTION = z.object({
  features: z.array(FEATURE),
});

export function parseQuakeCollection(raw: unknown): QuakeEvent[] {
  const data = FEATURE_COLLECTION.parse(raw);
  return data.features
    .map((f, i): QuakeEvent | null => {
      const [lon, lat, depth] = f.geometry.coordinates;
      if (typeof lon !== "number" || typeof lat !== "number") return null;
      return {
        id: f.id != null ? String(f.id) : `idx-${i}-${f.properties.time}`,
        mag: f.properties.mag ?? 0,
        time: f.properties.time,
        depthKm: typeof depth === "number" ? depth : 0,
        lon,
        lat,
        place: f.properties.place ?? "—",
        url: f.properties.url ?? undefined,
        aftershockCandidate: false,
      };
    })
    .filter((e): e is QuakeEvent => e !== null)
    .sort((a, b) => a.time - b.time);
}

function latestObservation(events: unknown): string | null {
  const list = events as QuakeEvent[];
  if (!Array.isArray(list) || list.length === 0) return null;
  return new Date(Math.max(...list.map((e) => e.time))).toISOString();
}

/* ------------------------------------------------------------------ */
/* Display feeds                                                       */
/* ------------------------------------------------------------------ */

const FEED_TTL = 5 * 60_000;

export function getDailyFeed(): Promise<FetchResult<QuakeEvent[]>> {
  return cachedFetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    parseQuakeCollection,
    {
      key: "usgs-feed-day",
      ttlMs: FEED_TTL,
      source: "USGS earthquakes (real-time feed)",
      observedAt: latestObservation,
      fixture: () => readFixture("usgs/all_day.geojson"),
    },
  );
}

export function getWeeklyFeed(): Promise<FetchResult<QuakeEvent[]>> {
  return cachedFetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
    parseQuakeCollection,
    {
      key: "usgs-feed-week",
      ttlMs: FEED_TTL,
      source: "USGS earthquakes (real-time feed)",
      observedAt: latestObservation,
      // fixture: derive the week slice from the 30d snapshot
      fixture: () => {
        const m30 = readFixture("usgs/m30d_m4.geojson");
        if (!m30) return null;
        const events = parseQuakeCollection(m30);
        const newest = Math.max(...events.map((e) => e.time));
        const week = events.filter((e) => e.time > newest - 7 * 86_400_000);
        return { features: toGeojsonFeatures(week) };
      },
    },
  );
}

/* ------------------------------------------------------------------ */
/* Map catalogs (30d M4+, 90d M4.5+)                                   */
/* ------------------------------------------------------------------ */

const MAP_TTL = 15 * 60_000;

export function getMapCatalog30d(): Promise<FetchResult<QuakeEvent[]>> {
  const start = isoDaysAgo(30);
  return cachedFetch(
    fdsnUrl({ starttime: start, minmagnitude: 4, orderby: "time" }),
    parseQuakeCollection,
    {
      key: "usgs-map-30d",
      ttlMs: MAP_TTL,
      source: "USGS earthquakes (FDSN)",
      observedAt: latestObservation,
      fixture: () => readFixture("usgs/m30d_m4.geojson"),
    },
  );
}

export function getMapCatalog90d(): Promise<FetchResult<QuakeEvent[]>> {
  const start = isoDaysAgo(90);
  return cachedFetch(
    fdsnUrl({ starttime: start, minmagnitude: 4.5, orderby: "time" }),
    parseQuakeCollection,
    {
      key: "usgs-map-90d",
      ttlMs: MAP_TTL,
      source: "USGS earthquakes (FDSN)",
      observedAt: latestObservation,
      fixture: () => readFixture("usgs/m90d_m45.geojson"),
    },
  );
}

/* ------------------------------------------------------------------ */
/* Global analysis sets                                                */
/* ------------------------------------------------------------------ */

/** M6.5+ anywhere, last 30 d — remote-perturbation candidates */
export function getRemoteCandidates(): Promise<FetchResult<QuakeEvent[]>> {
  return cachedFetch(
    fdsnUrl({ starttime: isoDaysAgo(30), minmagnitude: 6.5, orderby: "time" }),
    parseQuakeCollection,
    {
      key: "usgs-m65-30d",
      ttlMs: 30 * 60_000,
      source: "USGS earthquakes (FDSN)",
      observedAt: latestObservation,
      fixture: () => readFixture("usgs/m65_30d.geojson"),
    },
  );
}

/** Largest events for the global dashboard (7d / 30d) */
export async function getLargestEvents(
  days: 7 | 30,
): Promise<FetchResult<QuakeEvent[]>> {
  const res = await cachedFetch(
    fdsnUrl({ starttime: isoDaysAgo(days), minmagnitude: 5.5, orderby: "magnitude" }),
    parseQuakeCollection,
    {
      key: `usgs-largest-${days}d`,
      ttlMs: 15 * 60_000,
      source: "USGS earthquakes (FDSN)",
      observedAt: latestObservation,
      fixture: () => {
        const m30 = readFixture("usgs/m30d_m4.geojson");
        if (!m30) return null;
        const events = parseQuakeCollection(m30)
          .filter((e) => e.mag >= 5.5)
          .sort((a, b) => b.mag - a.mag);
        return { features: toGeojsonFeatures(events.slice(0, 12)) };
      },
    },
  );
  return { ...res, data: res.data.sort((a, b) => b.mag - a.mag).slice(0, 12) };
}

/* ------------------------------------------------------------------ */
/* Per-region historical catalog                                       */
/* ------------------------------------------------------------------ */

export interface RegionCatalog {
  events: QuakeEvent[];
  /** days of baseline coverage */
  days: number;
  /** minimum magnitude actually used (raised when the catalog capped) */
  effectiveMinMag: number;
  truncated: boolean;
}

const REGION_DAYS = 5 * 365;
const FDSN_LIMIT = 20_000;

/**
 * Fetch the full M4+ catalog inside the region circle for ~5 years.
 * No fixture fallback — if upstream fails, seismic-derived metrics
 * become honestly UNKNOWN for the region.
 */
export async function getRegionCatalog(
  profile: RegionProfile,
  requestedMinMag = 4.0,
  days = REGION_DAYS,
): Promise<FetchResult<RegionCatalog>> {
  const base = {
    latitude: profile.center[1],
    longitude: profile.center[0],
    maxradiuskm: profile.radiusKm,
    starttime: isoDaysAgo(days),
    orderby: "time-asc",
  } as const;

  // choose the lowest minmagnitude whose count fits the query limit
  let minMag = requestedMinMag;
  const count = await countEvents({ ...base, minmagnitude: minMag });
  let truncated = false;
  if (count != null && count > FDSN_LIMIT * 0.95) {
    truncated = true;
    for (const candidate of [4.5, 5.0, 5.5]) {
      if (candidate <= minMag) continue;
      const c = await countEvents({ ...base, minmagnitude: candidate });
      if (c != null && c <= FDSN_LIMIT * 0.95) {
        minMag = candidate;
        break;
      }
    }
  }

  const parse = (raw: unknown): RegionCatalog => {
    const events = parseQuakeCollection(raw);
    return { events, days, effectiveMinMag: minMag, truncated };
  };

  return cachedFetch(
    fdsnUrl({ ...base, minmagnitude: minMag, limit: FDSN_LIMIT }),
    parse,
    {
      key: `usgs-region-${profile.slug}-${days}d`,
      ttlMs: 6 * 3_600_000,
      source: "USGS earthquakes (FDSN)",
      observedAt: (d) => {
        const rc = d as RegionCatalog;
        return latestObservation(rc.events);
      },
      timeoutMs: 30_000,
    },
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function countEvents(
  params: Record<string, string | number>,
): Promise<number | null> {
  try {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/count?format=text&${new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    )}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SubductionState/0.1 (research prototype)" },
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    const n = parseInt(text.trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function fdsnUrl(params: Record<string, string | number>): string {
  const search = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  search.set("format", "geojson");
  return `https://earthquake.usgs.gov/fdsnws/event/1/query?${search}`;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function readFixture(rel: string): unknown | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "fixtures", rel), "utf8"),
    );
  } catch {
    return null;
  }
}

function toGeojsonFeatures(events: QuakeEvent[]): unknown[] {
  return events.map((e) => ({
    type: "Feature",
    id: e.id,
    properties: {
      mag: e.mag,
      place: e.place,
      time: e.time,
      url: e.url ?? null,
    },
    geometry: { coordinates: [e.lon, e.lat, e.depthKm] },
  }));
}
