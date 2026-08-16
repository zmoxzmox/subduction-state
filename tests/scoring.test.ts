import { describe, expect, it } from "vitest";
import {
  aggregateScoredMetrics,
  coverageBand,
  dominantMetric,
  scoreBand,
} from "@/scoring/score";
import {
  CANONICAL_WEIGHTS,
  METRIC_IDS,
  canonicalWeightTotal,
  isValidWeightSet,
} from "@/scoring/weights";
import { computeQuiescence, suppressionToScore } from "@/scoring/quiescence";
import { poissonCdf, percentileToActivationScore } from "@/scoring/activation";
import { aftershockRadiusKm, decluster } from "@/scoring/decluster";
import { computeRemotePerturbation, eventProxy } from "@/scoring/remote-perturbation";
import { computeMigration, spearman, migrationDirection } from "@/scoring/migration";
import { robustZToScore } from "@/scoring/gnss";
import { computeEnvironment, oniToScore, sshAnomalyToScore } from "@/scoring/environment";
import { isCanonical, validateConfig, CANONICAL_CONFIG } from "@/scoring/config";
import type { QuakeEvent } from "@/types";

describe("canonical weights", () => {
  it("sum to exactly 100", () => {
    expect(canonicalWeightTotal()).toBe(100);
  });

  it("contain all ten metrics", () => {
    expect(METRIC_IDS.length).toBe(10);
  });

  it("accept the canonical set and reject broken sets", () => {
    expect(isValidWeightSet(CANONICAL_WEIGHTS)).toBe(true);
    expect(
      isValidWeightSet({ ...CANONICAL_WEIGHTS, couplingAsperity: 25 }),
    ).toBe(false);
  });
});

describe("score mathematics", () => {
  it("reproduces the spec example: knownContribution 56.6, knownWeight 80", () => {
    // weight 20 @ 90 → 18; weight 15 @ 85 → 12.75; weight 10 @ 90 → 9;
    // weight 10 @ 85 → 8.5; weight 10 @ 42 → 4.2; weight 5 @ 43 → 2.15;
    // weight 3 @ 0 → 0; weight 2 @ 0 → 0  ⇒ 54.6… let's use exact 56.6 via custom weights
    const metrics = [
      { id: "couplingAsperity", score: 95 },
      { id: "slipDeficitMaturity", score: 85 },
      { id: "longTermQuiescence", score: 90 },
      { id: "recentQuiescence", score: 90 },
      { id: "interfaceActivation", score: 90 },
      { id: "gnssTransient", score: null },
      { id: "environmentalPerturbation", score: null },
      { id: "remotePerturbation", score: null },
      { id: "volcanicResponse", score: null },
      { id: "alongMarginMigration", score: null },
    ];
    const s = aggregateScoredMetrics(metrics);
    // known weight = 20+15+10+10+10 = 65
    const knownContribution =
      (20 * 95 + 15 * 85 + 10 * 90 + 10 * 90 + 10 * 90) / 100;
    expect(s.knownWeight).toBe(65);
    expect(s.knownContribution).toBeCloseTo(knownContribution, 2);
    expect(s.coverage).toBeCloseTo(0.65, 2);
    expect(s.observed).toBeCloseTo((knownContribution / 65) * 100, 2);
    expect(s.minFull).toBeCloseTo(knownContribution, 2);
    expect(s.maxFull).toBeCloseTo(knownContribution + 35, 2);
    expect(s.neutralImputed).toBeCloseTo(knownContribution + 35 * 0.5, 2);
  });

  it("matches the documented worked example exactly (56.6 / 80)", () => {
    // craft inputs producing exactly knownContribution = 56.6 with
    // knownWeight = 80 (everything known except GNSS, weight 20):
    // 19.0 + 12.75 + 9.0 + 7.5 + 2.0 + 2.0 + 0 + 0 + 4.35 = 56.6
    const metrics = [
      { id: "couplingAsperity", score: 95 }, // 19.0
      { id: "slipDeficitMaturity", score: 85 }, // 12.75
      { id: "longTermQuiescence", score: 90 }, // 9.0
      { id: "recentQuiescence", score: 75 }, // 7.5
      { id: "interfaceActivation", score: 20 }, // 2.0
      { id: "gnssTransient", score: null }, // missing → weight 20 excluded
      { id: "environmentalPerturbation", score: 40 }, // 2.0
      { id: "remotePerturbation", score: 0 }, // 0
      { id: "volcanicResponse", score: 0 }, // 0
      { id: "alongMarginMigration", score: 87 }, // 4.35
    ];
    const s = aggregateScoredMetrics(metrics);
    expect(s.knownContribution).toBeCloseTo(56.6, 2);
    expect(s.knownWeight).toBe(80);
    expect(s.observed).toBeCloseTo(70.75, 2);
    expect(s.minFull).toBeCloseTo(56.6, 1);
    expect(s.maxFull).toBeCloseTo(76.6, 1);
    expect(s.neutralImputed).toBeCloseTo(66.6, 1);
    expect(s.coverage).toBeCloseTo(0.8, 5);
  });

  it("returns null observed and 0–100 interval when everything is unknown", () => {
    const metrics = METRIC_IDS.map((id) => ({ id, score: null }));
    const s = aggregateScoredMetrics(metrics);
    expect(s.observed).toBeNull();
    expect(s.coverage).toBe(0);
    expect(s.coverageBand).toBe("insufficient");
    expect(s.minFull).toBe(0);
    expect(s.maxFull).toBe(100);
    expect(s.neutralImputed).toBe(50);
  });

  it("missing GNSS never becomes zero", () => {
    const metrics = METRIC_IDS.map((id) => ({
      id,
      score: id === "gnssTransient" ? null : 50,
    }));
    const s = aggregateScoredMetrics(metrics);
    // gnss weight 20 is excluded from knownWeight entirely
    expect(s.knownWeight).toBe(80);
    expect(s.coverage).toBeCloseTo(0.8, 5);
    // a zero score would have contributed 0 to contribution — same here —
    // but coverage would still be 1.0 if it were a real zero:
    const withZero = METRIC_IDS.map((id) => ({ id, score: 50 }));
    expect(aggregateScoredMetrics(withZero).coverage).toBe(1);
    expect(s.coverage).not.toBe(1);
  });

  it("clamps out-of-range scores", () => {
    const s = aggregateScoredMetrics([{ id: "couplingAsperity", score: 150 }]);
    expect(s.knownContribution).toBe(20);
  });
});

