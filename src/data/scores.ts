import type {
  ChangeFeedItem,
  EnsoState,
  EnvSample,
  GnssStation,
  MetricId,
  RegionProfile,
  ScoreSummary,
  ScoredMetric,
  Volcano,
} from "@/types";
import { getRegionProfiles } from "@/regions/profiles";
import { CANONICAL_CONFIG } from "@/scoring/config";
import { computeRegionMetrics, type RegionDynamicData } from "@/scoring/region-scorer";
import { aggregateScoredMetrics, dominantMetric } from "@/scoring/score";
import { buildSummaryClauses, type SummaryClause } from "@/scoring/summary";
import { buildChangeFeed } from "@/scoring/changefeed";
import { computeBValue } from "@/scoring/bvalue";
import {
  alongMarginSeries,
  depthHistogram,
  depthStats,
  momentRelease,
  rollingRate,
} from "@/scoring/timeseries";
import { getRegionDynamicData, type RegionDataBundle } from "./region-data";
import { getRegionMomentTensors } from "./adapters/usgs-moment-tensors";
import { getEnso } from "./adapters/noaa-enso";

/**
 * Server-side score assembly. Two entry points:
 *
 *  - getGlobalScores(): lightweight scoring for all regions (map regime
 *    layer + global dashboard). GNSS and SST history are skipped unless
 *    already cached; a time budget keeps cold-start responses bounded
 *    and the client refetches until `complete`.
 *
 *  - getRegionDetail(slug): full analysis for one region, including
 *    evidence, chart series, change feed and (on demand) GNSS.
 */

export interface RegionScoreEntry {
  slug: string;
  name: { en: string; es: string };
  margin: string;
  center: [number, number];
  polygon: [number, number][];
  trench: [number, number][];
  couplingPolygon?: [number, number][];
  radiusKm: number;
  platePair: { en: string; es: string };
  strikeAzimuthDeg: number;
  convergence: RegionProfile["convergence"];
  featured?: boolean;
  context?: { en: string; es: string };
  summary: ScoreSummary;
  dominantMetricId: MetricId | null;
  m5Count30d: number | null;
  metrics: ScoredMetric[];
  /** data modes for the region's sources */
  modes: RegionDataBundle["modes"];
  gnssStations?: GnssStation[];
}

export interface GlobalScores {
  generatedAt: string;
  complete: boolean;
  pendingRegions: string[];
  regions: RegionScoreEntry[];
  enso: EnsoState | null;
}

let globalCache: { at: number; data: GlobalScores } | null = null;
const GLOBAL_TTL = 10 * 60_000;

/**
 * Canonical per-region score cache — the SINGLE source of truth for the
 * map regime layer, the home rankings, compare and the region page, so
 * every surface shows byte-identical numbers for a region.
 */
const regionScoreCache = new Map<
  string,
  { at: number; now: number; entry: RegionScoreEntry; data: RegionDataBundle }
>();
const REGION_SCORE_TTL = 10 * 60_000;
/** concurrent callers share one in-flight computation per region */
const inFlight = new Map<
  string,
  Promise<{ now: number; entry: RegionScoreEntry; data: RegionDataBundle }>
>();

export async function getRegionScoreEntry(
  profile: RegionProfile,
): Promise<{ now: number; entry: RegionScoreEntry; data: RegionDataBundle }> {
  const hit = regionScoreCache.get(profile.slug);
  if (hit && Date.now() - hit.at < REGION_SCORE_TTL) return hit;
  const pending = inFlight.get(profile.slug);
  if (pending) return pending;
  const work = (async () => {
    try {
      const data = await getRegionDynamicData(profile, CANONICAL_CONFIG, {
        includeEnv: true,
      });
      const now = Date.now();
      const entry = buildScoreEntry(profile, data, now);
      const record = { at: now, now, entry, data };
      regionScoreCache.set(profile.slug, record);
      return record;
    } finally {
      inFlight.delete(profile.slug);
    }
  })();
  inFlight.set(profile.slug, work);
  return work;
}

