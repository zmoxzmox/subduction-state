import fs from "node:fs";
import path from "node:path";
import { cachedFetch } from "@/data/http";
import type { EnsoState } from "@/types";

/**
 * NOAA CPC Oceanic Niño Index (ONI) adapter. Global context only —
 * displayed as environmental boundary information and scored as a
 * low-weight experimental subcomponent. Never a local earthquake
 * predictor or multiplier (spec §50).
 */

function parseOni(raw: unknown): EnsoState[] {
  if (typeof raw !== "string") throw new Error("expected text");
  const seasons: EnsoState[] = [];
  for (const line of raw.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const oni = parseFloat(parts[3]);
    if (Number.isNaN(oni)) continue;
    seasons.push({
      oni,
      season: parts[0],
      phase:
        oni >= 0.5 ? "el-nino" : oni <= -0.5 ? "la-nina" : "neutral",
    });
  }
  if (seasons.length === 0) throw new Error("no ONI rows");
  return seasons;
}

export interface EnsoResult {
  latest: EnsoState;
  /** last 8 seasons, oldest → newest */
  recent: EnsoState[];
}

export async function getEnso(): Promise<EnsoResult | null> {
  try {
    const res = await cachedFetch(
      "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
      parseOni,
      {
        key: "noaa-oni",
        ttlMs: 24 * 3_600_000,
        source: "NOAA CPC ENSO (ONI)",
        timeoutMs: 12_000,
        fixture: () => {
          try {
            return fs.readFileSync(
              path.join(process.cwd(), "fixtures/noaa/oni.ascii.txt"),
              "utf8",
            );
          } catch {
            return null;
          }
        },
      },
    );
    const recent = res.data.slice(-8);
    return { latest: recent[recent.length - 1], recent };
  } catch {
    return null;
  }
}
