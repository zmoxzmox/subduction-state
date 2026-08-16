import { describe, expect, it } from "vitest";
import {
  getRegionProfiles,
  getRegionsByMargin,
} from "@/regions/profiles";

describe("region profiles", () => {
  it("loads all 20 subduction regions", () => {
    expect(getRegionProfiles().length).toBe(20);
  });

  it("ships Central Peru / Lima as the reference profile (no featured star)", () => {
    const lima = getRegionProfiles().find((r) => r.slug === "central-peru-lima")!;
    expect(lima.couplingPolygon?.length).toBeGreaterThanOrEqual(4);
    expect(lima.couplingPrior?.value).toBe(0.9);
    expect(lima.couplingPrior?.confidence).toBeGreaterThan(0.5);
    // no region is flagged featured — regions are peers, not highlighted
    expect(getRegionProfiles().some((r) => r.featured)).toBe(false);
  });

  it("every region carries a sourced coupling prior (research-based, cited)", () => {
    for (const r of getRegionProfiles()) {
      const prior = r.couplingPrior;
      expect(prior, `${r.slug} must have a coupling prior`).toBeDefined();
      expect(prior!.sourceName.length, `${r.slug} source`).toBeGreaterThan(15);
      expect(prior!.sourceDate).toMatch(/^\d{4}(-\d{2}-\d{2})?$/);
      expect(prior!.confidence).toBeGreaterThan(0);
      expect(prior!.confidence).toBeLessThanOrEqual(1);
      expect(prior!.value).toBeGreaterThanOrEqual(0);
      expect(prior!.value).toBeLessThanOrEqual(1);
      // weakly-coupled margins get honest low values, not invented highs
      if (prior!.confidence < 0.4) {
        expect(prior!.note?.en, `${r.slug} low-confidence note`).toBeTruthy();
      }
    }
  });

  it("every region carries its public great-rupture history (or explicitly none)", () => {
    for (const r of getRegionProfiles()) {
      expect(Array.isArray(r.greatRuptures), `${r.slug} ruptures array`).toBe(true);
      for (const rup of r.greatRuptures ?? []) {
        // includes real historic catalog entries (e.g., 869 Jogan, 1700 Cascadia)
        expect(rup.year).toBeGreaterThan(500);
        expect(rup.year).toBeLessThanOrEqual(new Date().getUTCFullYear());
        expect(rup.mag).toBeGreaterThanOrEqual(6.5);
      }
      // regions claiming a long gap must have a full-segment event
      const hasFull = (r.greatRuptures ?? []).some((x) => x.fullSegment);
      if (!hasFull) expect(r.greatRuptures!.length).toBeLessThanOrEqual(3);
    }
  });

  it("published recurrence estimates cite their source", () => {
    for (const r of getRegionProfiles()) {
      if (r.recurrence) {
        expect(r.recurrence.years).toBeGreaterThan(20);
        expect(r.recurrence.source.length).toBeGreaterThan(10);
      }
    }
  });

  it("no region invents per-metric curated SCORES anymore (structural values are derived)", () => {
    // coupling is a prior; slip deficit and long-term gap are COMPUTED
    // from ruptures + convergence + coupling — never hand-set scores
    for (const r of getRegionProfiles()) {
      expect((r as unknown as { curated?: unknown }).curated, r.slug).toBeUndefined();
    }
  });

  it("every region has coherent geometry", () => {
    for (const r of getRegionProfiles()) {
      expect(r.trench.length, `${r.slug} trench`).toBeGreaterThanOrEqual(2);
      expect(r.polygon.length, `${r.slug} polygon`).toBeGreaterThanOrEqual(16);
      const [w, s, e, n] = r.bbox;
      expect(w).toBeLessThan(e);
      expect(s).toBeLessThan(n);
      expect(r.center[0]).toBeGreaterThanOrEqual(w);
      expect(r.center[0]).toBeLessThanOrEqual(e);
    }
  });

  it("groups margins for same-margin remote perturbation", () => {
    expect(getRegionsByMargin("nazca-southamerica").length).toBe(7);
    expect(getRegionsByMargin("australia-pacific").length).toBe(3);
  });
});
