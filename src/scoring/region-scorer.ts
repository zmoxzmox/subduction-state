import type {
  CuratedMetric,
  EnsoState,
  EnvSample,
  EvidenceItem,
  GnssStation,
  MetricId,
  QuakeEvent,
  RegionProfile,
  ScoredMetric,
  Volcano,
} from "@/types";
import { distanceKm } from "@/lib/utils";
import { distanceToPolygon, distanceToPolyline, pointInCircle } from "@/lib/geo";
import { CANONICAL_WEIGHTS } from "./weights";
import type { ResearchConfig } from "./config";
import { computeQuiescence } from "./quiescence";
import { computeActivation } from "./activation";
import { computeMigration } from "./migration";
import { computeRemotePerturbation } from "./remote-perturbation";
import { computeEnvironment } from "./environment";
import { computeVolcanicResponse } from "./volcanic";
import { aggregateGnss } from "./gnss";

/** distance from the trench axis defining the convergent-boundary corridor */
export const CORRIDOR_KM = 120;
/** band around a coupling polygon that counts as its "edge buffer" */
export const EDGE_BUFFER_KM = 60;

export interface RegionDynamicData {
  /** M4+ catalog inside the region circle (recent ~5y), null when fetch failed */
  catalog: QuakeEvent[] | null;
  /** length of the fetched baseline in days */
  baselineDays: number;
  /** whether the baseline catalog was truncated (hit the 20k limit → raised threshold) */
  baselineTruncated: boolean;
  volcanoes: Volcano[] | null;
  envSample: EnvSample | null;
  enso: EnsoState | null;
  gnssStations: GnssStation[] | null;
  /** global M6.5+ events of the last 30d (for remote perturbation) */
  remoteEvents: QuakeEvent[];
  /** trench polylines of all regions on the same margin (same-margin test) */
  marginTrenches?: [number, number][][];
}

export interface RegionScoreResult {
  metrics: ScoredMetric[];
  m5Count30d: number | null;
  regionPolygon: [number, number][];
}

function evidence(
  item: Omit<EvidenceItem, "id" | "confidence"> & {
    id?: string;
    confidence?: number;
  },
  confidence?: number,
): EvidenceItem {
  return {
    ...item,
    id: item.id ?? `${item.metricId}-ev`,
    confidence: confidence ?? item.confidence ?? 0.5,
  };
}

function curatedMetric(
  regionId: string,
  id: MetricId,
  curated: CuratedMetric | undefined,
): ScoredMetric {
  const weight = CANONICAL_WEIGHTS[id];
  if (!curated) {
    return {
      id,
      score: null,
      weight,
      status: "missing",
      confidence: 0,
      evidence: [],
    };
  }
  return {
    id,
    score: curated.score,
    weight,
    status: "curated",
    confidence: curated.confidence,
    details: {
      rawValue: curated.rawValue,
      unit: curated.unit ?? null,
      sourceDate: curated.sourceDate,
      lastReviewedAt: curated.lastReviewedAt,
    },
    evidence: [
      evidence(
        {
          id: `${id}-${regionId}-curated`,
          metricId: id,
          regionId,
          label: "Curated research prior",
          value: curated.rawValue,
          unit: curated.unit,
          status: "curated",
          sourceName: curated.sourceName,
          sourceUrl: curated.sourceUrl,
          observedAt: curated.sourceDate,
          methodology: `${curated.methodology.en}`,
          confidence: curated.confidence,
          notes: curated.caveats?.en,
        },
        curated.confidence,
      ),
    ],
  };
}

