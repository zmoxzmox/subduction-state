import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { RegionProfile } from "@/types";
import { circleRing } from "@/lib/geo";

/**
 * Region profiles are curated build-time data (spec §7): geometry,
 * plate pairs, convergence context and — only where peer-reviewed
 * evidence exists — curated structural priors. Everything else is
 * dynamic and computed from live data.
 */

const couplingPriorSchema = z.object({
  value: z.number().min(0).max(1),
  range: z.tuple([z.number(), z.number()]).optional(),
  sourceName: z.string(),
  sourceUrl: z.string().optional(),
  sourceDate: z.string(),
  confidence: z.number().min(0).max(1),
  note: z
    .object({ en: z.string().optional(), es: z.string().optional() })
    .optional(),
});

const greatRuptureSchema = z.object({
  year: z.number().int(),
  mag: z.number().min(4).max(10),
  fullSegment: z.boolean().optional(),
  label: z.string().optional(),
});

const regionFileSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.object({ en: z.string(), es: z.string() }),
  platePair: z.object({ en: z.string(), es: z.string() }),
  margin: z.string(),
  center: z.tuple([z.number(), z.number()]),
  radiusKm: z.number().min(100).max(800),
  trench: z.array(z.tuple([z.number(), z.number()])).min(2),
  strikeAzimuthDeg: z.number().min(0).max(360),
  convergence: z
    .object({
      rateMmYr: z.number().positive(),
      azimuthDeg: z.number(),
      source: z.string(),
    })
    .nullable()
    .optional(),
  couplingPrior: couplingPriorSchema.optional(),
  greatRuptures: z.array(greatRuptureSchema).optional(),
  recurrence: z
    .object({ years: z.number().positive(), source: z.string() })
    .optional(),
  envSamplePoint: z.tuple([z.number(), z.number()]),
  featured: z.boolean().optional(),
  context: z.object({ en: z.string(), es: z.string() }).optional(),
  couplingPolygon: z.array(z.tuple([z.number(), z.number()])).optional(),
});

function loadProfiles(): RegionProfile[] {
  const dir = path.join(process.cwd(), "data", "regions");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const profiles: RegionProfile[] = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const parsed = regionFileSchema.parse(raw);
    const polygon = circleRing(
      parsed.center[0],
      parsed.center[1],
      parsed.radiusKm,
    );
    const lons = polygon.map((p) => p[0]);
    const lats = polygon.map((p) => p[1]);
    profiles.push({
      id: parsed.id,
      slug: parsed.slug,
      name: parsed.name,
      platePair: parsed.platePair,
      marginType: "subduction" as const,
      margin: parsed.margin,
      center: parsed.center,
      bbox: [
        Math.min(...lons),
        Math.min(...lats),
        Math.max(...lons),
        Math.max(...lats),
      ],
      radiusKm: parsed.radiusKm,
      polygon,
      trench: parsed.trench,
      couplingPolygon: parsed.couplingPolygon,
      strikeAzimuthDeg: parsed.strikeAzimuthDeg,
      convergence: parsed.convergence ?? null,
      couplingPrior: parsed.couplingPrior,
      greatRuptures: parsed.greatRuptures,
      recurrence: parsed.recurrence,
      envSamplePoint: parsed.envSamplePoint,
      featured: parsed.featured,
      context: parsed.context,
    });
  }
  return profiles.sort((a, b) => a.slug.localeCompare(b.slug));
}


let cache: RegionProfile[] | null = null;

export function getRegionProfiles(): RegionProfile[] {
  if (!cache) cache = loadProfiles();
  return cache;
}

export function getRegionProfile(slug: string): RegionProfile | undefined {
  return getRegionProfiles().find((r) => r.slug === slug);
}

export function getRegionsByMargin(margin: string): RegionProfile[] {
  return getRegionProfiles().filter((r) => r.margin === margin);
}

export function getFeaturedRegion(): RegionProfile {
  const featured = getRegionProfiles().find((r) => r.featured);
  if (!featured) throw new Error("No featured region configured");
  return featured;
}
