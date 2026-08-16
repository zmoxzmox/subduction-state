import { distanceKm } from "./utils";

export type Ring = [number, number][];

/** Ray-casting point-in-polygon (lon, lat). */
export function pointInPolygon(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Minimum distance in km from a point to a polyline. */
export function distanceToPolyline(
  lon: number,
  lat: number,
  line: Ring,
): number {
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    min = Math.min(min, distanceToSegment(lon, lat, line[i], line[i + 1]));
  }
  return min;
}

/** Minimum distance in km from a point to a polygon boundary (0 when inside). */
export function distanceToPolygon(
  lon: number,
  lat: number,
  ring: Ring,
): number {
  if (pointInPolygon(lon, lat, ring)) return 0;
  return distanceToPolyline(lon, lat, ring);
}

function distanceToSegment(
  pLon: number,
  pLat: number,
  a: [number, number],
  b: [number, number],
): number {
  // project in local flat coordinates around A
  const kmPerDegLat = 110.57;
  const kmPerDegLon = 111.32 * Math.cos((a[1] * Math.PI) / 180);
  const ax = 0;
  const ay = 0;
  const bx = (b[0] - a[0]) * kmPerDegLon;
  const by = (b[1] - a[1]) * kmPerDegLat;
  const px = (pLon - a[0]) * kmPerDegLon;
  const py = (pLat - a[1]) * kmPerDegLat;
  const len2 = bx * bx + by * by;
  let t = len2 === 0 ? 0 : ((px - ax) * bx + (py - ay) * by) / len2;
  t = Math.min(1, Math.max(0, t));
  const dx = px - (ax + t * bx);
  const dy = py - (ay + t * by);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Point inside a circle of radius km around center? */
export function pointInCircle(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
  radiusKm: number,
): boolean {
  return distanceKm(lon, lat, centerLon, centerLat) <= radiusKm;
}

/**
 * Build a circular analysis polygon (lon,lat ring) around a center —
 * used for map display of a region's analysis circle.
 */
export function circleRing(
  centerLon: number,
  centerLat: number,
  radiusKm: number,
  steps = 48,
): Ring {
  const ring: Ring = [];
  const latRad = (centerLat * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm / 110.57) * Math.cos(theta);
    const dLon =
      (radiusKm / (111.32 * Math.max(0.2, Math.cos(latRad)))) * Math.sin(theta);
    ring.push([centerLon + dLon, centerLat + dLat]);
  }
  return ring;
}