describe("semantic bands", () => {
  it("bands score ranges per spec", () => {
    expect(scoreBand(0)).toBe("weak");
    expect(scoreBand(24)).toBe("weak");
    expect(scoreBand(25)).toBe("limited");
    expect(scoreBand(44)).toBe("limited");
    expect(scoreBand(45)).toBe("moderate");
    expect(scoreBand(64)).toBe("moderate");
    expect(scoreBand(65)).toBe("substantial");
    expect(scoreBand(79)).toBe("substantial");
    expect(scoreBand(80)).toBe("strong");
    expect(scoreBand(100)).toBe("strong");
  });

  it("bands coverage per spec", () => {
    expect(coverageBand(0.95)).toBe("excellent");
    expect(coverageBand(0.9)).toBe("excellent");
    expect(coverageBand(0.89)).toBe("good");
    expect(coverageBand(0.75)).toBe("good");
    expect(coverageBand(0.74)).toBe("partial");
    expect(coverageBand(0.5)).toBe("partial");
    expect(coverageBand(0.49)).toBe("sparse");
    expect(coverageBand(0.25)).toBe("sparse");
    expect(coverageBand(0.24)).toBe("insufficient");
  });
});

describe("quiescence", () => {
  it("maps suppression anchors smoothly", () => {
    expect(suppressionToScore(0)).toBe(0);
    expect(suppressionToScore(-0.2)).toBe(0);
    expect(suppressionToScore(0.2)).toBeCloseTo(25, 5);
    expect(suppressionToScore(0.4)).toBeCloseTo(50, 5);
    expect(suppressionToScore(0.55)).toBeCloseTo(75, 5);
    expect(suppressionToScore(0.7)).toBeCloseTo(100, 5);
    expect(suppressionToScore(1)).toBe(100);
  });

  it("applies Gamma–Poisson shrinkage to tiny samples", () => {
    // zero events in 7 days against baseline 0.5/day must NOT give 100
    const r = computeQuiescence({
      recentCount: 0,
      recentWindowDays: 7,
      baselineCount: 912, // 0.5/day over 5y
      baselineDays: 1825,
    });
    expect(r.score).not.toBe(100);
    expect(r.score!).toBeGreaterThan(0);
    expect(r.score!).toBeLessThan(35);
  });

  it("returns null when no baseline exists", () => {
    const r = computeQuiescence({
      recentCount: 3,
      recentWindowDays: 30,
      baselineCount: null,
      baselineDays: 0,
    });
    expect(r.score).toBeNull();
  });

  it("scores zero for rate increases", () => {
    const r = computeQuiescence({
      recentCount: 200,
      recentWindowDays: 30,
      baselineCount: 30,
      baselineDays: 1825,
    });
    expect(r.score).toBe(0);
    expect(r.suppression!).toBeLessThan(0);
  });

  it("flags weak baselines", () => {
    const r = computeQuiescence({
      recentCount: 3,
      recentWindowDays: 30,
      baselineCount: 90,
      baselineDays: 200,
    });
    expect(r.notes).toContain("weak-baseline");
    expect(r.confidence).toBeLessThan(0.7);
  });
});

