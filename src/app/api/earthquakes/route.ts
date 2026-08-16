import { NextResponse } from "next/server";
import { decluster } from "@/scoring/decluster";
import {
  getDailyFeed,
  getMapCatalog30d,
  getMapCatalog90d,
  getWeeklyFeed,
} from "@/data/adapters/usgs-earthquakes";
import { getRegionProfiles } from "@/regions/profiles";
import { nearestRegion } from "@/scoring/timeseries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const window = url.searchParams.get("window") ?? "24h";

  try {
    let result;
    switch (window) {
      case "24h":
        result = await getDailyFeed();
        break;
      case "7d":
        result = await getWeeklyFeed();
        break;
      case "30d":
        result = await getMapCatalog30d();
        break;
      case "90d":
        result = await getMapCatalog90d();
        break;
      default:
        return NextResponse.json({ error: "invalid window" }, { status: 400 });
    }

    const events = decluster(result.data);
    const profiles = getRegionProfiles();
    return NextResponse.json({
      window,
      mode: result.mode,
      fetchedAt: result.fetchedAt,
      observedAt: result.observedAt,
      count: events.length,
      events: events.map((e) => {
        const near = nearestRegion(e.lon, e.lat, profiles);
        return {
          id: e.id,
          mag: e.mag,
          time: e.time,
          depthKm: e.depthKm,
          lon: e.lon,
          lat: e.lat,
          place: e.place,
          url: e.url,
          aftershockCandidate: e.aftershockCandidate,
          nearestRegion: near,
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "earthquake data unavailable", detail: String(e) },
      { status: 503 },
    );
  }
}
