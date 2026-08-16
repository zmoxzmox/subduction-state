import type { QuakeEvent } from "@/types";
import { clamp } from "@/lib/utils";

/**
 * Component 10 — Along-margin migration (weight 5, EXPERIMENTAL).
 *
 * Projects declustered events onto the segment's along-strike axis,
 * clusters them into independent sequences, and evaluates whether the
 * along-strike position of clusters trends consistently with time
 * (Spearman rank correlation). Requires ≥ 4 independent clusters and
 * meaningful spatial separation — otherwise UNKNOWN, never guessed.
 */

export const MIN_CLUSTERS = 4;
export const MIN_SPREAD_KM = 120;
export const CLUSTER_TIME_GAP_DAYS = 10;
export const CLUSTER_SPATIAL_GAP_KM = 80;

/* ----------------------------- Spearman ----------------------------- */

export function rank(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const);
  idx.sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

export function spearman(xs: number[], ys: number[]): number {
  if (xs.length < 3) return 0;
  return clamp(pearson(rank(xs), rank(ys)), -1, 1);
}

/* ------------------------- Along-strike axis ------------------------ */

/**
 * Project a point onto the along-strike axis defined by a segment
 * reference (lon0, lat0) and strike azimuth (degrees from north).
 * Returns signed distance in km along the strike direction.
 */
export function alongStrikeKm(
  lon: number,
  lat: number,
  refLon: number,
  refLat: number,
  strikeAzimuthDeg: number,
): number {
  const kmPerDegLon = 111.32 * Math.cos((refLat * Math.PI) / 180);
  const kmPerDegLat = 110.57;
  const x = (lon - refLon) * kmPerDegLon;
  const y = (lat - refLat) * kmPerDegLat;
  const az = (strikeAzimuthDeg * Math.PI) / 180;
  // unit vector pointing along strike (azimuth from north)
  const ux = Math.sin(az);
  const uy = Math.cos(az);
  return x * ux + y * uy;
}

/* ------------------------------ Clusters ---------------------------- */

export interface EventCluster {
  events: QuakeEvent[];
  meanTime: number;
  meanAlongStrike: number;
  maxMag: number;
}

export function clusterAlongStrike(
  events: QuakeEvent[],
  refLon: number,
  refLat: number,
  strikeAzimuthDeg: number,
): EventCluster[] {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const clusters: EventCluster[] = [];
  const TIME_GAP = CLUSTER_TIME_GAP_DAYS * 86_400_000;

  for (const e of sorted) {
    const s = alongStrikeKm(e.lon, e.lat, refLon, refLat, strikeAzimuthDeg);
    const last = clusters[clusters.length - 1];
    if (last) {
      const dAlong = Math.abs(s - last.meanAlongStrike);
      const dTime = e.time - last.events[last.events.length - 1].time;
      if (dTime <= TIME_GAP && dAlong <= CLUSTER_SPATIAL_GAP_KM) {
        last.events.push(e);
        // incremental means (cheap, deterministic)
        const n = last.events.length;
        last.meanTime = last.meanTime + (e.time - last.meanTime) / n;
        last.meanAlongStrike =
          last.meanAlongStrike + (s - last.meanAlongStrike) / n;
        last.maxMag = Math.max(last.maxMag, e.mag);
        continue;
      }
    }
    clusters.push({
      events: [e],
      meanTime: e.time,
      meanAlongStrike: s,
      maxMag: e.mag,
    });
  }
  return clusters;
}

/* ------------------------------ Compass ----------------------------- */

export type MigrationDirection =
  | "northward"
  | "northeastward"
  | "eastward"
  | "southeastward"
  | "southward"
  | "southwestward"
  | "westward"
  | "northwestward"
  | "none";

/** Map a signed along-strike movement to a compass direction label. */
export function migrationDirection(
  correlationSign: number,
  strikeAzimuthDeg: number,
): MigrationDirection {
  if (correlationSign === 0) return "none";
  // positive correlation → motion toward the +strike direction
  const az = ((correlationSign > 0
    ? strikeAzimuthDeg
    : strikeAzimuthDeg + 180) +
    360) %
    360;
  const dirs: MigrationDirection[] = [
    "northward",
    "northeastward",
    "eastward",
    "southeastward",
    "southward",
    "southwestward",
    "westward",
    "northwestward",
  ];
  return dirs[Math.round(az / 45) % 8];
}

/* ------------------------------ Compute ----------------------------- */

export interface MigrationInput {
  /** declustered events M ≥ 4.5 inside the corridor */
  events: QuakeEvent[];
  refLon: number;
  refLat: number;
  strikeAzimuthDeg: number;
}

export interface MigrationResult {
  score: number | null;
  rho: number | null;
  clusterCount: number;
  spreadKm: number | null;
  direction: MigrationDirection;
  momentConcentration: number | null;
  notes: string[];
}

export function computeMigration(input: MigrationInput): MigrationResult {
  const { events, refLon, refLat, strikeAzimuthDeg } = input;
  const notes: string[] = [];

  const clusters = clusterAlongStrike(events, refLon, refLat, strikeAzimuthDeg);

  if (clusters.length < MIN_CLUSTERS) {
    notes.push("insufficient-independent-clusters");
    return {
      score: null,
      rho: null,
      clusterCount: clusters.length,
      spreadKm: null,
      direction: "none",
      momentConcentration: null,
      notes,
    };
  }

  const positions = clusters.map((c) => c.meanAlongStrike);
  const spreadKm = Math.max(...positions) - Math.min(...positions);

  if (spreadKm < MIN_SPREAD_KM) {
    notes.push("insufficient-spatial-spread");
    return {
      score: null,
      rho: null,
      clusterCount: clusters.length,
      spreadKm,
      direction: "none",
      momentConcentration: null,
      notes,
    };
  }

  const times = clusters.map((c) => c.meanTime);
  const rho = spearman(times, positions);

  // moment concentration: fraction of total seismic moment held by the
  // largest cluster — a single dominant cloud undermines a migration claim
  const moments = clusters.map(
    (c) => c.events.reduce((s, e) => s + 10 ** (1.5 * (e.mag + 10.7) - 24.46), 0),
  );
  const totalMoment = moments.reduce((a, b) => a + b, 0);
  const momentConcentration =
    totalMoment > 0 ? Math.max(...moments) / totalMoment : null;

  let score = 100 * Math.abs(rho);
  score *= clamp(spreadKm / 300, 0.25, 1); // meaningful spatial movement
  score *= clamp(clusters.length / 6, 0.5, 1); // multiple independent clusters
  if (momentConcentration != null && momentConcentration > 0.6) {
    score *= 0.5; // dominated by one local sequence
    notes.push("single-cluster-moment-dominated");
  }
  if (Math.abs(rho) < 0.5) {
    score = 0;
    notes.push("no-consistent-direction");
  }

  return {
    score: clamp(score, 0, 100),
    rho,
    clusterCount: clusters.length,
    spreadKm,
    direction: migrationDirection(Math.sign(rho), strikeAzimuthDeg),
    momentConcentration,
    notes,
  };
}
