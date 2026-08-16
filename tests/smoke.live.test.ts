/**
 * Live-pipeline smoke tests — run only when SMOKE=1 (they hit real
 * upstream services and can take a minute on a cold cache):
 *
 *   SMOKE=1 npx vitest run tests/smoke.live.test.ts
 */
import { describe, expect, it } from "vitest";

const run = !!process.env.SMOKE;
const d = run ? describe : describe.skip;

d("live data pipeline", () => {
  it("scores Central Peru / Lima end-to-end", async () => {
    const { getRegionProfiles } = await import("@/regions/profiles");
    const { getRegionDynamicData } = await import("@/data/region-data");
    const { computeRegionMetrics } = await import("@/scoring/region-scorer");
    const { aggregateScoredMetrics } = await import("@/scoring/score");

    const lima = getRegionProfiles().find((r) => r.slug === "central-peru-lima")!;
    const data = await getRegionDynamicData(lima);
    const { metrics, m5Count30d } = computeRegionMetrics(
      lima,
      data,
      (await import("@/scoring/config")).CANONICAL_CONFIG,
      Date.now(),
    );
    const summary = aggregateScoredMetrics(metrics);

    console.log("modes:", data.modes);
    console.log(
      "metrics:",
      metrics.map((m) => `${m.id}=${m.score ?? "null"}`).join(" "),
    );
    console.log(
      "summary:",
      JSON.stringify(
        {
          observed: summary.observed,
          coverage: summary.coverage,
          range: [summary.minFull, summary.maxFull],
          m5Count30d,
        },
      ),
    );

    expect(metrics.length).toBe(10);
    expect(summary.observed).not.toBeNull();
    expect(summary.observed!).toBeGreaterThan(0);
    expect(summary.observed!).toBeLessThanOrEqual(100);
    // curated metrics must be present with their priors
    const coupling = metrics.find((m) => m.id === "couplingAsperity")!;
    expect(coupling.score).toBe(95);
    expect(coupling.status).toBe("curated");
    // GNSS must be unknown-or-real, never faked
    const gnss = metrics.find((m) => m.id === "gnssTransient")!;
    if (gnss.score == null) {
      expect(gnss.status).toBe("missing");
    } else {
      expect(gnss.score).toBeGreaterThanOrEqual(0);
    }
  }, 180_000);

  it("fetches display feeds and map catalogs", async () => {
    const usgs = await import("@/data/adapters/usgs-earthquakes");
    const day = await usgs.getDailyFeed();
    expect(day.data.length).toBeGreaterThan(20);
    const m30 = await usgs.getMapCatalog30d();
    expect(m30.data.length).toBeGreaterThan(100);
    const remote = await usgs.getRemoteCandidates();
    expect(Array.isArray(remote.data)).toBe(true);
    console.log(
      `day=${day.data.length} m30=${m30.data.length} remote=${remote.data.length} modes=${day.mode}/${m30.mode}`,
    );
  }, 120_000);

  it("loads plate boundaries with kind classification", async () => {
    const { getPlateBoundaries } = await import("@/data/adapters/usgs-plates");
    const res = await getPlateBoundaries();
    const convergent = res.data.filter((b) => b.kind === "convergent");
    expect(convergent.length).toBeGreaterThan(10);
  }, 60_000);

  it("loads the volcano database", async () => {
    const { getVolcanoDb } = await import("@/data/adapters/gvp-volcanoes");
    const res = await getVolcanoDb();
    expect(res.data.length).toBeGreaterThan(1000);
  }, 60_000);

  it("reads ENSO state", async () => {
    const { getEnso } = await import("@/data/adapters/noaa-enso");
    const enso = await getEnso();
    expect(enso).not.toBeNull();
    expect(typeof enso!.latest.oni).toBe("number");
    console.log("ENSO:", JSON.stringify(enso!.latest));
  }, 60_000);
});
