import type { QuakeEvent } from "@/types";
import { clamp, distanceKm } from "@/lib/utils";

/**
 * Component 8 — Remote dynamic / same-margin perturbation (weight 3).
 *
 * A deliberately small, explicitly EXPERIMENTAL proxy. It is a
 * geometric/time-decay heuristic for "a large nearby earthquake happened
 * recently". It is NOT Coulomb stress transfer, and a non-zero value
 * does not establish that stress was transferred to, or that triggering
 * of, any particular fault occurred.
 */

export const REMOTE_MIN_MAG = 6.5;
export const DEFAULT_REMOTE_RADIUS_KM = 2500;
export const DEFAULT_REMOTE_WINDOW_DAYS = 30;

export interface RemoteEvent {
  event: QuakeEvent;
  distanceKm: number;
  ageDays: number;
  sameMargin: boolean;
  proxy: number;
}

export function eventProxy(
  mag: number,
  distanceKmVal: number,
  ageDays: number,
  sameMargin: boolean,
): number {
  const magnitudeFactor = clamp((mag - REMOTE_MIN_MAG) / 2.0, 0, 1);
  const distanceDecay = Math.exp(-distanceKmVal / 1500);
  const timeDecay = Math.exp(-ageDays / 14);
  const proxy = 100 * magnitudeFactor * distanceDecay * timeDecay;
  return clamp(sameMargin ? proxy * 1.5 : proxy, 0, 100);
}

export interface RemotePerturbationResult {
  /** 0 when we know there were no qualifying events; null never applies here */
  score: number;
  events: RemoteEvent[];
  maxEvent: RemoteEvent | null;
}

/**
 * @param events global M6.5+ candidates (recent)
 * @param marginId margin group of the scored region
 */
export function computeRemotePerturbation(
  events: QuakeEvent[],
  refLon: number,
  refLat: number,
  marginId: string,
  sameMarginLons: number[] = [],
  sameMarginLats: number[] = [],
  now: number = Date.now(),
  radiusKm: number = DEFAULT_REMOTE_RADIUS_KM,
  windowDays: number = DEFAULT_REMOTE_WINDOW_DAYS,
): RemotePerturbationResult {
  const qualifying: RemoteEvent[] = [];

  for (const e of events) {
    if (e.mag < REMOTE_MIN_MAG) continue;
    const ageDays = (now - e.time) / 86_400_000;
    if (ageDays < 0 || ageDays > windowDays) continue;
    const d = distanceKm(e.lon, e.lat, refLon, refLat);
    if (d > radiusKm) continue;
    let sameMargin = false;
    if (sameMarginLons.length > 0) {
      // same connected margin: within 400 km of the margin's trench axis samples
      for (let i = 0; i < sameMarginLons.length; i++) {
        if (distanceKm(e.lon, e.lat, sameMarginLons[i], sameMarginLats[i]) < 400) {
          sameMargin = true;
          break;
        }
      }
    }
    qualifying.push({
      event: e,
      distanceKm: d,
      ageDays,
      sameMargin,
      proxy: eventProxy(e.mag, d, ageDays, sameMargin),
    });
  }

  // Aggregate conservatively: the strongest single event, not the sum —
  // multiple remote events do not "add up" to stress transfer.
  const maxEvent =
    qualifying.length === 0
      ? null
      : qualifying.reduce((a, b) => (b.proxy > a.proxy ? b : a));

  return {
    score: maxEvent ? maxEvent.proxy : 0,
    events: qualifying.sort((a, b) => b.proxy - a.proxy).slice(0, 6),
    maxEvent,
  };
}
