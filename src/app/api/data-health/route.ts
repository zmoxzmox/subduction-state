import { NextResponse } from "next/server";
import { healthRegistry } from "@/data/health";

export const dynamic = "force-dynamic";

/** Cache policy documentation surfaced on /data */
export const SOURCE_POLICIES = [
  { source: "USGS earthquakes (real-time feed)", cache: "5 min", note: "all_day/all_week summary feeds" },
  { source: "USGS earthquakes (FDSN)", cache: "15–30 min (display) / 6 h (regional historical)", note: "FDSN event WS queries" },
  { source: "USGS plate boundaries", cache: "7 days", note: "geometry effectively static" },
  { source: "GEM Global Active Faults", cache: "7 days", note: "requires GEM_GAF_URL (see README)" },
  { source: "Smithsonian GVP volcanoes", cache: "24 h", note: "VOTW WFS" },
  { source: "NOAA SST anomaly (CRW/ERDDAP)", cache: "24 h current / 7 d history", note: "point samples" },
  { source: "NOAA sea-level anomaly (ERDDAP)", cache: "24 h", note: "point samples" },
  { source: "NOAA CPC ENSO (ONI)", cache: "24 h", note: "monthly index" },
  { source: "GNSS (UNR NGL)", cache: "7 d index / 12 h series", note: "no fixture — unavailable is honest" },
];

export async function GET() {
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    health: healthRegistry.snapshot(),
    policies: SOURCE_POLICIES,
  });
}
