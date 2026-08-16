import type { QuakeEvent } from "@/types";
import { distanceKm } from "@/lib/utils";

/**
 * ETAS-lite / heuristic declustering.
 *
 * An event is an *aftershock candidate* when it occurs within a
 * magnitude-dependent radius and time window of a prior M ≥ 6 event.
 * This is a transparent heuristic for declustered-rate statistics —
 * it is NOT a full ETAS model and does not estimate triggering
 * probabilities.
 */

export const DECLUSTER_MAINSHOCK_MAG = 6.0;

/** Aftershock-zone radius in km ≈ 10^(0.5·M − 1.4) (M6.5 → ~71 km, M8 → ~400 km) */
export function aftershockRadiusKm(mainshockMag: number): number {
  return Math.min(500, Math.max(10, 10 ** (0.5 * mainshockMag - 1.4)));
}

/** Window in days ≈ 10^(0.55·M − 1.95) (M6 → ~22 d, M7 → ~80 d, M8 → ~280 d) */
export function aftershockWindowDays(mainshockMag: number): number {
  return Math.min(365, Math.max(7, 10 ** (0.55 * mainshockMag - 1.95)));
}

export interface MainshockWindow {
  id: string;
  mag: number;
  time: number;
  lon: number;
  lat: number;
  radiusKm: number;
  end: number;
}

/** Extract the M6+ "mainshock" windows that drive the heuristic. */
export function mainshockWindows(
  events: QuakeEvent[],
  minMag = DECLUSTER_MAINSHOCK_MAG,
): MainshockWindow[] {
  return events
    .filter((e) => e.mag >= minMag)
    .map((e) => ({
      id: e.id,
      mag: e.mag,
      time: e.time,
      lon: e.lon,
      lat: e.lat,
      radiusKm: aftershockRadiusKm(e.mag),
      end: e.time + aftershockWindowDays(e.mag) * 86_400_000,
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Classify each event as an aftershock candidate. Events must be passed
 * in any order; returns a new array with `aftershockCandidate` set.
 */
export function decluster(
  events: QuakeEvent[],
  windows?: MainshockWindow[],
): QuakeEvent[] {
  const ws = (windows ?? mainshockWindows(events)).slice().sort((a, b) => a.time - b.time);
  return events.map((e) => {
    let isCandidate = false;
    for (const w of ws) {
      if (w.time >= e.time) break; // windows sorted; only *prior* mainshocks count
      if (e.time > w.end) continue;
      if (distanceKm(e.lon, e.lat, w.lon, w.lat) <= w.radiusKm) {
        isCandidate = true;
        break;
      }
    }
    return { ...e, aftershockCandidate: isCandidate };
  });
}

export function independentEvents(events: QuakeEvent[]): QuakeEvent[] {
  return events.filter((e) => !e.aftershockCandidate);
}
