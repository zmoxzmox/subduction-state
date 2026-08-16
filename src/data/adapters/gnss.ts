import { z } from "zod";
import fsSync from "node:fs";
import path from "node:path";
import { cachedFetch, getMemoryCache } from "@/data/http";
import type { GnssStation, RegionProfile } from "@/types";
import { distanceKm } from "@/lib/utils";
import {
  MIN_USABLE_STATIONS,
  RECENT_WINDOW_DAYS,
  aggregateGnss,
  computeStationAnomaly,
  type StationAnomaly,
} from "@/scoring/gnss";
import { healthRegistry } from "@/data/health";

/**
 * GNSS adapter — Nevada Geodetic Laboratory (UNR) processed position
 * time series (IGS20 frame, `.tenv3`).
 *
 * Station discovery: NGL global station list (`midas.IGS.txt` — the
 * full IGS20 solution index with coordinates). Series:
 * /gps_timeseries/IGS20/tenv3/IGS20/{STA}.tenv3
 *
 * Raw carrier-phase processing is explicitly out of scope (spec §6).
 * If processed data cannot be fetched, GNSS is UNAVAILABLE and its
 * score stays null — no fixtures, no faked zeros.
 */

const STATION_INDEX_URL =
  "https://geodesy.unr.edu/gps_timeseries/IGS20/midas/midas.IGS.txt";
const TENV3_URL = (station: string) =>
  `https://geodesy.unr.edu/gps_timeseries/IGS20/tenv3/IGS20/${station}.tenv3`;

const stationIndexSchema = z.array(
  z.object({
    id: z.string().length(4),
    lat: z.number(),
    lon: z.number(),
  }),
);

function parseStationIndex(raw: unknown) {
  if (typeof raw !== "string") throw new Error("expected text");
  const stations: Array<{ id: string; lat: number; lon: number }> = [];
  for (const line of raw.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    const id = cols[0];
    if (!/^[A-Z0-9]{4}$/.test(id)) continue;
    const lat = parseFloat(cols[cols.length - 3]);
    let lon = parseFloat(cols[cols.length - 2]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    if (lon < -180) lon += 360;
    stations.push({ id, lat, lon });
  }
  if (stations.length < 1000) throw new Error("station index too small");
  return stationIndexSchema.parse(stations);
}

export function getStationIndex() {
  return cachedFetch(STATION_INDEX_URL, parseStationIndex, {
    key: "unr-station-index",
    ttlMs: 7 * 24 * 3_600_000,
    source: "GNSS station index (UNR NGL)",
    timeoutMs: 30_000,
  });
}

/* ----------------------------- tenv3 ------------------------------- */

export interface Tenv3Sample {
  t: number; // epoch ms
  e: number; // mm
  n: number; // mm
}

const HISTORY_DAYS = 3.5 * 365;

function parseTenv3(raw: unknown): Tenv3Sample[] {
  if (typeof raw !== "string") throw new Error("expected text");
  const lines = raw.split("\n");
  if (lines.length < 300) throw new Error("series too short");
  const header = lines[0].trim().split(/\s+/);
  const iDecYear = header.indexOf("yyyy.yyyy");
  const iE0 = header.indexOf("_e0(m)");
  const iEast = header.indexOf("__east(m)");
  const iN0 = header.indexOf("____n0(m)");
  const iNorth = header.indexOf("_north(m)");
  if (
    iDecYear < 0 || iE0 < 0 || iEast < 0 || iN0 < 0 || iNorth < 0
  ) {
    throw new Error("unexpected tenv3 header");
  }
  const cutoff = Date.now() - HISTORY_DAYS * 86_400_000;
  const out: Tenv3Sample[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length <= iNorth) continue;
    const decYear = parseFloat(cols[iDecYear]);
    const e0 = parseFloat(cols[iE0]);
    const ef = parseFloat(cols[iEast]);
    const n0 = parseFloat(cols[iN0]);
    const nf = parseFloat(cols[iNorth]);
    if ([decYear, e0, ef, n0, nf].some((v) => Number.isNaN(v))) continue;
    const t = Math.round(
      (decYear - 1970) * 365.25 * 86_400_000,
    );
    if (t < cutoff) continue;
    out.push({
      t,
      e: (e0 + ef) * 1000,
      n: (n0 + nf) * 1000,
    });
  }
  if (out.length < 300) throw new Error("insufficient recent samples");
  return out;
}

export async function getStationSeries(station: string) {
  return cachedFetch(TENV3_URL(station), parseTenv3, {
    key: `unr-tenv3-${station}`,
    ttlMs: 12 * 3_600_000,
    source: "GNSS time series (UNR NGL)",
    timeoutMs: 25_000,
  });
}

/* --------------------------- aggregation ---------------------------- */

export interface RegionGnss {
  stations: GnssStation[];
  aggregate: ReturnType<typeof aggregateGnss>;
  unavailable: boolean;
  message?: string;
}

