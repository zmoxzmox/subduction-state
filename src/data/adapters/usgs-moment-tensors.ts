import { z } from "zod";
import type { QuakeEvent, RegionProfile } from "@/types";
import { cachedFetch } from "@/data/http";
import { pointInCircle } from "@/lib/geo";

/**
 * Moment-tensor adapter (USGS ComCat event detail).
 *
 * Spec §17: "Moment-tensor mechanism should be incorporated when
 * available. If mechanism is missing, lower confidence rather than
 * guessing." For each recent M5.5+ event in the region circle we read
 * the contributed moment-tensor product and classify the mechanism:
 *
 *  - reverse/thrust: either nodal plane has rake within ±45° of 90°
 *    on a plane dipping < 60°
 *  - interface-consistent: reverse AND 10–60 km depth (typical
 *    megathrust seismogenic band — documented assumption)
 *
 * This is evidence for the interface-activation metric, never a
 * standalone hazard signal.
 */

const detailSchema = z.object({
  properties: z
    .object({
      products: z
        .object({
          // ComCat product keys are hyphenated; prefer the reviewed
          // moment tensor, fall back to the internal one
          "moment-tensor": z
            .array(z.object({ properties: z.record(z.string(), z.unknown()) }))
            .optional(),
          "internal-moment-tensor": z
            .array(z.object({ properties: z.record(z.string(), z.unknown()) }))
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export interface MechanismSample {
  id: string;
  mag: number;
  depthKm: number;
  rake: number | null;
  dip: number | null;
  isReverse: boolean;
  isInterfaceThrust: boolean;
  source: string;
}

export interface RegionMomentTensors {
  sampled: number;
  reverseCount: number;
  interfaceThrustCount: number;
  mechanisms: MechanismSample[];
}

export const MT_MIN_MAG = 5.5;
export const MT_MAX_EVENTS = 25;

function parseRakeDip(props: Record<string, unknown>): {
  rake: number | null;
  dip: number | null;
} {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // prefer the shallowly-dipping nodal plane for thrust classification
  const planes = [1, 2].map((i) => ({
    dip: num(props[`nodal-plane-${i}-dip`]),
    rake: num(props[`nodal-plane-${i}-rake`]),
  }));
  const shallow = planes
    .filter((p) => p.dip != null && p.rake != null)
    .sort((a, b) => (a.dip ?? 0) - (b.dip ?? 0))[0];
  return { rake: shallow?.rake ?? null, dip: shallow?.dip ?? null };
}

function classifyReverse(rake: number | null, dip: number | null): boolean {
  if (rake == null || dip == null) return false;
  const rakeInThrustBand =
    (rake >= 45 && rake <= 135) || (rake <= -45 && rake >= -135);
  return rakeInThrustBand && dip < 60;
}

async function fetchMechanism(
  event: QuakeEvent,
): Promise<MechanismSample | null> {
  try {
    const res = await cachedFetch(
      `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${event.id}&format=geojson`,
      (raw) => {
        const parsed = detailSchema.parse(raw);
        const products = parsed.properties?.products;
        const mt =
          products?.["moment-tensor"]?.[0] ??
          products?.["internal-moment-tensor"]?.[0];
        if (!mt) return null;
        const { rake, dip } = parseRakeDip(mt.properties);
        if (rake == null || dip == null) return null;
        return {
          rake,
          dip,
          source: mt.properties["beachball-source"] ?? "USGS moment tensor",
        };
      },
      {
        key: `usgs-mt2-${event.id}`,
        ttlMs: 7 * 24 * 3_600_000,
        source: "USGS moment tensors (ComCat detail)",
        timeoutMs: 8000,
      },
    );
    if (!res.data) return null;
    const isReverse = classifyReverse(res.data.rake, res.data.dip);
    return {
      id: event.id,
      mag: event.mag,
      depthKm: event.depthKm,
      rake: res.data.rake,
      dip: res.data.dip,
      isReverse,
      isInterfaceThrust: isReverse && event.depthKm >= 10 && event.depthKm <= 60,
      source: String(res.data.source),
    };
  } catch {
    return null; // no tensor contributed — lower confidence, don't guess
  }
}

/** Bounded-concurrency map. */
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * @param catalog the region's cached catalog (events already in the
 *                circle) — no duplicate upstream query needed
 */
export async function getRegionMomentTensors(
  profile: RegionProfile,
  catalog: QuakeEvent[],
  now: number = Date.now(),
): Promise<RegionMomentTensors | null> {
  const candidates = catalog
    .filter(
      (e) =>
        e.mag >= MT_MIN_MAG &&
        e.time > now - 365 * 86_400_000 &&
        pointInCircle(e.lon, e.lat, profile.center[0], profile.center[1], profile.radiusKm),
    )
    .sort((a, b) => b.mag - a.mag)
    .slice(0, MT_MAX_EVENTS);

  if (candidates.length === 0) return null;

  const mechanisms = (
    await mapLimited(candidates, 6, fetchMechanism)
  ).filter((m): m is MechanismSample => m !== null);

  if (mechanisms.length === 0) return null;

  return {
    sampled: mechanisms.length,
    reverseCount: mechanisms.filter((m) => m.isReverse).length,
    interfaceThrustCount: mechanisms.filter((m) => m.isInterfaceThrust).length,
    mechanisms,
  };
}