export function computeRegionMetrics(
  profile: RegionProfile,
  data: RegionDynamicData,
  config: ResearchConfig,
  now: number,
): RegionScoreResult {
  const metrics: ScoredMetric[] = [];
  const weights = config.weights;
  const disabled = new Set<MetricId>(config.disabledMetrics);

  const push = (m: ScoredMetric) => {
    if (disabled.has(m.id as MetricId)) return;
    metrics.push({ ...m, weight: weights[m.id as MetricId] ?? 0 });
  };

  /* ---------------- structural curated metrics ---------------- */
  push(curatedMetric(profile.slug, "couplingAsperity", profile.curated?.couplingAsperity));
  push(curatedMetric(profile.slug, "slipDeficitMaturity", profile.curated?.slipDeficitMaturity));
  push(curatedMetric(profile.slug, "longTermQuiescence", profile.curated?.longTermQuiescence));

  /* ---------------- dynamic seismic metrics ------------------- */
  const minMag = config.thresholds.minMagnitude;
  const recentWindowMs = config.windows.recentDays * 86_400_000;
  const circle = (e: QuakeEvent) =>
    pointInCircle(
      e.lon,
      e.lat,
      profile.center[0],
      profile.center[1],
      profile.radiusKm,
    );

  const catalog = data.catalog;
  let quiescence: ReturnType<typeof computeQuiescence> | null = null;
  let activation: ReturnType<typeof computeActivation> | null = null;
  let migration: ReturnType<typeof computeMigration> | null = null;
  let m5Count30d: number | null = null;

  if (catalog && catalog.length >= 0) {
    const declustered = config.declustering
      ? catalog.filter((e) => !e.aftershockCandidate)
      : catalog;

    const inRegionNow = declustered.filter(
      (e) =>
        e.mag >= minMag &&
        e.time > now - recentWindowMs &&
        e.time <= now &&
        circle(e),
    );
    const baselineEvents = declustered.filter(
      (e) => e.mag >= minMag && e.time <= now - recentWindowMs && circle(e),
    );

    quiescence = computeQuiescence({
      recentCount: inRegionNow.length,
      recentWindowDays: config.windows.recentDays,
      baselineCount: baselineEvents.length,
      baselineDays: data.baselineDays - config.windows.recentDays,
    });
    if (data.baselineTruncated) quiescence.notes.push("baseline-truncated-increased-minmag");

    m5Count30d = declustered.filter(
      (e) =>
        e.mag >= 5 &&
        e.time > now - 30 * 86_400_000 &&
        e.time <= now &&
        circle(e),
    ).length;

    // interface / edge activation
    const hasCoupling = !!profile.couplingPolygon;
    const inEdgeZone = (e: QuakeEvent) =>
      hasCoupling && profile.couplingPolygon
        ? distanceToPolygon(e.lon, e.lat, profile.couplingPolygon) <= EDGE_BUFFER_KM
        : distanceToPolyline(e.lon, e.lat, profile.trench) <= CORRIDOR_KM;

    const corridorRecent = declustered.filter(
      (e) =>
        e.mag >= minMag &&
        e.time > now - recentWindowMs &&
        e.time <= now &&
        inEdgeZone(e) &&
        circle(e),
    );
    const corridorBaseline = declustered.filter(
      (e) =>
        e.mag >= minMag && e.time <= now - recentWindowMs && inEdgeZone(e) && circle(e),
    );
    const corridorBaselineDays = data.baselineDays - config.windows.recentDays;
    activation = computeActivation({
      recentCount: corridorRecent.length,
      currentWindowDays: config.windows.recentDays,
      baselineRate:
        corridorBaselineDays > 0
          ? corridorBaseline.length / corridorBaselineDays
          : null,
      baselineDays: corridorBaselineDays,
      hasCouplingGeometry: hasCoupling,
      hasMechanismData: false,
    });

    // along-margin migration
    const migrationEvents = declustered.filter(
      (e) =>
        e.mag >= 4.5 &&
        e.time > now - 90 * 86_400_000 &&
        e.time <= now &&
        circle(e),
    );
    migration = computeMigration({
      events: migrationEvents,
      refLon: profile.center[0],
      refLat: profile.center[1],
      strikeAzimuthDeg: profile.strikeAzimuthDeg,
    });
  }

  const quiescenceMetric: ScoredMetric = {
    id: "recentQuiescence",
    score: quiescence?.score ?? null,
    weight: weights.recentQuiescence,
    status: quiescence ? "derived" : "missing",
    confidence: quiescence?.confidence ?? 0,
    details: quiescence
      ? {
          currentRatePerDay: +quiescence.currentRate.toFixed(3),
          baselineRatePerDay: quiescence.baselineRate?.toFixed(3) ?? null,
          posteriorRatePerDay: +quiescence.posteriorRate.toFixed(3),
          suppressionPct:
            quiescence.suppression == null
              ? null
              : +(quiescence.suppression * 100).toFixed(1),
          recentWindowDays: config.windows.recentDays,
          baselineDays: data.baselineDays - config.windows.recentDays,
          declustering: config.declustering,
          minMagnitude: minMag,
        }
      : undefined,
    evidence: quiescence
      ? [
          evidence(
            {
              id: `recentQuiescence-${profile.slug}-rates`,
              metricId: "recentQuiescence",
              regionId: profile.slug,
              label: "Independent event rate vs historical baseline",
              value: quiescence.suppression == null ? null : +(quiescence.suppression * 100).toFixed(1),
              unit: "%",
              status: "derived",
              sourceName: "USGS ComCat (FDSN)",
              sourceUrl: "https://earthquake.usgs.gov/fdsnws/event/1/",
              methodology:
                "Gamma–Poisson posterior rate with baseline-centred prior (30 d strength); suppression = 1 − posteriorRate/baselineRate; piecewise-linear anchor transform (20%→25, 40%→50, 55%→75, ≥70%→100).",
              confidence: quiescence.confidence,
              notes: quiescence.notes.join(", ") || undefined,
            },
            quiescence.confidence,
          ),
        ]
      : [],
  };
  push(quiescenceMetric);

  push({
    id: "interfaceActivation",
    score: activation?.score ?? null,
    weight: weights.interfaceActivation,
    status: activation ? "derived" : "missing",
    confidence: activation?.confidence ?? 0,
    details: activation
      ? {
          recentCount: activation.recentCount,
          expectedCount: activation.expectedCount?.toFixed(2) ?? null,
          percentile: activation.percentile?.toFixed(1) ?? null,
          windowDays: config.windows.recentDays,
          geometry: profile.couplingPolygon ? "coupling-edge-buffer" : "boundary-corridor",
        }
      : undefined,
    evidence: activation
      ? [
          evidence(
            {
              id: `interfaceActivation-${profile.slug}-pct`,
              metricId: "interfaceActivation",
              regionId: profile.slug,
              label: "Corridor activity percentile (Poisson approximation)",
              value: activation.percentile == null ? null : +activation.percentile.toFixed(1),
              unit: "pct",
              status: "derived",
              sourceName: "USGS ComCat (FDSN)",
              sourceUrl: "https://earthquake.usgs.gov/fdsnws/event/1/",
              methodology:
                (profile.couplingPolygon
                  ? `Independent events within ${EDGE_BUFFER_KM} km of the curated coupling-polygon boundary. `
                  : `Independent events within ${CORRIDOR_KM} km of the convergent-boundary corridor (lower confidence — no coupling polygon). `) +
                "Percentile = P(X < k) under Poisson(λ = baseline rate × window); anchors 50th→5, 75th→35, 90th→60, 95th→75, 99th→100.",
              confidence: activation.confidence,
              notes: activation.notes.join(", ") || undefined,
            },
            activation.confidence,
          ),
        ]
      : [],
  });

  push({
    id: "alongMarginMigration",
    score: migration?.score ?? null,
    weight: weights.alongMarginMigration,
    status: migration ? "experimental" : "missing",
    confidence: migration && migration.score != null ? 0.25 : 0,
    details: migration
      ? {
          rho: migration.rho?.toFixed(2) ?? null,
          clusterCount: migration.clusterCount,
          spreadKm: migration.spreadKm == null ? null : Math.round(migration.spreadKm),
          direction: migration.direction,
          momentConcentration:
            migration.momentConcentration == null
              ? null
              : +migration.momentConcentration.toFixed(2),
        }
      : undefined,
    evidence: migration
      ? [
          evidence(
            {
              id: `alongMarginMigration-${profile.slug}-rho`,
              metricId: "alongMarginMigration",
              regionId: profile.slug,
              label: "Spearman ρ, along-strike position vs time (independent clusters)",
              value: migration.rho == null ? null : +migration.rho.toFixed(2),
              status: "experimental",
              sourceName: "USGS ComCat (FDSN)",
              sourceUrl: "https://earthquake.usgs.gov/fdsnws/event/1/",
              methodology:
                "Declustered M4.5+ events (90 d) projected onto the segment along-strike axis, clustered (10 d / 80 km); Spearman ρ of cluster position vs time; requires ≥4 clusters and ≥120 km spread. Direction from the segment strike azimuth.",
              confidence: 0.25,
              notes: migration.notes.join(", ") || undefined,
            },
            0.25,
          ),
        ]
      : [],
  });

  /* ---------------- GNSS ---------------- */
  const gnssAnomalies = (data.gnssStations ?? [])
    .map((s) => ({
      stationId: s.id,
      zEast: 0,
      zNorth: 0,
      zHorizontal: s.robustZ ?? NaN,
      recentResidualE: 0,
      recentResidualN: 0,
      madE: 0,
      madN: 0,
      series: [],
    }))
    .filter((a) => Number.isFinite(a.zHorizontal));
  const gnssAgg = aggregateGnss(gnssAnomalies);
  push({
    id: "gnssTransient",
    score: gnssAgg.score,
    weight: weights.gnssTransient,
    status: gnssAgg.score != null ? "derived" : "missing",
    confidence: gnssAgg.score != null ? 0.6 : 0,
    details: gnssAgg.score != null
      ? {
          medianZ: +gnssAgg.medianZ!.toFixed(2),
          topQuartileZ: +gnssAgg.topQuartileZ!.toFixed(2),
          stationCount: gnssAgg.stationCount,
        }
      : {
          stationCount: gnssAgg.stationCount,
          reason: "insufficient-usable-stations",
        },
    evidence: [
      evidence(
        {
          id: `gnssTransient-${profile.slug}-z`,
          metricId: "gnssTransient",
          regionId: profile.slug,
          label: "Median horizontal robust-Z across usable stations",
          value: gnssAgg.medianZ == null ? null : +gnssAgg.medianZ.toFixed(2),
          status: gnssAgg.score != null ? "derived" : "missing",
          sourceName: "Nevada Geodetic Laboratory, UNR (processed position time series)",
          sourceUrl: "https://geodesy.unr.edu/",
          methodology:
            "Per station: secular trend + annual signal removed by least squares; robustZ = |recent residual − historical median| / (1.4826 × MAD), horizontal = √(zE²+zN²); aggregate = median across stations; anchors z1.5→0, 2→25, 2.5→50, 3→75, ≥4→100. Requires ≥3 usable stations.",
          confidence: gnssAgg.score != null ? 0.6 : 0,
          notes:
            gnssAgg.stationCount < 3
              ? `usable stations: ${gnssAgg.stationCount} (<3) → UNKNOWN`
              : undefined,
        },
        gnssAgg.score != null ? 0.6 : 0,
      ),
    ],
  });

  /* ---------------- environment ---------------- */
  const env = computeEnvironment(data.envSample, data.enso);
  push({
    id: "environmentalPerturbation",
    score: env.score,
    weight: weights.environmentalPerturbation,
    status: env.score != null ? "experimental" : "missing",
    confidence: env.confidence,
    details: env.score != null
      ? {
          sstAnomalyC: data.envSample?.sstAnomalyC ?? null,
          sstPercentile: data.envSample?.sstPercentile ?? null,
          sshAnomalyCm: data.envSample?.sshAnomalyCm ?? null,
          ensoOni: data.enso?.oni ?? null,
          subweights: "sst 0.5 / ssh 0.3 / enso 0.2 (renormalised over available)",
        }
      : undefined,
    evidence: env.score != null
      ? [
          evidence(
            {
              id: `environmentalPerturbation-${profile.slug}-sst`,
              metricId: "environmentalPerturbation",
              regionId: profile.slug,
              label: "Local SST anomaly (NOAA Coral Reef Watch)",
              value: data.envSample?.sstAnomalyC ?? null,
              unit: "°C",
              status: "experimental",
              sourceName: "NOAA CoastWatch / Coral Reef Watch SST anomaly",
              sourceUrl: "https://coastwatch.noaa.gov/erddap/griddap/noaacrwsstanomalyDaily",
              methodology:
                "Latest anomaly at the region's offshore sample point; scored by local seasonal percentile where available (|p−0.5|×2), otherwise absolute-anomaly anchors.",
              confidence: 0.3,
            },
            0.3,
          ),
          evidence(
            {
              id: `environmentalPerturbation-${profile.slug}-enso`,
              metricId: "environmentalPerturbation",
              regionId: profile.slug,
              label: "ENSO state (ONI, global context)",
              value: data.enso?.oni ?? null,
              unit: "°C",
              status: "experimental",
              sourceName: "NOAA Climate Prediction Center — Oceanic Niño Index",
              sourceUrl: "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
              methodology:
                "Global context only. |ONI| anchors 0.5→0, 0.8→25, 1.2→50, 1.6→75, 2.0→100. Never used as a local earthquake predictor or multiplier.",
              confidence: 0.2,
            },
            0.2,
          ),
        ]
      : [],
  });

  /* ---------------- remote perturbation ---------------- */
  const marginLons: number[] = [];
  const marginLats: number[] = [];
  for (const r of data.marginTrenches ?? []) {
    for (const [lon, lat] of r) {
      marginLons.push(lon);
      marginLats.push(lat);
    }
  }
  const remote = computeRemotePerturbation(
    data.remoteEvents,
    profile.center[0],
    profile.center[1],
    profile.margin,
    marginLons,
    marginLats,
    now,
    config.windows.remoteRadiusKm,
  );
  push({
    id: "remotePerturbation",
    score: remote.score,
    weight: weights.remotePerturbation,
    status: "experimental",
    confidence: remote.score > 0 ? 0.2 : 0.3,
    details: {
      qualifyingEvents: remote.events.length,
      strongest: remote.maxEvent
        ? `M${remote.maxEvent.event.mag.toFixed(1)} @ ${Math.round(remote.maxEvent.distanceKm)} km, ${remote.maxEvent.ageDays.toFixed(0)} d ago`
        : "none",
    },
    evidence: [
      evidence(
        {
          id: `remotePerturbation-${profile.slug}-proxy`,
          metricId: "remotePerturbation",
          regionId: profile.slug,
          label: "Remote dynamic perturbation proxy (strongest single event)",
          value: remote.maxEvent ? +remote.maxEvent.proxy.toFixed(1) : 0,
          status: "experimental",
          sourceName: "USGS ComCat (FDSN)",
          sourceUrl: "https://earthquake.usgs.gov/fdsnws/event/1/",
          methodology:
            `M ≥ 6.5 within ${config.windows.remoteRadiusKm} km and 30 d. proxy = 100 × clamp((M−6.5)/2) × exp(−d/1500 km) × exp(−age/14 d), ×1.5 when on the same connected margin (capped). Aggregate = strongest single event, NOT a sum. This is NOT Coulomb stress transfer.`,
          confidence: 0.2,
          notes:
            remote.events.length > 0
              ? `${remote.events.length} qualifying event(s)`
              : "no qualifying events",
        },
        0.2,
      ),
    ],
  });

  /* ---------------- volcanic response ---------------- */
  const yearNow = new Date(now).getUTCFullYear();
  const volc = data.volcanoes
    ? computeVolcanicResponse(data.volcanoes, now, yearNow)
    : null;
  push({
    id: "volcanicResponse",
    score: volc ? volc.score : null,
    weight: weights.volcanicResponse,
    status: volc ? "experimental" : "missing",
    confidence: volc ? 0.2 : 0,
    details: volc
      ? {
          nearbyVolcanoes: volc.nearbyCount,
          newEruptions: volc.newEruptionCount,
        }
      : undefined,
    evidence: volc
      ? [
          evidence(
            {
              id: `volcanicResponse-${profile.slug}-gvp`,
              metricId: "volcanicResponse",
              regionId: profile.slug,
              label: "Newly started eruptions within 500 km / 90 d",
              value: volc.newEruptionCount,
              status: "experimental",
              sourceName: "Smithsonian Global Volcanism Program (VOTW)",
              sourceUrl: "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs",
              methodology:
                "Only eruption onsets within the last 90 d contribute (saturation at 3). Pre-existing/continuing eruptions contribute ~nothing. Onset dates in GVP are approximate. A volcano is never labelled 'unrest' unless the source supports it.",
              confidence: 0.2,
              notes: volc.notes.join(", ") || undefined,
            },
            0.2,
          ),
        ]
      : [],
  });

  return { metrics, m5Count30d, regionPolygon: [] };
}
