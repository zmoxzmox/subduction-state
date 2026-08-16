import { describe, expect, it } from "vitest";
import {
  getFeaturedRegion,
  getRegionProfile,
  getRegionProfiles,
  getRegionsByMargin,
} from "@/regions/profiles";

describe("region profiles", () => {
  it("loads all 20 subduction regions", () => {
    expect(getRegionProfiles().length).toBe(20);
  });

  it("ships Central Peru / Lima as the featured fully-configured profile", () => {
    const lima = getFeaturedRegion();
    expect(lima.slug).toBe("central-peru-lima");
    expect(lima.curated?.couplingAsperity?.score).toBe(95);
    expect(lima.curated?.slipDeficitMaturity?.score).toBe(85);
    expect(lima.curated?.longTermQuiescence?.score).toBe(90);
    // every curated value carries provenance
    for (const m of Object.values(lima.curated!)) {
      expect(m.sourceName.length).toBeGreaterThan(5);
      expect(m.sourceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.confidence).toBeGreaterThan(0);
      expect(m.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.methodology.en.length).toBeGreaterThan(20);
      expect(m.methodology.es.length).toBeGreaterThan(20);
    }
    expect(lima.couplingPolygon?.length).toBeGreaterThanOrEqual(4);
  });

  it("no other region invents curated structural scores", () => {
    for (const r of getRegionProfiles()) {
      if (r.slug === "central-peru-lima") continue;
      expect(r.curated, `${r.slug} must not invent curated scores`).toBeUndefined();
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