export async function getGlobalScores(
  opts: { wait?: boolean } = {},
): Promise<GlobalScores> {
  if (globalCache && Date.now() - globalCache.at < GLOBAL_TTL) {
    return globalCache.data;
  }
  const profiles = getRegionProfiles();

  // regions resolve into this map as their (cached) data lands; the
  // deadline only bounds THIS response — late regions keep warming the
  // cache for the next poll
  const settled = new Map<string, RegionScoreEntry>();
  const work = (async () => {
    await Promise.allSettled(
      profiles.map(async (profile) => {
        try {
          settled.set(profile.slug, (await getRegionScoreEntry(profile)).entry);
        } catch {
          // stays pending for this response
        }
      }),
    );
  })();

  if (opts.wait) {
    await work;
  } else {
    await Promise.race([
      work,
      new Promise((r) => setTimeout(r, 25_000)),
    ]);
  }

  const entries: RegionScoreEntry[] = [];
  const pending: string[] = [];
  for (const profile of profiles) {
    const hit = settled.get(profile.slug);
    if (hit) entries.push(hit);
    else pending.push(profile.slug);
  }

  const enso = await getEnso()
    .then((e) => e?.latest ?? null)
    .catch(() => null);

  const payload: GlobalScores = {
    generatedAt: new Date().toISOString(),
    complete: pending.length === 0,
    pendingRegions: pending,
    regions: entries,
    enso,
  };
  if (payload.complete) globalCache = { at: Date.now(), data: payload };
  return payload;
}

