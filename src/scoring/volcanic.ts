import type { Volcano } from "@/types";
import { clamp } from "@/lib/utils";

/**
 * Component 9 — Volcanic multidomain response (weight 2).
 *
 * Very low weight, and conservative by construction: only *newly
 * started* eruptions (onset within the recent window) contribute. A
 * volcano erupting continuously for months or years contributes
 * essentially nothing — pre-existing activity is not a new response.
 * We never label a volcano "unrest" unless the source supports it,
 * and thermal anomalies (if ever added) never auto-become "unrest".
 */

export const VOLCANO_RADIUS_KM = 500;
export const NEW_ACTIVITY_WINDOW_DAYS = 90;

export interface VolcanicResponseResult {
  score: number;
  newEruptionCount: number;
  nearbyCount: number;
  nearest: Volcano | null;
  notes: string[];
}

/**
 * @param volcanoes volcanoes within VOLCANO_RADIUS_KM of the region
 * @param now epoch ms
 * @param yearNow current year (decimal) for eruption-onset comparison
 */
export function computeVolcanicResponse(
  volcanoes: Volcano[],
  now: number,
  yearNow: number,
): VolcanicResponseResult {
  const notes: string[] = [];
  const newEruptions = volcanoes.filter(
    (v) =>
      v.lastEruptionYear != null &&
      yearNow - v.lastEruptionYear < NEW_ACTIVITY_WINDOW_DAYS / 365.25,
  );

  if (volcanoes.length === 0) {
    notes.push("no-volcanoes-in-radius");
    return { score: 0, newEruptionCount: 0, nearbyCount: 0, nearest: null, notes };
  }

  // One new eruption → moderate response signal; saturation at 3.
  const base = Math.min(newEruptions.length, 3) / 3; // 0, 0.33, 0.67, 1
  const score = base * 60;

  // Confidence is intrinsically low: eruption-onset dates in GVP are
  // back-filled and "new" often cannot be resolved from the source.
  if (newEruptions.length > 0) notes.push("eruption-onset-dates-approximate");

  return {
    score: clamp(score, 0, 100),
    newEruptionCount: newEruptions.length,
    nearbyCount: volcanoes.length,
    nearest:
      volcanoes.length > 0
        ? volcanoes.reduce((a, b) =>
            (b.distanceKm ?? Infinity) < (a.distanceKm ?? Infinity) ? b : a,
          )
        : null,
    notes,
  };
}

/** Categorise a volcano for display without ever inventing "unrest". */
export function volcanoActivityState(
  lastEruptionYear: number | null | undefined,
  yearNow: number,
): Volcano["activityState"] {
  if (lastEruptionYear == null) return "location-only";
  if (yearNow - lastEruptionYear < 1) return "recent-eruption";
  return "historical";
}
