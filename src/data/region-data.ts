import type { EnvSample, QuakeEvent, RegionProfile } from "@/types";
import type { RegionDynamicData } from "@/scoring/region-scorer";
import { decluster } from "@/scoring/decluster";
import { CANONICAL_CONFIG, type ResearchConfig } from "@/scoring/config";
import {
  getRegionCatalog,
  getRemoteCandidates,
} from "./adapters/usgs-earthquakes";
import { getVolcanoesNear } from "./adapters/gvp-volcanoes";
import { getSstSample } from "./adapters/noaa-sst";
import { getSshSample } from "./adapters/noaa-ssh";
import { getEnso } from "./adapters/noaa-enso";
import { getRegionGnss } from "./adapters/gnss";
import { getRegionProfiles } from "@/regions/profiles";

export interface RegionDataBundle extends RegionDynamicData {
  /** how each sub-source reached us */
  modes: {
    catalog: "live" | "cached" | "fixture" | "unknown" | "failed";
    volcanoes: string;
    env: "live" | "cached" | "fixture" | "missing";
    enso: "live" | "cached" | "fixture" | "missing";
    gnss: "live" | "cached" | "fixture" | "unavailable";
  };
}

export async function getRegionDynamicData(
  profile: RegionProfile,
  config: ResearchConfig = CANONICAL_CONFIG,
  opts: { includeGnss?: boolean; includeEnv?: boolean; envHistory?: boolean } = {},
): Promise<RegionDataBundle> {
  const includeGnss = opts.includeGnss ?? true;
  const includeEnv = opts.includeEnv ?? true;

  const [catalogRes, volcanoRes, ensoRes, remoteRes] = await Promise.all([
    getRegionCatalog(profile, config.thresholds.minMagnitude).catch(() => null),
    getVolcanoesNear(profile),
    getEnso(),
    getRemoteCandidates().catch(() => null),
  ]);

  const catalog: QuakeEvent[] | null = catalogRes
    ? decluster(catalogRes.data.events)
    : null;
  const baselineDays = catalogRes?.data.days ?? 0;
  const baselineTruncated = catalogRes?.data.truncated ?? false;
  const catalogMode: RegionDataBundle["modes"]["catalog"] = catalogRes
    ? catalogRes.mode
    : "failed";

  // environment: live first, clearly-labeled fixture fallback
  let envSample: EnvSample | null = null;
  let envMode: RegionDataBundle["modes"]["env"] = "missing";
  if (includeEnv) {
    const [sst, ssh] = await Promise.all([
      getSstSample(profile, { history: opts.envHistory ?? true }).catch(() => null),
      getSshSample(profile).catch(() => null),
    ]);
    if (sst || ssh) {
      envMode = "live";
      envSample = {
        sstAnomalyC: sst?.anomalyC ?? null,
        sstPercentile: sst?.percentile ?? null,
        sshAnomalyCm: ssh?.anomalyCm ?? null,
        observedAt: ssh?.observedAt ?? sst?.observedAt ?? null,
      };
    } else {
      const { getSstFixture } = await import("./adapters/noaa-sst");
      const { getSshFixture } = await import("./adapters/noaa-ssh");
      const fSst = getSstFixture(profile.slug);
      const fSsh = getSshFixture(profile.slug);
      if (fSst != null || fSsh != null) {
        envMode = "fixture";
        envSample = {
          sstAnomalyC: fSst?.anomalyC ?? null,
          sstPercentile: fSst?.percentile ?? null,
          sshAnomalyCm: fSsh ?? null,
          observedAt: null,
        };
      }
    }
  }

  const gnss = includeGnss
    ? await getRegionGnss(profile)
    : {
        stations: [] as never[],
        aggregate: {
          score: null, medianZ: null, topQuartileZ: null,
          stationCount: 0, anomalies: [], insufficientStations: true,
        },
        unavailable: true,
      };

  const marginTrenches = getRegionProfiles()
    .filter((r) => r.margin === profile.margin)
    .map((r) => r.trench as [number, number][]);

  return {
    catalog,
    baselineDays,
    baselineTruncated,
    volcanoes: volcanoRes.volcanoes,
    envSample,
    enso: ensoRes?.latest ?? null,
    gnssStations: gnss.stations,
    remoteEvents: remoteRes?.data ?? [],
    marginTrenches,
    modes: {
      catalog: catalogMode,
      volcanoes: volcanoRes.mode,
      env: envMode,
      enso: ensoRes ? "live" : "missing",
      gnss: gnss.unavailable ? "unavailable" : "live",
    },
  };
}
