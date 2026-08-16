/**
 * Experimental secondary metric — Gutenberg–Richter b-value.
 *
 * ZERO canonical weight in V0.1. Displayed only when statistically
 * supportable. Never presented as a validated precursor.
 */

export interface BValueResult {
  b: number | null;
  a: number | null;
  completenessMagnitude: number | null;
  eventCount: number;
  sigma: number | null;
  displayable: boolean;
}

export const MIN_EVENTS_FOR_B = 30;

/** Maximum-likelihood b-value (Aki 1965) with Shi–Bolt uncertainty. */
export function computeBValue(mags: number[]): BValueResult {
  if (mags.length < MIN_EVENTS_FOR_B) {
    return {
      b: null,
      a: null,
      completenessMagnitude: null,
      eventCount: mags.length,
      sigma: null,
      displayable: false,
    };
  }
  // completeness magnitude: smallest bin holding ≥ 90% of the expected
  // count given the slope estimated from M ≥ 4.5 (simple heuristic)
  const sorted = [...mags].sort((a, b) => a - b);
  const mc = estimateCompleteness(sorted);
  const used = sorted.filter((m) => m >= mc);
  if (used.length < MIN_EVENTS_FOR_B * 0.6) {
    return {
      b: null,
      a: null,
      completenessMagnitude: mc,
      eventCount: mags.length,
      sigma: null,
      displayable: false,
    };
  }
  const meanMag = used.reduce((s, m) => s + m, 0) / used.length;
  const b = Math.log10(Math.E) / (meanMag - (mc - 0.05));
  if (!Number.isFinite(b) || b <= 0) {
    return { b: null, a: null, completenessMagnitude: mc, eventCount: mags.length, sigma: null, displayable: false };
  }
  // Shi & Bolt (1982) sigma
  const dm2 =
    used.reduce((s, m) => s + (m - meanMag) ** 2, 0) / (used.length - 1);
  const sigma =
    Math.log10(Math.E) *
    Math.sqrt(dm2 / (used.length * (meanMag - (mc - 0.05)) ** 2));
  const a = Math.log10(used.length) + b * mc;
  return {
    b,
    a,
    completenessMagnitude: mc,
    eventCount: mags.length,
    sigma,
    displayable: true,
  };
}

function estimateCompleteness(sortedMags: number[]): number {
  // good-enough-for-prototype: the magnitude bin from which the
  // cumulative count keeps growing by ≥ 80% per 0.5-mag step downward
  for (let mc = 4.0; mc <= 6.0; mc += 0.5) {
    const above = sortedMags.filter((m) => m >= mc).length;
    const below = sortedMags.filter((m) => m >= mc - 0.5).length;
    if (below > 0 && above / below >= 0.8) return mc;
  }
  return 4.5;
}
