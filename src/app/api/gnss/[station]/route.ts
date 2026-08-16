import { NextResponse } from "next/server";
import { getStationSeries } from "@/data/adapters/gnss";
import { computeStationAnomaly } from "@/scoring/gnss";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ station: string }> },
) {
  const { station } = await params;
  const id = station.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{4}$/.test(id)) {
    return NextResponse.json({ error: "invalid station id" }, { status: 400 });
  }
  try {
    const res = await getStationSeries(id);
    const anomaly = computeStationAnomaly(
      id,
      res.data.map((p) => ({ t: p.t, e: p.e, n: p.n })),
      Date.now(),
    );
    const stride = Math.max(1, Math.floor(res.data.length / 480));
    return NextResponse.json({
      station: id,
      mode: res.mode,
      fetchedAt: res.fetchedAt,
      anomaly: anomaly
        ? {
            zEast: +anomaly.zEast.toFixed(2),
            zNorth: +anomaly.zNorth.toFixed(2),
            zHorizontal: +anomaly.zHorizontal.toFixed(2),
          }
        : null,
      series: res.data
        .filter((_, i) => i % stride === 0)
        .map((p) => [p.t, +p.e.toFixed(1), +p.n.toFixed(1)]),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "station data unavailable", detail: String(e) },
      { status: 503 },
    );
  }
}