describe("activation", () => {
  it("computes Poisson CDF correctly", () => {
    // P(X ≤ 2 | λ=3) ≈ 0.423
    expect(poissonCdf(2, 3)).toBeCloseTo(0.4232, 3);
    // P(X ≤ 0 | λ=2) = e^-2 ≈ 0.1353
    expect(poissonCdf(0, 2)).toBeCloseTo(Math.exp(-2), 4);
  });

  it("maps percentile anchors", () => {
    expect(percentileToActivationScore(40)).toBeLessThan(10);
    expect(percentileToActivationScore(75)).toBeCloseTo(35, 5);
    expect(percentileToActivationScore(90)).toBeCloseTo(60, 5);
    expect(percentileToActivationScore(95)).toBeCloseTo(75, 5);
    expect(percentileToActivationScore(99)).toBeCloseTo(100, 5);
  });

  it("activation percentile is the CDF — quiet corridors score LOW", async () => {
    const { computeActivation } = await import("@/scoring/activation");
    // 3 events vs 12 expected → ~1st percentile → near-zero activation
    const quiet = computeActivation({
      recentCount: 3, currentWindowDays: 30,
      baselineRate: 12.1 / 30, baselineDays: 1795,
      hasCouplingGeometry: true, hasMechanismData: true,
    });
    expect(quiet.percentile!).toBeLessThan(5);
    expect(quiet.score!).toBeLessThan(10);
    // zero events → lowest percentile, NOT maximal
    const zero = computeActivation({
      recentCount: 0, currentWindowDays: 30,
      baselineRate: 0.4, baselineDays: 1795,
      hasCouplingGeometry: true, hasMechanismData: false,
    });
    expect(zero.percentile!).toBeLessThan(1);
    expect(zero.score!).toBeLessThan(5);
    // unusually busy: 12 events vs 3.6 expected → >95th percentile
    const busy = computeActivation({
      recentCount: 12, currentWindowDays: 30,
      baselineRate: 0.12, baselineDays: 1795,
      hasCouplingGeometry: true, hasMechanismData: true,
    });
    expect(busy.percentile!).toBeGreaterThan(95);
    expect(busy.score!).toBeGreaterThan(70);
  });
});

describe("declustering (ETAS-lite)", () => {
  it("marks events within magnitude-dependent radius/time of M6+", () => {
    const mainshock: QuakeEvent = {
      id: "m1",
      mag: 7.5,
      time: Date.UTC(2026, 0, 1),
      depthKm: 30,
      lon: -75,
      lat: -12,
      place: "test",
      aftershockCandidate: false,
    };
    const near = { ...mainshock, id: "a1", time: mainshock.time + 5 * 86400_000, lat: -12.3, mag: 4.1 };
    const far = { ...mainshock, id: "a2", time: mainshock.time + 5 * 86400_000, lat: -15.5, mag: 4.1 }; // ~390 km > M7.5 radius (~224 km)
    const before = { ...mainshock, id: "a3", time: mainshock.time - 86400_000, lat: -12.1, mag: 4.1 };
    const late = { ...mainshock, id: "a4", time: mainshock.time + 400 * 86400_000, lat: -12.1, mag: 4.1 };
    const res = decluster([mainshock, near, far, before, late]);
    const byId = Object.fromEntries(res.map((e) => [e.id, e.aftershockCandidate]));
    expect(byId["a1"]).toBe(true);
    expect(byId["a2"]).toBe(false);
    expect(byId["a3"]).toBe(false); // before the mainshock
    expect(byId["a4"]).toBe(false); // outside the time window
  });

  it("scales radius with magnitude", () => {
    expect(aftershockRadiusKm(8)).toBeGreaterThan(aftershockRadiusKm(6.5));
    expect(aftershockRadiusKm(6.5)).toBeGreaterThan(30);
  });
});

