import { NextResponse } from "next/server";
import { getRegionDetail } from "@/data/scores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const asOf = url.searchParams.get("asOf") ?? undefined;
  const noGnss = url.searchParams.get("noGnss") === "1";

  try {
    const detail = await getRegionDetail(slug, { asOf, noGnss });
    if (!detail) {
      return NextResponse.json({ error: "unknown region" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: "region analysis unavailable", detail: String(e) },
      { status: 503 },
    );
  }
}
