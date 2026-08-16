import type { RegionProfile } from "@/types";
import { clamp } from "@/lib/utils";

/**
 * Structural-variable derivation from PUBLIC facts.
 *
 * Instead of a static curated score per region, the slip-deficit and
 * long-term-gap variables are COMPUTED for every region from:
 *
 *  - the segment's great-rupture history (public earthquake catalogs:
 *    USGS/NEIC, NOAA significant-events; encoded per profile with
 *    full-segment vs partial flags),
 *  - the plate-convergence rate (MORVEL, DeMets et al. 2010),
 *  - the published interseismic-coupling prior (per-region geodesy
 *    literature, value + range + confidence),
 *  - published mean-recurrence estimates where they exist.
 *
 * Coupling itself stays a curated literature prior (there is no global
 * live coupling API); slip deficit and long-term gap become DERIVED.
 */

export interface StructuralInput {
  /** last full-segment great rupture year, null if none recorded */
  lastFullSegmentYear: number | null;
  /** any segment-scale M≥7.8 rupture year (partial releases count) */
  lastMajorRuptureYear: number | null;
  /** mean recurrence interval in years, null where unconstrained */
  recurrenceYears: number | null;
  /** plate convergence rate in mm/yr */
  convergenceMmYr: number;
  /** published coupling fraction 0..1 (mean of cited range) */
  coupling: number;
}

export interface StructuralScores {
  /** accumulated elastic slip deficit on the locked interface, meters */
  slipDeficitM: number | null;
  /** cycle maturity = elapsed / recurrence, 0..1, null without recurrence */
  maturity: number | null;
  slipDeficitScore: number | null;
  maturityScore: number | null;
  longTermQuiescenceScore: number | null;
  elapsedYears: number | null;
  /** inputs that were available (drives confidence + coverage) */
  knownInputs: string[];
}

/**
 * Slip deficit → score anchors. Empirical scaling relations
 * (Wells & Coppersmith 1994; earthquake slip ~ M8.0 ≈ 4–5 m,
 * M8.5 ≈ 8–10 m, M8.8–9.0 ≈ 15–20 m): 4 m → ~35, 10 m → ~78, ≥18 m → 100.
 */
export const DEFICIT_ANCHORS: Array<[meters: number, score: number]> = [
  [0, 0],
  [4, 35],
  [10, 78],
  [18, 100],
];

export function deficitToScore(deficitM: number): number {
  for (let i = 0; i < DEFICIT_ANCHORS.length - 1; i++) {
    const [x0, y0] = DEFICIT_ANCHORS[i];
    const [x1, y1] = DEFICIT_ANCHORS[i + 1];
    if (deficitM <= x1) return y0 + ((deficitM - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 100;
}

/** default recurrence used when unpublished: 300 a (documented fallback) */
export const DEFAULT_RECURRENCE_YEARS = 300;

export function deriveStructural(
  input: StructuralInput,
  now: number,
): StructuralScores {
  const yearNow = new Date(now).getUTCFullYear();
  const knownInputs: string[] = [];

  const elapsed =
    input.lastFullSegmentYear != null
      ? yearNow - input.lastFullSegmentYear
      : input.lastMajorRuptureYear != null
        ? yearNow - input.lastMajorRuptureYear
        : null;
  if (input.lastFullSegmentYear != null) knownInputs.push("full-segment-rupture-date");
  else if (input.lastMajorRuptureYear != null) knownInputs.push("partial-rupture-date-only");

  // slip deficit: convergence × coupling × elapsed since the last
  // full-segment release (partial ruptures release only part of the
  // margin — the deficit against the last FULL release is the
  // defensible upper-bound estimate and is documented as such)
  let slipDeficitM: number | null = null;
  if (elapsed != null && input.coupling > 0) {
    slipDeficitM =
      (input.convergenceMmYr / 1000) * elapsed * input.coupling;
    knownInputs.push("convergence", "coupling-prior");
  }

  const recurrence =
    input.recurrenceYears ?? (elapsed != null ? DEFAULT_RECURRENCE_YEARS : null);
  if (input.recurrenceYears != null) knownInputs.push("published-recurrence");

  const maturity =
    elapsed != null && recurrence != null
      ? clamp(elapsed / recurrence, 0, 1)
      : null;

  const slipDeficitScore = slipDeficitM != null ? deficitToScore(slipDeficitM) : null;
  // combined per spec: 0.6 deficit + 0.4 maturity; either alone lowers
  // confidence rather than being zero
  const maturityScore = maturity != null ? maturity * 100 : null;

  // long-term quiescence: duration of the great-rupture gap against the
  // segment's own recurrence scale (falls back to the documented 300 a
  // default when no estimate exists — with lower confidence downstream)
  const longTermQuiescenceScore =
    elapsed != null
      ? clamp(elapsed / (recurrence ?? DEFAULT_RECURRENCE_YEARS), 0, 1) * 100
      : null;

  return {
    slipDeficitM: slipDeficitM == null ? null : +slipDeficitM.toFixed(2),
    maturity,
    slipDeficitScore: slipDeficitScore == null ? null : Math.round(slipDeficitScore),
    maturityScore: maturityScore == null ? null : Math.round(maturityScore),
    longTermQuiescenceScore:
      longTermQuiescenceScore == null ? null : Math.round(longTermQuiescenceScore),
    elapsedYears: elapsed,
    knownInputs,
  };
}

/** Extract the structural inputs from a region profile. */
export function structuralInputsFromProfile(
  profile: RegionProfile,
): StructuralInput {
  const full = profile.greatRuptures?.filter((r) => r.fullSegment) ?? [];
  const major = profile.greatRuptures ?? [];
  return {
    lastFullSegmentYear: full.length ? Math.max(...full.map((r) => r.year)) : null,
    lastMajorRuptureYear: major.length ? Math.max(...major.map((r) => r.year)) : null,
    recurrenceYears: profile.recurrence?.years ?? null,
    convergenceMmYr: profile.convergence?.rateMmYr ?? 0,
    coupling: profile.couplingPrior?.value ?? 0,
  };
}

/**
 * Combined slip-deficit metric per the methodology (0.6 deficit +
 * 0.4 maturity), falling back to whichever input is available.
 */
export function combinedSlipDeficitScore(s: StructuralScores): number | null {
  if (s.slipDeficitScore == null && s.maturityScore == null) return null;
  if (s.maturityScore == null) return s.slipDeficitScore;
  if (s.slipDeficitScore == null) return s.maturityScore;
  return Math.round(0.6 * s.slipDeficitScore + 0.4 * s.maturityScore);
}