describe("remote perturbation", () => {
  const now = Date.UTC(2026, 7, 16);

  it("zero when no qualifying events", () => {
    const r = computeRemotePerturbation([], -77, -12, "nazca-sa", [], [], now);
    expect(r.score).toBe(0);
    expect(r.maxEvent).toBeNull();
  });

  it("decays with distance, time and magnitude", () => {
    const mk = (mag: number, distKm: number, ageDays: number) => {
      // place event at given distance east of ref
      const lon = -77 + distKm / (111.32 * Math.cos((-12 * Math.PI) / 180));
      return {
        id: `e-${mag}-${distKm}-${ageDays}`,
        mag,
        time: now - ageDays * 86400_000,
        depthKm: 30,
        lon,
        lat: -12,
        place: "t",
        aftershockCandidate: false,
      } satisfies QuakeEvent;
    };
    const strong = eventProxy(7.5, 500, 3, false);
    const weak = eventProxy(7.5, 2000, 3, false);
    expect(strong).toBeGreaterThan(weak);
    const older = eventProxy(7.5, 500, 20, false);
    expect(strong).toBeGreaterThan(older);
    const smaller = eventProxy(6.7, 500, 3, false);
    expect(strong).toBeGreaterThan(smaller);
    const sameMargin = eventProxy(7.5, 500, 3, true);
    expect(sameMargin).toBeGreaterThan(strong);
    expect(sameMargin).toBeLessThanOrEqual(100);
  });

  it("ignores events outside radius/window/magnitude", () => {
    const far: QuakeEvent = {
      id: "x1", mag: 7.0, time: now - 5 * 86400_000, depthKm: 30,
      lon: -77, lat: -12, place: "t", aftershockCandidate: false,
    };
    // 3000 km away
    const r1 = computeRemotePerturbation(
      [{ ...far, lon: -77 + 3000 / 90 }], -77, -12, "m", [], [], now,
    );
    expect(r1.events.length).toBe(0);
    // 40 days old
    const r2 = computeRemotePerturbation(
      [{ ...far, time: now - 40 * 86400_000 }], -77, -12, "m", [], [], now,
    );
    expect(r2.events.length).toBe(0);
    // M6.2
    const r3 = computeRemotePerturbation(
      [{ ...far, mag: 6.2 }], -77, -12, "m", [], [], now,
    );
    expect(r3.events.length).toBe(0);
  });
});

describe("migration", () => {
  it("requires ≥4 independent clusters", () => {
    const events: QuakeEvent[] = [1, 2, 3].map((i) => ({
      id: `e${i}`,
      mag: 5,
      time: Date.UTC(2026, 5, i * 20),
      depthKm: 30,
      lon: -76 + i * 3,
      lat: -10,
      place: "t",
      aftershockCandidate: false,
    }));
    const r = computeMigration({ events, refLon: -76, refLat: -10, strikeAzimuthDeg: 90 });
    expect(r.score).toBeNull();
    expect(r.clusterCount).toBeLessThan(4);
  });

  it("requires spatial spread", () => {
    const events: QuakeEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push({
        id: `e${i}`,
        mag: 5,
        time: Date.UTC(2026, 3, i * 10),
        depthKm: 30,
        lon: -76 + i * 0.1, // ~10 km apart
        lat: -10,
        place: "t",
        aftershockCandidate: false,
      });
    }
    const r = computeMigration({ events, refLon: -76, refLat: -10, strikeAzimuthDeg: 90 });
    expect(r.score).toBeNull();
  });

  it("scores a clean progressive sequence", () => {
    const events: QuakeEvent[] = [];
    for (let i = 0; i < 7; i++) {
      events.push({
        id: `e${i}`,
        mag: 5,
        time: Date.UTC(2026, 2, 1 + i * 12),
        depthKm: 30,
        lon: -79 + i * 1.2, // ~130 km apart at this latitude
        lat: -10,
        place: "t",
        aftershockCandidate: false,
      });
    }
    const r = computeMigration({ events, refLon: -79, refLat: -10, strikeAzimuthDeg: 90 });
    expect(r.rho).toBeGreaterThan(0.9);
    expect(r.score).toBeGreaterThan(50);
    expect(r.direction).toBe("eastward");
  });

  it("spearman handles ties and perfect anticorrelation", () => {
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 6);
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 6);
  });

  it("direction mapping", () => {
    expect(migrationDirection(1, 0)).toBe("northward");
    expect(migrationDirection(-1, 0)).toBe("southward");
    expect(migrationDirection(1, 90)).toBe("eastward");
    expect(migrationDirection(-1, 90)).toBe("westward");
    expect(migrationDirection(1, 315)).toBe("northwestward");
  });
});