export function buildScoreEntry(
  profile: RegionProfile,
  data: RegionDynamicData & { modes?: RegionDataBundle["modes"] },
  now: number,
): RegionScoreEntry {
  const { metrics, m5Count30d } = computeRegionMetrics(
    profile,
    data,
    CANONICAL_CONFIG,
    now,
  );
  const summary = aggregateScoredMetrics(metrics);
  return {
    slug: profile.slug,
    name: profile.name,
    margin: profile.margin,
    center: profile.center,
    polygon: profile.polygon,
    trench: profile.trench,
    couplingPolygon: profile.couplingPolygon,
    radiusKm: profile.radiusKm,
    platePair: profile.platePair,
    strikeAzimuthDeg: profile.strikeAzimuthDeg,
    convergence: profile.convergence,
    featured: profile.featured,
    context: profile.context,
    summary,
    dominantMetricId: dominantMetric(metrics),
    m5Count30d,
    metrics,
    modes: (data as RegionDataBundle).modes ?? {
      catalog: "live",
      volcanoes: "live",
      env: "live",
      enso: "live",
      gnss: "unavailable",
    },
    gnssStations: data.gnssStations ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Region detail                                                       */
/* ------------------------------------------------------------------ */

export interface RegionDetail extends RegionScoreEntry {
  summaryClauses: SummaryClause[];
  changeFeed: ChangeFeedItem[];
  charts: {
    timeline: Array<{ t: number; mag: number; depthKm: number; aftershock: boolean }>;
    rate7: Array<{ t: number; rate: number }>;
    rate30: Array<{ t: number; rate: number }>;
    baselineRate30: number | null;
    depthHistogram: ReturnType<typeof depthHistogram>;
    alongMargin: ReturnType<typeof alongMarginSeries>;
    bValueCurrent: ReturnType<typeof computeBValue>;
    bValueBaseline: ReturnType<typeof computeBValue>;
    moment: Record<number, number>;
    depthStats: ReturnType<typeof depthStats>;
  };
  volcanoes: Volcano[] | null;
  env: EnvSample | null;
  enso: EnsoState | null;
  gnssAggregate: {
    score: number | null;
    medianZ: number | null;
    stationCount: number;
    message?: string;
  };
  /** partial historical replay: seismic-derived metrics only */
  replayMode: boolean;
  generatedAt: string;
}

const detailCache = new Map<string, { at: number; data: RegionDetail }>();

export async function getRegionDetail(
  slug: string,
  opts: { asOf?: string } = {},
): Promise<RegionDetail | null> {
  const profile = getRegionProfiles().find((r) => r.slug === slug);
  if (!profile) return null;

  const asOfMs = opts.asOf ? Date.parse(opts.asOf) : NaN;
  const replay = Number.isFinite(asOfMs);
  const now = replay ? asOfMs : Date.now();
  const cacheKey = replay ? `${slug}@${opts.asOf}` : slug;
  const cached = detailCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.data;

  let data: RegionDataBundle;
  let entry: RegionScoreEntry;

  if (replay) {
    // partial historical replay: seismic-derived metrics only
    data = await getRegionDynamicData(profile, CANONICAL_CONFIG, {
      includeEnv: false,
    });
    data.catalog = (data.catalog ?? []).filter((e) => e.time <= now);
    data.envSample = null;
    data.enso = null;
    data.volcanoes = null;
    data.gnssStations = null;
    data.momentTensors = null;
    data.remoteEvents = data.remoteEvents.filter((e) => e.time <= now);
    entry = buildScoreEntry(profile, data, now);
  } else {
    // canonical path: reuse the EXACT cached entry the map/rankings use
    // so the region page score always matches the home table
    let nowCanon: number;
    ({ now: nowCanon, entry, data } = await getRegionScoreEntry(profile));
    // moment tensors enrich evidence on the detail page only — they
    // affect confidence, never the score, so numbers stay identical
    // (recomputed with the SAME `now` the cached entry was built with)
    const mt = data.catalog
      ? await getRegionMomentTensors(profile, data.catalog).catch(() => null)
      : null;
    if (mt) {
      data = { ...data, momentTensors: mt };
      const { metrics, m5Count30d } = computeRegionMetrics(
        profile,
        data,
        CANONICAL_CONFIG,
        nowCanon,
      );
      const summary = aggregateScoredMetrics(metrics);
      entry = { ...entry, metrics, summary, m5Count30d };
    }
  }
  const summaryClauses = buildSummaryClauses(entry.metrics);

  // change feed from asOf recomputations (cheap: local filters only)
  const history: Array<{ asOf: number; metrics: ScoredMetric[] }> = [];
  for (const days of [1, 7, 30]) {
    const asOf = now - days * 86_400_000;
    const pastData: RegionDynamicData = {
      ...data,
      catalog: (data.catalog ?? []).filter((e) => e.time <= asOf),
      envSample: null,
      enso: null,
      volcanoes: null,
      gnssStations: null,
      remoteEvents: data.remoteEvents.filter((e) => e.time <= asOf),
    };
    const { metrics: pastMetrics } = computeRegionMetrics(
      profile,
      pastData,
      CANONICAL_CONFIG,
      asOf,
    );
    history.push({ asOf, metrics: pastMetrics });
  }
  const changeFeed = buildChangeFeed(entry.metrics, history);

  const catalog = data.catalog ?? [];
  const yearAgo = now - 365 * 86_400_000;
  const bValueCurrent = computeBValue(
    catalog.filter((e) => e.time > yearAgo && !e.aftershockCandidate).map((e) => e.mag),
  );
  const bValueBaseline = computeBValue(
    catalog.filter((e) => !e.aftershockCandidate).map((e) => e.mag),
  );

  const rate30 = rollingRate(catalog, 30, 365, 5, 4, now);
  const baselineCount = catalog.filter(
    (e) => e.mag >= 4 && !e.aftershockCandidate && e.time <= now - 30 * 86_400_000,
  ).length;
  const baselineDays = Math.max(1, data.baselineDays - 30);

  const detail: RegionDetail = {
    ...entry,
    summaryClauses,
    changeFeed,
    charts: {
      timeline: catalog
        .filter((e) => e.mag >= 4)
        .map((e) => ({
          t: e.time,
          mag: e.mag,
          depthKm: e.depthKm,
          aftershock: e.aftershockCandidate,
        })),
      rate7: rollingRate(catalog, 7, 180, 3, 4, now),
      rate30,
      baselineRate30: baselineCount / baselineDays,
      depthHistogram: depthHistogram(
        catalog.filter((e) => e.time > yearAgo && !e.aftershockCandidate),
      ),
      alongMargin: alongMarginSeries(catalog, profile, 4.5, 365, now),
      bValueCurrent,
      bValueBaseline,
      moment: momentRelease(catalog, [7, 30, 365], now),
      depthStats: depthStats(catalog, now),
    },
    volcanoes: data.volcanoes,
    env: data.envSample,
    enso: data.enso,
    gnssAggregate: {
      score: entry.metrics.find((m) => m.id === "gnssTransient")?.score ?? null,
      medianZ:
        (entry.metrics.find((m) => m.id === "gnssTransient")?.details?.medianZ as
          | number
          | undefined) ?? null,
      stationCount:
        ((entry.metrics.find((m) => m.id === "gnssTransient")?.details
          ?.stationCount as number | undefined) ?? 0),
      message: data.modes.gnss === "unavailable" ? "unavailable" : undefined,
    },
    replayMode: replay,
    generatedAt: new Date().toISOString(),
  };

  detailCache.set(cacheKey, { at: Date.now(), data: detail });
  return detail;
}

export function invalidateDetailCache(slug?: string): void {
  if (slug) detailCache.delete(slug);
  else detailCache.clear();
}
