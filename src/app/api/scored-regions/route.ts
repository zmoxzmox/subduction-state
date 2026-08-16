import { NextResponse } from "next/server";
import { getGlobalScores } from "@/data/scores";
import { getLargestEvents } from "@/data/adapters/usgs-earthquakes";
import { healthRegistry } from "@/data/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wait = url.searchParams.get("wait") === "1";
  try {
    const [scores, largest7, largest30] = await Promise.all([
      getGlobalScores({ wait }),
      getLargestEvents(7).catch(() => null),
      getLargestEvents(30).catch(() => null),
    ]);
    return NextResponse.json({
      ...scores,
      largest7d: largest7?.data ?? [],
      largest30d: largest30?.data ?? [],
      health: healthRegistry.snapshot(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "scoring unavailable", detail: String(e) },
      { status: 503 },
    );
  }
}