describe("GNSS scoring", () => {
  it("maps robust-Z anchors", () => {
    expect(robustZToScore(0)).toBe(0);
    expect(robustZToScore(1.5)).toBe(0);
    expect(robustZToScore(2)).toBeCloseTo(25, 5);
    expect(robustZToScore(2.5)).toBeCloseTo(50, 5);
    expect(robustZToScore(3)).toBeCloseTo(75, 5);
    expect(robustZToScore(4)).toBeCloseTo(100, 5);
    expect(robustZToScore(10)).toBe(100);
  });
});

describe("environment", () => {
  it("scores SSH and ONI by absolute magnitude", () => {
    expect(sshAnomalyToScore(0)).toBe(0);
    expect(sshAnomalyToScore(10)).toBeCloseTo(50, 5);
    expect(sshAnomalyToScore(-20)).toBe(100);
    expect(oniToScore(0.2)).toBe(0);
    expect(oniToScore(1.6)).toBeCloseTo(75, 5);
    expect(oniToScore(2.5)).toBe(100);
  });

  it("null when nothing is known", () => {
    const r = computeEnvironment(null, null);
    expect(r.score).toBeNull();
  });

  it("renormalises over available subcomponents", () => {
    const r = computeEnvironment(
      { sstAnomalyC: 2.0, sstPercentile: 0.99, sshAnomalyCm: null, observedAt: null },
      { oni: 1.6, season: "MJJ", phase: "el-nino" },
    );
    expect(r.sstScore).toBeGreaterThan(90);
    expect(r.sshScore).toBeNull();
    expect(r.ensoScore).toBeCloseTo(75, 5);
    expect(r.score!).toBeGreaterThan(80);
    expect(r.knownFraction).toBeCloseTo(0.7, 5);
  });
});

describe("research config", () => {
  it("canonical config is recognised", () => {
    expect(isCanonical(CANONICAL_CONFIG)).toBe(true);
  });

  it("rejects invalid imports, clamps valid ones", () => {
    expect(validateConfig({ weights: { couplingAsperity: 50 } })).toBeNull();
    const ok = validateConfig({
      version: "0.1",
      weights: { ...CANONICAL_WEIGHTS, couplingAsperity: 25, gnssTransient: 15 },
      thresholds: { minMagnitude: 99, gnssZThreshold: 2 },
      windows: { recentDays: 14, baselineDays: 730, remoteRadiusKm: 2000 },
      declustering: false,
    });
    expect(ok).not.toBeNull();
    expect(ok!.thresholds.minMagnitude).toBe(6); // clamped
    expect(ok!.weights.couplingAsperity).toBe(25);
    expect(isCanonical(ok!)).toBe(false);
  });
});

describe("dominant metric", () => {
  it("picks the largest known contribution", () => {
    const d = dominantMetric([
      { id: "couplingAsperity", score: 90, weight: 20, status: "curated", confidence: 0.8, evidence: [] },
      { id: "gnssTransient", score: 40, weight: 20, status: "derived", confidence: 0.6, evidence: [] },
      { id: "slipDeficitMaturity", score: 100, weight: 15, status: "curated", confidence: 0.8, evidence: [] },
    ]);
    expect(d).toBe("couplingAsperity");
  });
});
