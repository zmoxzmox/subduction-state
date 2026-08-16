"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useScoredRegions } from "@/lib/queries";
import { useResearchConfig } from "@/research/config-context";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { MetricBar } from "@/components/dashboard/score";
import { useViz } from "@/lib/viz";
import type { MetricId, ScoredMetric } from "@/types";

const METRIC_ORDER: MetricId[] = [
  "couplingAsperity",
  "slipDeficitMaturity",
  "longTermQuiescence",
  "recentQuiescence",
  "interfaceActivation",
  "gnssTransient",
  "environmentalPerturbation",
  "remotePerturbation",
  "volcanicResponse",
  "alongMarginMigration",
];

export default function ComparePage() {
  const { t, lang } = useI18n();
  const { data, isPending } = useScoredRegions();
  const { aggregate } = useResearchConfig();
  const viz = useViz();
  const [selected, setSelected] = React.useState<string[]>([]);

  const regions = React.useMemo(() => data?.regions ?? [], [data]);

  // default selection (derived, not stored): featured + two highest
  const defaultSelection = React.useMemo(() => {
    const featured = regions.find((r) => r.featured)?.slug;
    const others = regions
      .filter((r) => r.summary.observed != null && r.slug !== featured)
      .sort((a, b) => (b.summary.observed ?? 0) - (a.summary.observed ?? 0))
      .slice(0, 2)
      .map((r) => r.slug);
    return [featured, ...others].filter(Boolean).slice(0, 3) as string[];
  }, [regions]);

  const active = selected.length > 0 ? selected : defaultSelection;

  const toggle = (slug: string) => {
    const prev = active;
    setSelected(
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= 4
          ? prev
          : [...prev, slug],
    );
  };

  const chosen = regions.filter((r) => active.includes(r.slug));

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          {t("compare.title")}
        </h1>
        <p className="text-xs text-ink-3">{t("compare.subtitle")}</p>
      </div>

      {/* region picker */}
      <Card>
        <CardHeader>
          <CardTitle>{t("compare.select")}</CardTitle>
          <span className="text-[11px] text-ink-3">
            {t("compare.selected", { count: active.length })}
          </span>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-1.5">
          {regions.map((r) => {
            const on = active.includes(r.slug);
            return (
              <button
                key={r.slug}
                onClick={() => toggle(r.slug)}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? "border-accent bg-accent-soft/40 font-medium text-accent-strong dark:text-accent"
                    : "border-line text-ink-2 hover:bg-surface-3"
                }`}
              >
                {on && <X className="mr-1 inline h-3 w-3" aria-hidden />}
                {r.name[lang]}
              </button>
            );
          })}
        </CardBody>
      </Card>

      {chosen.length >= 2 && (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("compare.chartTitle")}</CardTitle>
                <CardDescription className="mt-0.5">
                  {t("compare.note")}
                </CardDescription>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="thin-scroll overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
                      <th className="px-4 py-2 font-medium">—</th>
                      {chosen.map((r) => (
                        <th key={r.slug} className="px-3 py-2 font-medium">
                          <Link
                            href={`/region/${r.slug}`}
                            className="text-ink hover:text-accent"
                          >
                            {r.name[lang]}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-line bg-surface-3/30">
                      <td className="px-4 py-2 font-medium text-ink">
                        {t("compare.table.score")}
                      </td>
                      {chosen.map((r) => {
                        const s = aggregate(r.metrics);
                        return (
                          <td key={r.slug} className="px-3 py-2">
                            <span
                              className="text-lg font-semibold tnum"
                              style={{
                                color: s.observed != null ? viz.scoreColor(s.observed) : undefined,
                              }}
                            >
                              {s.observed != null ? Math.round(s.observed) : "—"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-line">
                      <td className="px-4 py-2 text-ink-2">{t("compare.table.coverage")}</td>
                      {chosen.map((r) => {
                        const s = aggregate(r.metrics);
                        return (
                          <td key={r.slug} className="px-3 py-2 text-ink-2 tnum">
                            {Math.round(s.coverage * 100)}% ·{" "}
                            {t(`score.coverageBand.${s.coverageBand}`)}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-line">
                      <td className="px-4 py-2 text-ink-2">{t("compare.table.range")}</td>
                      {chosen.map((r) => {
                        const s = aggregate(r.metrics);
                        return (
                          <td key={r.slug} className="px-3 py-2 text-ink-3 tnum">
                            {s.minFull.toFixed(0)}–{s.maxFull.toFixed(0)}
                          </td>
                        );
                      })}
                    </tr>
                    {METRIC_ORDER.map((id) => (
                      <tr key={id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 text-ink-2">
                          {t(`metrics.${id}.name`)}
                        </td>
                        {chosen.map((r) => {
                          const m: ScoredMetric | undefined = r.metrics.find(
                            (x) => x.id === id,
                          );
                          return (
                            <td key={r.slug} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="w-8 shrink-0 text-right font-medium text-ink tnum">
                                  {m?.score != null ? Math.round(m.score) : "—"}
                                </span>
                                <div className="w-24">
                                  {m && <MetricBar metric={m} />}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t border-line">
                      <td className="px-4 py-2 text-ink-2">{t("compare.table.m5")}</td>
                      {chosen.map((r) => (
                        <td key={r.slug} className="px-3 py-2 text-ink-3 tnum">
                          {r.m5Count30d ?? "—"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
