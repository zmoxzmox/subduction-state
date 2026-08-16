import { describe, expect, it } from "vitest";
import {
  combinedSlipDeficitScore,
  DEFAULT_RECURRENCE_YEARS,
  deficitToScore,
  deriveStructural,
} from "@/scoring/structural";
import { getRegionProfiles, getFeaturedRegion } from "@/regions/profiles";
import { computeRegionMetrics } from "@/scoring/region-scorer";
import { CANONICAL_CONFIG } from "@/scoring/config";
import type { RegionDynamicData } from "@/scoring/region-scorer";

const NOW = Date.UTC(2026, 7, 16);

describe("structural derivation", () => {
  it("deficit anchors map per documented scaling", () => {
    expect(deficitToScore(0)).toBe(0);
    expect(deficitToScore(4)).toBeCloseTo(35, 5);
    expect(deficitToScore(10)).toBeCloseTo(78, 5);
    expect(deficitToScore(18)).toBe(100);
    expect(deficitToScore(50)).toBe(100);
  });

  it("Lima-like inputs: 1746 full rupture, 67 mm/yr, 0.9 coupling", () => {
    const s = deriveStructural(
      {
        lastFullSegmentYear: 1746,
        lastMajorRuptureYear: 2007,
        recurrenceYears: null,
        convergenceMmYr: 67,
        coupling: 0.9,
      },
      NOW,
    );
    // elapsed 280 a; deficit = 0.067 m/a × 280 a × 0.9 ≈ 16.9 m
    expect(s.elapsedYears).toBe(280);
    expect(s.slipDeficitM!).toBeCloseTo(16.88, 1);
    expect(s.maturity).toBeCloseTo(280 / DEFAULT_RECURRENCE_YEARS, 3);
    expect(s.longTermQuiescenceScore).toBe(93); // 280/300
    expect(s.knownInputs).toContain("full-segment-rupture-date");
  });

  it("partial ruptures do not reset the full-segment deficit", () => {
    const partialOnly = deriveStructural(
      {
        lastFullSegmentYear: null,
        lastMajorRuptureYear: 2014,
        recurrenceYears: 120,
        convergenceMmYr: 65,
        coupling: 0.85,
      },
      NOW,
    );
    expect(partialOnly.elapsedYears).toBe(12); // since the partial only
    expect(partialOnly.knownInputs).toContain("partial-rupture-date-only");
  });

  it("recent full rupture (Kamchatka 2025) yields a low deficit", () => {
    const s = deriveStructural(
      {
        lastFullSegmentYear: 2025,
        lastMajorRuptureYear: 2025,
        recurrenceYears: null,
        convergenceMmYr: 76,
        coupling: 0.4,
      },
      NOW,
    );
    expect(s.slipDeficitM!).toBeCloseTo(0.033, 2); // ~1.1 a × 0.076 m/a × 0.4
    expect(s.slipDeficitScore!).toBeLessThan(10);
    expect(s.longTermQuiescenceScore!).toBeLessThan(5);
  });

  it("Cascadia-like inputs: 1700 full rupture, 500 a recurrence", () => {
    const s = deriveStructural(
      {
        lastFullSegmentYear: 1700,
        lastMajorRuptureYear: 1700,
        recurrenceYears: 500,
        convergenceMmYr: 36,
        coupling: 0.95,
      },
      NOW,
    );
    expect(s.maturity).toBeCloseTo(326 / 500, 3);
    expect(s.longTermQuiescenceScore).toBe(65);
    expect(s.slipDeficitM!).toBeCloseTo(11.14, 1);
  });

  it("no rupture history → structural metrics null (never guessed)", () => {
    const s = deriveStructural(
      {
        lastFullSegmentYear: null,
        lastMajorRuptureYear: null,
        recurrenceYears: null,
        convergenceMmYr: 80,
        coupling: 0.45,
      },
      NOW,
    );
    expect(s.slipDeficitM).toBeNull();
    expect(s.slipDeficitScore).toBeNull();
    expect(s.longTermQuiescenceScore).toBeNull();
    expect(combinedSlipDeficitScore(s)).toBeNull();
  });

  it("combined score = 0.6 deficit + 0.4 maturity", () => {
    expect(
      combinedSlipDeficitScore({
        slipDeficitM: null,
        maturity: null,
        slipDeficitScore: 80,
        maturityScore: 60,
        longTermQuiescenceScore: 60,
        elapsedYears: 100,
        knownInputs: [],
      }),
    ).toBe(72);
    // maturity-only fallback
    expect(
      combinedSlipDeficitScore({
        slipDeficitM: null,
        maturity: null,
        slipDeficitScore: null,
        maturityScore: 60,
        longTermQuiescenceScore: 60,
        elapsedYears: 100,
        knownInputs: [],
      }),
    ).toBe(60);
  });
});

describe("structural metrics end-to-end for every profile", () => {
  const emptyData: RegionDynamicData = {
    catalog: null,
    baselineDays: 0,
    baselineTruncated: false,
    volcanoes: null,
    envSample: null,
    enso: null,
    gnssStations: null,
    remoteEvents: [],
  };

  it("coupling metric exists for all 20 regions (scored from the prior)", () => {
    for (const profile of getRegionProfiles()) {
      const { metrics } = computeRegionMetrics(profile, emptyData, CANONICAL_CONFIG, NOW);
      const coupling = metrics.find((m) => m.id === "couplingAsperity")!;
      expect(coupling.score, profile.slug).not.toBeNull();
      expect(coupling.status).toBe("curated");
      expect(coupling.evidence[0].sourceName.length, profile.slug).toBeGreaterThan(15);
    }
  });

  it("regions with rupture history derive slip deficit and gap (status: derived)", () => {
    for (const profile of getRegionProfiles()) {
      if (profile.greatRuptures?.length) continue;
      // Philippines: no recorded great ruptures → honestly missing
      const { metrics } = computeRegionMetrics(profile, emptyData, CANONICAL_CONFIG, NOW);
      expect(
        metrics.find((m) => m.id === "slipDeficitMaturity")!.score,
        profile.slug,
      ).toBeNull();
    }
    const withHistory = getRegionProfiles().filter((p) => p.greatRuptures?.length);
    expect(withHistory.length).toBe(19);
    for (const profile of withHistory) {
      const { metrics } = computeRegionMetrics(profile, emptyData, CANONICAL_CONFIG, NOW);
      const slip = metrics.find((m) => m.id === "slipDeficitMaturity")!;
      expect(slip.score, profile.slug).not.toBeNull();
      expect(slip.status).toBe("derived");
      expect(metrics.find((m) => m.id === "longTermQuiescence")!.score, profile.slug).not.toBeNull();
    }
  });

  it("Lima keeps a strong structural loading profile under the derived model", () => {
    const { metrics } = computeRegionMetrics(
      getFeaturedRegion(),
      emptyData,
      CANONICAL_CONFIG,
      NOW,
    );
    const byId = Object.fromEntries(metrics.map((m) => [m.id, m.score]));
    expect(byId.couplingAsperity).toBe(90); // 0.9 prior
    expect(byId.slipDeficitMaturity!).toBeGreaterThan(70); // ~17 m deficit since 1746
    expect(byId.longTermQuiescence!).toBeGreaterThan(80); // 280 a / 300 a fallback
  });
});
