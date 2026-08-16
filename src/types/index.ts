/**
 * Core domain types for Subduction State.
 *
 * These types are the contract between data adapters, the scoring engine,
 * API routes and the UI. They are deliberately isomorphic (no server- or
 * client-only types) so the scoring engine can run on either side.
 */

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * How a value came to exist.
 *
 * - `live`          fetched from an upstream service moments ago
 * - `derived`       computed by our own pipeline from live observations
 * - `curated`       peer-reviewed structural prior, stored in a profile file
 * - `experimental`  computed from a proxy whose value is unvalidated
 * - `missing`       unknown — never silently converted to "normal"
 */
export type MetricStatus = "live" | "derived" | "curated" | "experimental" | "missing";

export interface EvidenceItem {
  id: string;
  metricId: string;
  regionId: string;
  label: string;
  value: number | string | null;
  unit?: string;
  status: MetricStatus;
  sourceName: string;
  sourceUrl?: string;
  observedAt?: string;
  fetchedAt?: string;
  methodology?: string;
  confidence: number; // 0..1
  notes?: string;
}

export interface ScoredMetric {
  id: string;
  /** 0..100, or null when unknown. null is NOT zero. */
  score: number | null;
  weight: number;
  status: MetricStatus;
  confidence: number; // 0..1
  evidence: EvidenceItem[];
  /** Machine-readable detail for the evidence drawer (transform inputs). */
  details?: Record<string, string | number | boolean | null>;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Score mathematics                                                   */
/* ------------------------------------------------------------------ */

export type ScoreBand = "weak" | "limited" | "moderate" | "substantial" | "strong";
export type CoverageBand = "excellent" | "good" | "partial" | "sparse" | "insufficient";

export interface ScoreSummary {
  /** Σ(weight × score / 100) over known metrics */
  knownContribution: number;
  /** Σ(weight) over known metrics */
  knownWeight: number;
  /** 100 − knownWeight */
  missingWeight: number;
  /** knownContribution / knownWeight × 100 — null when nothing is known */
  observed: number | null;
  /** knownContribution */
  minFull: number;
  /** knownContribution + missingWeight */
  maxFull: number;
  /** knownContribution + missingWeight × 0.5 (research value, not primary) */
  neutralImputed: number;
  /** knownWeight / 100 */
  coverage: number;
  observedBand: ScoreBand | null;
  coverageBand: CoverageBand;
}

/* ------------------------------------------------------------------ */
/* Earthquakes                                                         */
/* ------------------------------------------------------------------ */

export type DepthClass = "shallow" | "intermediate" | "deep";

export interface QuakeEvent {
  id: string;
  mag: number;
  /** epoch milliseconds */
  time: number;
  depthKm: number;
  lon: number;
  lat: number;
  place: string;
  /** USGS ComCat event page */
  url?: string;
  /** ETAS-lite heuristic: within magnitude-dependent radius/time of a prior M6+ */
  aftershockCandidate: boolean;
}

/* ------------------------------------------------------------------ */
/* Volcanoes                                                           */
/* ------------------------------------------------------------------ */

export type VolcanoActivityState = "location-only" | "historical" | "recent-eruption";

export interface Volcano {
  id: string;
  name: string;
  country: string;
  lon: number;
  lat: number;
  type?: string;
  /** Last known eruption year (negative = BCE), from GVP when available */
  lastEruptionYear?: number | null;
  activityState: VolcanoActivityState;
  /** distance in km from region center */
  distanceKm?: number;
}

/* ------------------------------------------------------------------ */
/* GNSS                                                                */
/* ------------------------------------------------------------------ */

export interface GnssStation {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** robust z of recent residual vs historical distribution (horizontal) */
  robustZ: number | null;
  /** residuals for the chart: [timeMs, eastResidualMm, northResidualMm] sampled */
  series?: Array<[number, number, number]>;
  dataSpanDays?: number;
}

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

export interface EnsoState {
  /** Oceanic Niño Index, latest season, °C */
  oni: number | null;
  season: string | null;
  phase: "el-nino" | "la-nina" | "neutral";
}

export interface EnvSample {
  sstAnomalyC: number | null;
  /** percentile of the anomaly vs local seasonal distribution (0..1) */
  sstPercentile: number | null;
  sshAnomalyCm: number | null;
  observedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Regions                                                             */
/* ------------------------------------------------------------------ */

export type MetricId =
  | "couplingAsperity"
  | "slipDeficitMaturity"
  | "longTermQuiescence"
  | "recentQuiescence"
  | "interfaceActivation"
  | "gnssTransient"
  | "environmentalPerturbation"
  | "remotePerturbation"
  | "volcanicResponse"
  | "alongMarginMigration";

export interface CuratedMetric {
  score: number; // 0..100
  rawValue: string | number | null;
  unit?: string;
  methodology: { en: string; es: string };
  sourceName: string;
  sourceUrl?: string;
  /** publication / data date, ISO */
  sourceDate: string;
  confidence: number; // 0..1
  lastReviewedAt: string;
  caveats?: { en?: string; es?: string };
}

export interface RegionProfile {
  id: string;
  slug: string;
  name: { en: string; es: string };
  /** e.g. "Nazca → South American Plate" (bilingual plate names come from i18n where they differ) */
  platePair: { en: string; es: string };
  marginType: "subduction";
  /** margin group for same-margin logic (remote perturbation) */
  margin: string;
  center: [lon: number, lat: number];
  bbox: [west: number, south: number, east: number, north: number];
  /** radius of the circular analysis corridor in km */
  radiusKm: number;
  /** analysis corridor polygon [lon,lat][] */
  polygon: [number, number][];
  /** simplified trench axis [lon,lat][] for the along-strike axis + fallback map geometry */
  trench: [number, number][];
  /** curated strongly-coupled asperity polygon (Lima reference profile) */
  couplingPolygon?: [number, number][];
  /** azimuth of the along-strike direction at the segment (degrees from north) */
  strikeAzimuthDeg: number;
  convergence: { rateMmYr: number; azimuthDeg: number; source: string } | null;
  /** offshore point used for SST/SSH sampling */
  envSamplePoint: [lon: number, lat: number];
  featured?: boolean;
  /** curated structural priors — only where peer-reviewed evidence exists */
  curated?: Partial<Record<MetricId, CuratedMetric>>;
  context?: { en: string; es: string };
}

/* ------------------------------------------------------------------ */
/* Data health                                                         */
/* ------------------------------------------------------------------ */

export type HealthStatus = "healthy" | "stale" | "failed" | "unknown";
/** How a payload reached the client */
export type PayloadMode = "live" | "cached" | "fixture" | "unknown";

export interface DataHealth {
  source: string;
  lastFetch: string | null;
  latestObservation: string | null;
  status: HealthStatus;
  mode: PayloadMode;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Aggregates returned by the API                                      */
/* ------------------------------------------------------------------ */

export interface ScoredRegion {
  slug: string;
  name: { en: string; es: string };
  center: [number, number];
  summary: ScoreSummary;
  metrics: ScoredMetric[];
  /** id of the known metric with the largest weight×score contribution */
  dominantMetricId: MetricId | null;
  /** independent (declustered) M5+ count in the corridor, last 30d */
  m5Count30d: number | null;
  margin: string;
  coverage: number;
}

export interface ChangeFeedItem {
  id: string;
  date: string; // ISO date
  deltaScore: number | null;
  descriptionKey: string; // i18n key
  descriptionParams?: Record<string, string | number>;
}
