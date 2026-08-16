import { getRegionProfiles } from "@/regions/profiles";
import { getDailyFeed, getRemoteCandidates } from "./adapters/usgs-earthquakes";
import { getPlateBoundaries } from "./adapters/usgs-plates";
import { getVolcanoDb } from "./adapters/gvp-volcanoes";
import { getEnso } from "./adapters/noaa-enso";
import { getRegionDynamicData } from "./region-data";
import { warmRegionGnssCache } from "./adapters/gnss";

/**
 * Background warmup: primes the adapter caches so first visits are fast.
 * Deliberately low concurrency — scientific APIs must not be hammered.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function warmBackground(): Promise<void> {
  try {
    await Promise.allSettled([
      getDailyFeed(),
      getRemoteCandidates(),
      getPlateBoundaries(),
      getVolcanoDb(),
      getEnso(),
    ]);
  } catch {
    // warming is best-effort
  }

  const profiles = getRegionProfiles();
  // featured region first, then the rest, two at a time
  const ordered = [
    ...profiles.filter((p) => p.featured),
    ...profiles.filter((p) => !p.featured),
  ];
  const queue = [...ordered];
  const worker = async () => {
    while (queue.length > 0) {
      const profile = queue.shift();
      if (!profile) break;
      try {
        await getRegionDynamicData(profile, undefined, {
          includeEnv: true,
        });
      } catch {
        // ignore — will retry on next request
      }
      await sleep(500);
    }
  };
  await Promise.all([worker(), worker()]);

  // GNSS series are the heaviest payloads — warm last, one region at a
  // time; this fills the caches the canonical scoring pass reads from
  for (const profile of ordered) {
    await warmRegionGnssCache(profile);
    await sleep(1000);
  }
}
