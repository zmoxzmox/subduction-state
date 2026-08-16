import type { ChangeFeedItem, ScoredMetric } from "@/types";
import { metricContribution } from "./score";
import { isoDate } from "@/lib/utils";

/**
 * Region timeline — "what changed?". Deterministic diffs between
 * metric sets computed at different `asOf` instants (each computed with
 * the same cached catalogs, so differences are genuine signal changes,
 * not fetch noise).
 */

export function buildChangeFeed(
  current: ScoredMetric[],
  history: Array<{ asOf: number; metrics: ScoredMetric[] }>,
  gnssLastUsableAt: number | null = null,
): ChangeFeedItem[] {
  const items: ChangeFeedItem[] = [];
  const now = history.length ? history[history.length - 1].asOf : Date.now();

  for (const { asOf, metrics } of history) {
    for (const cur of current) {
      const prev = metrics.find((m) => m.id === cur.id);
      const c0 = prev ? metricContribution(prev) : null;
      const c1 = metricContribution(cur);
      if (c1 == null && c0 == null) continue;
      const delta = (c1 ?? 0) - (c0 ?? 0);
      if (Math.abs(delta) < 0.5) continue;
      items.push({
        id: `${cur.id}-${isoDate(asOf)}`,
        date: new Date(asOf).toISOString(),
        deltaScore: Math.round(delta * 10) / 10,
        descriptionKey: `change.${cur.id}`,
        descriptionParams: {
          metric: cur.id,
          delta: Math.round(delta * 10) / 10,
          prevScore: prev?.score ?? 0,
          newScore: cur.score ?? 0,
        },
      });
    }
  }

  if (gnssLastUsableAt == null || now - gnssLastUsableAt > 5 * 86_400_000) {
    const gnss = current.find((m) => m.id === "gnssTransient");
    if (gnss && gnss.score == null) {
      items.push({
        id: "gnss-no-update",
        date: new Date(now).toISOString(),
        deltaScore: null,
        descriptionKey: "change.gnssNoUpdate",
        descriptionParams: gnssLastUsableAt
          ? { lastUsable: isoDate(gnssLastUsableAt) }
          : {},
      });
    }
  }

  return items
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 12);
}