const MAX_STATIONS = 5;

/**
 * Background warmer: fetch the nearest stations' series to populate the
 * memory/disk caches so the canonical (cachedOnly) scoring pass picks
 * them up on later requests. Never blocks or throws.
 */
export async function warmRegionGnssCache(profile: RegionProfile): Promise<void> {
  try {
    const index = await getStationIndex();
    const nearby = index.data
      .map((s) => ({
        ...s,
        d: distanceKm(s.lon, s.lat, profile.center[0], profile.center[1]),
      }))
      .filter((s) => s.d <= profile.radiusKm)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_STATIONS);
    await Promise.allSettled(nearby.map((s) => getStationSeries(s.id)));
  } catch {
    // warming is best-effort
  }
}

export async function getRegionGnss(
  profile: RegionProfile,
  opts: { cachedOnly?: boolean } = {},
): Promise<RegionGnss> {
  healthRegistry.ensure("GNSS (UNR NGL)");
  try {
    const index = await getStationIndex();
    const nearby = index.data
      .map((s) => ({
        ...s,
        d: distanceKm(s.lon, s.lat, profile.center[0], profile.center[1]),
      }))
      .filter((s) => s.d <= profile.radiusKm)
      .sort((a, b) => a.d - b.d)
      .slice(0, opts.cachedOnly ? MAX_STATIONS : MAX_STATIONS);

    // cachedOnly: skip the region entirely unless station series are
    // already on disk (progressive warmup makes GNSS appear over time)
    if (opts.cachedOnly) {
      const cached = nearby.filter((s) => hasStationSeriesCached(s.id));
      if (cached.length < MIN_USABLE_STATIONS + 1) {
        return unavailableResult("not-cached-yet");
      }
      nearby.length = 0;
      nearby.push(...cached);
    }

    if (nearby.length === 0) {
      return {
        stations: [],
        aggregate: {
          score: null, medianZ: null, topQuartileZ: null,
          stationCount: 0, anomalies: [], insufficientStations: true,
        },
        unavailable: true,
        message: "no-stations-in-radius",
      };
    }

    const now = Date.now();
    const anomalies: StationAnomaly[] = [];
    const stations: GnssStation[] = [];

    await Promise.all(
      nearby.map(async (s) => {
        try {
          const res = await getStationSeries(s.id);
          const anomaly = computeStationAnomaly(
            s.id,
            res.data.map((p) => ({ t: p.t, e: p.e, n: p.n })),
            now,
            RECENT_WINDOW_DAYS,
          );
          if (anomaly) {
            anomalies.push(anomaly);
            stations.push({
              id: s.id,
              name: s.id,
              lon: s.lon,
              lat: s.lat,
              robustZ: +anomaly.zHorizontal.toFixed(2),
              series: downsample(
                anomaly.series.map((p) => [p.t, +p.e.toFixed(1), +p.n.toFixed(1)]),
                360,
              ),
              dataSpanDays: Math.round(
                (now - res.data[0].t) / 86_400_000,
              ),
            });
          } else {
            stations.push({
              id: s.id, name: s.id, lon: s.lon, lat: s.lat, robustZ: null,
            });
          }
        } catch {
          stations.push({
            id: s.id, name: s.id, lon: s.lon, lat: s.lat, robustZ: null,
          });
        }
      }),
    );

    const aggregate = aggregateGnss(anomalies);
    return {
      stations: stations.sort((a, b) => a.id.localeCompare(b.id)),
      aggregate,
      unavailable: aggregate.insufficientStations,
      message: aggregate.insufficientStations
        ? `usable stations: ${aggregate.stationCount} (<3) → UNKNOWN`
        : undefined,
    };
  } catch (e) {
    return unavailableResult(e instanceof Error ? e.message : "unavailable");
  }
}

function unavailableResult(message?: string): RegionGnss {
  return {
    stations: [],
    aggregate: {
      score: null, medianZ: null, topQuartileZ: null,
      stationCount: 0, anomalies: [], insufficientStations: true,
    },
    unavailable: true,
    message,
  };
}

/** Does a parsed station series already exist in memory/disk cache? */
export function hasStationSeriesCached(station: string): boolean {
  const mem = getMemoryCache<Tenv3Sample[]>(`unr-tenv3-${station}`);
  if (mem) return true;
  try {
    const p = path.join(
      process.cwd(),
      ".cache/upstream",
      `unr-tenv3-${station}.json`,
    );
    return fsSync.existsSync(p);
  } catch {
    return false;
  }
}

function downsample(series: Array<[number, number, number]>, target: number) {
  if (series.length <= target) return series;
  const stride = series.length / target;
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < target; i++) {
    out.push(series[Math.floor(i * stride)]);
  }
  out.push(series[series.length - 1]);
  return out;
}
