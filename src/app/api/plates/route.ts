import { NextResponse } from "next/server";
import { getPlateBoundaries } from "@/data/adapters/usgs-plates";
import { getGemFaults } from "@/data/adapters/gem-faults";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [plates, faults] = await Promise.all([
      getPlateBoundaries(),
      getGemFaults().catch(() => null),
    ]);
    return NextResponse.json({
      mode: plates.mode,
      fetchedAt: plates.fetchedAt,
      boundaries: plates.data,
      faults: faults?.data
        ? {
            mode: faults.mode,
            featureCount: faults.data.featureCount,
            geojson: faults.data.geojson,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "plate data unavailable", detail: String(e) },
      { status: 503 },
    );
  }
}
