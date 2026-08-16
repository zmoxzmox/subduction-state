import { z } from "zod";
import { cachedFetch, type FetchResult } from "@/data/http";
import { healthRegistry } from "@/data/health";

/**
 * GEM Global Active Faults Database (GAF-DB) adapter.
 *
 * The full GAF-DB GeoJSON is ~100 MB and CC-BY-SA — too large to bundle
 * or fetch at request time. The adapter therefore loads from a
 * URL provided via GEM_GAF_URL (see README) and reports honest
 * unavailability otherwise. Fault geometry is map CONTEXT only; it is
 * never used as a global hazard model (spec §50).
 */

const faultFeature = z.object({
  geometry: z.object({
    type: z.string(),
    coordinates: z.unknown(),
  }),
  properties: z.record(z.string(), z.unknown()),
});

const faultCollection = z.object({
  features: z.array(faultFeature),
});

export interface FaultLayer {
  geojson: object;
  featureCount: number;
}

export async function getGemFaults(): Promise<
  FetchResult<FaultLayer | null>
> {
  const url = process.env.GEM_GAF_URL;
  healthRegistry.ensure("GEM Global Active Faults");
  if (!url) {
    healthRegistry.record(
      "GEM Global Active Faults",
      "unknown",
      "unknown",
      "Not configured — set GEM_GAF_URL to a GAF-DB GeoJSON export (see README). Fault layer context only.",
    );
    return {
      data: null,
      mode: "unknown",
      fetchedAt: new Date().toISOString(),
      observedAt: null,
    };
  }
  return cachedFetch(
    url,
    (raw) => {
      const parsed = faultCollection.parse(raw);
      return { geojson: parsed as unknown as object, featureCount: parsed.features.length };
    },
    {
      key: "gem-faults",
      ttlMs: 7 * 24 * 3_600_000,
      source: "GEM Global Active Faults",
      timeoutMs: 60_000,
    },
  );
}
