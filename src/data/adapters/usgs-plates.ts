import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { cachedFetch, type FetchResult } from "@/data/http";
import { getRegionProfiles } from "@/regions/profiles";

/**
 * USGS plate-boundary adapter (ArcGIS MapServer → GeoJSON).
 * Cached 7 days — geometry is effectively static.
 *
 * Convergent boundaries render prominently; divergent/transform subdued.
 */

const boundaryFeature = z.object({
  geometry: z.union([
    z.object({
      type: z.literal("LineString"),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
    }),
    z.object({
      type: z.literal("MultiLineString"),
      coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
    }),
  ]),
  properties: z.object({
    LABEL: z.string().catch("Other"),
  }),
});

const boundaryCollection = z.object({
  features: z.array(boundaryFeature),
});

export type BoundaryKind = "convergent" | "divergent" | "transform" | "other";

export interface Boundary {
  kind: BoundaryKind;
  /** segments as GeoJSON LineStrings */
  lines: number[][][];
}

function parseBoundaries(raw: unknown): Boundary[] {
  const data = boundaryCollection.parse(raw);
  return data.features.map((f) => ({
    kind: classify(f.properties.LABEL),
    lines:
      f.geometry.type === "LineString"
        ? [f.geometry.coordinates.map((c) => [...c])]
        : f.geometry.coordinates.map((l) => l.map((c) => [...c])),
  }));
}

function classify(label: string): BoundaryKind {
  const l = label.toLowerCase();
  if (l.includes("convergent")) return "convergent";
  if (l.includes("divergent")) return "divergent";
  if (l.includes("transform")) return "transform";
  return "other";
}

export function getPlateBoundaries(): Promise<FetchResult<Boundary[]>> {
  const url =
    "https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/0/query?where=1%3D1&outFields=*&f=geojson";
  return cachedFetch(url, parseBoundaries, {
    key: "usgs-plate-boundaries",
    ttlMs: 7 * 24 * 3_600_000,
    source: "USGS plate boundaries",
    timeoutMs: 20_000,
    fixture: () => {
      try {
        return JSON.parse(
          fs.readFileSync(
            path.join(process.cwd(), "fixtures/usgs/plate_boundaries.geojson"),
            "utf8",
          ),
        );
      } catch {
        // last resort: region trench axes as simplified convergent geometry
        const profiles = getRegionProfiles();
        return {
          features: profiles.map((p) => ({
            geometry: { type: "LineString", coordinates: p.trench },
            properties: { LABEL: "Convergent Boundary (simplified)" },
          })),
        };
      }
    },
  });
}
