import { NextResponse } from "next/server";
import { getVolcanoDb } from "@/data/adapters/gvp-volcanoes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await getVolcanoDb();
    return NextResponse.json({
      mode: res.mode,
      fetchedAt: res.fetchedAt,
      count: res.data.length,
      volcanoes: res.data,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "volcano data unavailable", detail: String(e) },
      { status: 503 },
    );
  }
}
