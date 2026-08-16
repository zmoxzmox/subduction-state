import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { cachedFetch, type FetchResult } from "@/data/http";
import type { RegionProfile, Volcano } from "@/types";
import { distanceKm } from "@/lib/utils";
import { volcanoActivityState } from "@/scoring/volcanic";

/**
 * Smithsonian Global Volcanism Program adapter (VOTW WFS).
 * Loads Holocene volcanoes once (cached 24 h), filters per region at
 * 500 km. We never label a volcano "unrest" from this source — only
 * location, type and last-known eruption year.
 */

const volcanoFeature = z.object({
  properties: z.object({
    Volcano_Number: z.number(),
    Volcano_Name: z.string(),
    Country: z.string().catch("—"),
    Primary_Volcano_Type: z.string().catch("—"),
    Last_Eruption_Year: z.number().nullable().catch(null),
  }),
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number()]),
  }),
});

const volcanoCollection = z.object({
  features: z.array(volcanoFeature),
});

export type VolcanoDb = Volcano[];

function parseVolcanoes(raw: unknown): VolcanoDb {
  const data = volcanoCollection.parse(raw);
  const yearNow = new Date().getUTCFullYear();
  return data.features.map((f) => ({
    id: String(f.properties.Volcano_Number),
    name: f.properties.Volcano_Name,
    country: f.properties.Country,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    type: f.properties.Primary_Volcano_Type,
    lastEruptionYear: f.properties.Last_Eruption_Year,
    activityState: volcanoActivityState(f.properties.Last_Eruption_Year, yearNow),
  }));
}

const WFS_URL =
  "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=GVP-VOTW%3ASmithsonian_VOTW_Holocene_Volcanoes&count=2000&outputFormat=application/json&propertyNames=Volcano_Number,Volcano_Name,Country,Primary_Volcano_Type,Last_Eruption_Year,GeoLocation";

export function getVolcanoDb(): Promise<FetchResult<VolcanoDb>> {
  return cachedFetch(WFS_URL, parseVolcanoes, {
    key: "gvp-volcanoes",
    ttlMs: 24 * 3_600_000,
    source: "Smithsonian GVP volcanoes",
    timeoutMs: 30_000,
    fixture: () => {
      try {
        return JSON.parse(
          fs.readFileSync(
            path.join(process.cwd(), "fixtures/gvp/volcanoes.geojson"),
            "utf8",
          ),
        );
      } catch {
        return null;
      }
    },
  });
}

export async function getVolcanoesNear(
  profile: RegionProfile,
  radiusKm = 500,
): Promise<{ volcanoes: Volcano[] | null; mode: string }> {
  try {
    const res = await getVolcanoDb();
    const near = res.data
      .map((v) => ({
        ...v,
        distanceKm: Math.round(
          distanceKm(v.lon, v.lat, profile.center[0], profile.center[1]),
        ),
      }))
      .filter((v) => (v.distanceKm ?? Infinity) <= radiusKm)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    return { volcanoes: near, mode: res.mode };
  } catch {
    return { volcanoes: null, mode: "failed" };
  }
}
