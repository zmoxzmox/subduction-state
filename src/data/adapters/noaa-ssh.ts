import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { cachedFetch } from "@/data/http";
import type { RegionProfile } from "@/types";

/**
 * NOAA sea-surface-height anomaly adapter — RADS blended altimetry
 * daily SLA (`noaacwBLENDEDsshDaily`, CoastWatch ERDDAP).
 * Point sample at the region's offshore location, 3-day mean.
 */

const enc = (u: string) => u.replace(/\[/g, "%5B").replace(/\]/g, "%5D");

const seriesSchema = z.array(z.object({ t: z.string(), v: z.number() }));

function parseCsvSeries(raw: unknown) {
  if (typeof raw !== "string") throw new Error("expected csv text");
  const lines = raw.trim().split("\n");
  if (lines.length < 3) throw new Error("empty series");
  const out: Array<{ t: string; v: number }> = [];
  for (const line of lines.slice(2)) {
    const [t, , , v] = line.split(",");
    const val = parseFloat(v);
    if (!Number.isNaN(val)) out.push({ t, v: val });
  }
  return seriesSchema.parse(out);
}

export interface SshSample {
  anomalyCm: number | null;
  observedAt: string | null;
}

export async function getSshSample(
  profile: RegionProfile,
): Promise<SshSample | null> {
  const [lon, lat] = profile.envSamplePoint;
  const start = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
  try {
    const res = await cachedFetch(
      enc(
        `https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDsshDaily.csv?sla[(${start}):(${new Date()
          .toISOString()
          .slice(0, 10)})][(${lat.toFixed(1)})][(${lon.toFixed(1)})]`,
      ),
      parseCsvSeries,
      {
        key: `ssh-${profile.slug}`,
        ttlMs: 24 * 3_600_000,
        source: "NOAA sea-level anomaly (ERDDAP)",
        timeoutMs: 15_000,
      },
    );
    if (res.data.length === 0) return null;
    const mean = res.data.reduce((s, r) => s + r.v, 0) / res.data.length;
    return {
      anomalyCm: +(mean * 100).toFixed(1),
      observedAt: res.data[res.data.length - 1].t,
    };
  } catch {
    return null;
  }
}

export function getSshFixture(slug: string): number | null {
  try {
    const all = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "fixtures/noaa/env_points.json"),
        "utf8",
      ),
    ) as Record<string, { sshAnomalyM?: number }>;
    const v = all[slug]?.sshAnomalyM;
    return v == null ? null : +(v * 100).toFixed(1);
  } catch {
    return null;
  }
}
