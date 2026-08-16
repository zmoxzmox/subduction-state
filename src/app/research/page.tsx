"use client";

import * as React from "react";
import { FlaskConical, RotateCcw, ClipboardCopy, Check } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useResearchConfig } from "@/research/config-context";
import { useScoredRegions } from "@/lib/queries";
import { CANONICAL_WEIGHTS, METRIC_IDS } from "@/scoring/weights";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider, Switch, Skeleton } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreChip } from "@/components/dashboard/score";
import { cn } from "@/lib/utils";
import type { MetricId } from "@/types";

export default function ResearchPage() {
  const { t, lang, formatNumber } = useI18n();
  const {
    config,
    isCustom,
    setWeight,
    toggleMetric,
    update,
    reset,
    importJson,
    exportJson,
  } = useResearchConfig();
  const scored = useScoredRegions();
  const [importText, setImportText] = React.useState("");
  const [importError, setImportError] = React.useState(false);
  const [exported, setExported] = React.useState(false);

  const total = METRIC_IDS.reduce((s, id) => s + config.weights[id], 0);
  const featured = scored.data?.regions.find((r) => r.featured);
  const sampleRegions = (scored.data?.regions ?? []).slice(0, 6);

  const doExport = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      setExported(true);
      setTimeout(() => setExported(false), 2500);
    } catch {
      setImportText(exportJson());
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
            <FlaskConical className="h-5 w-5 text-accent" aria-hidden />
            {t("research.title")}
          </h1>
          <p className="mt-1 text-xs text-ink-3">{t("research.subtitle")}</p>
        </div>
        <Button variant={isCustom ? "primary" : "outline"} size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" /> {t("research.resetV01")}
        </Button>
      </div>

      {isCustom && (
        <div className="rounded-md border border-[color-mix(in_srgb,var(--viz-5)_40%,transparent)] bg-[color-mix(in_srgb,var(--viz-5)_8%,transparent)] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--viz-5)]">
            {t("research.customActive")}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-2">{t("research.customActiveNote")}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("research.weights")}</CardTitle>
            <CardDescription className="mt-0.5">
              {t("research.weightsMustTotal")}
            </CardDescription>
          </div>
          <span
            className={cn(
              "text-sm font-semibold tnum",
              Math.abs(total - 100) < 0.01 ? "text-ink" : "text-[var(--viz-2)]",
            )}
          >
            {t("research.weightsTotal")}: {formatNumber(Math.round(total * 10) / 10)}
          </span>
        </CardHeader>
        <CardBody className="space-y-2.5">
          {METRIC_IDS.map((id) => {
            const canonical = CANONICAL_WEIGHTS[id as MetricId];
            const current = config.weights[id as MetricId];
            const disabled = config.disabledMetrics.includes(id as MetricId);
            return (
              <div
                key={id}
                className={cn("grid grid-cols-[1fr_auto] items-center gap-3", disabled && "opacity-50")}
              >
                <div className="min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label htmlFor={`w-${id}`} className="truncate text-xs text-ink">
                      {t(`metrics.${id}.name`)}
                      <span className="ml-1.5 text-[10px] text-ink-3 tnum">
                        V0.1: {canonical}
                      </span>
                    </label>
                  </div>
                  <Slider
                    id={`w-${id}`}
                    label={t(`metrics.${id}.name`)}
                    value={current}
                    min={0}
                    max={Math.max(40, canonical + 10)}
                    step={0.5}
                    onChange={(v) => setWeight(id as MetricId, v)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`t-${id}`}
                    checked={!disabled}
                    onChange={(v) => toggleMetric(id as MetricId, v)}
                    label={t("research.metrics")}
                  />
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("research.thresholds")}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label
                htmlFor="th-mag"
                className="mb-1 block text-xs text-ink-2"
              >
                {t("research.minMagnitude")}
              </label>
              <Slider
                id="th-mag"
                label={t("research.minMagnitude")}
                value={config.thresholds.minMagnitude}
                min={3}
                max={6}
                step={0.5}
                onChange={(v) => update({ thresholds: { ...config.thresholds, minMagnitude: v } })}
                formatValue={(v) => `M${v}`}
              />
            </div>
            <div>
              <label htmlFor="th-z" className="mb-1 block text-xs text-ink-2">
                {t("research.gnssZ")}
              </label>
              <Slider
                id="th-z"
                label={t("research.gnssZ")}
                value={config.thresholds.gnssZThreshold}
                min={1.5}
                max={4}
                step={0.1}
                onChange={(v) =>
                  update({ thresholds: { ...config.thresholds, gnssZThreshold: v } })
                }
                formatValue={(v) => `z=${v.toFixed(1)}`}
              />
            </div>
            <Switch
              id="declustering"
              checked={config.declustering}
              onChange={(v) => update({ declustering: v })}
              label={t("research.declustering")}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("research.windows")}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label htmlFor="w-recent" className="mb-1 block text-xs text-ink-2">
                {t("research.recentWindow")}
              </label>
              <Slider
                id="w-recent"
                label={t("research.recentWindow")}
                value={config.windows.recentDays}
                min={7}
                max={90}
                step={1}
                onChange={(v) => update({ windows: { ...config.windows, recentDays: v } })}
                formatValue={(v) => `${v}`}
              />
            </div>
            <div>
              <label htmlFor="w-baseline" className="mb-1 block text-xs text-ink-2">
                {t("research.baselineWindow")}
              </label>
              <Slider
                id="w-baseline"
                label={t("research.baselineWindow")}
                value={config.windows.baselineDays}
                min={365}
                max={1825}
                step={365}
                onChange={(v) => update({ windows: { ...config.windows, baselineDays: v } })}
                formatValue={(v) => `${Math.round(v / 365)}y`}
              />
            </div>
            <div>
              <label htmlFor="w-remote" className="mb-1 block text-xs text-ink-2">
                {t("research.remoteRadius")}
              </label>
              <Slider
                id="w-remote"
                label={t("research.remoteRadius")}
                value={config.windows.remoteRadiusKm}
                min={500}
                max={5000}
                step={250}
                onChange={(v) => update({ windows: { ...config.windows, remoteRadiusKm: v } })}
                formatValue={(v) => `${v}`}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("research.livePreview")}</CardTitle>
            <CardDescription className="mt-0.5">
              {t("research.livePreviewNote")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          {scored.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(featured ? [featured, ...sampleRegions.filter((r) => r.slug !== featured.slug)] : sampleRegions)
                .slice(0, 6)
                .map((r) => (
                  <div
                    key={r.slug}
                    className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2"
                  >
                    <span className="text-xs text-ink-2">{r.name[lang]}</span>
                    <ScoreChip summary={r.summary} showBand={false} />
                  </div>
                ))}
            </div>
          )}
          <p className="pt-1 text-[10px] text-ink-3">{t("research.noteServer")}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{`${t("research.exportConfig")} / ${t("research.importConfig")}`}</CardTitle>
          <Button size="sm" variant="outline" onClick={doExport}>
            {exported ? (
              <>
                <Check className="h-3.5 w-3.5" /> {t("research.configExported")}
              </>
            ) : (
              <>
                <ClipboardCopy className="h-3.5 w-3.5" /> {t("research.exportConfig")}
              </>
            )}
          </Button>
        </CardHeader>
        <CardBody className="space-y-2">
          <textarea
            aria-label={t("research.importConfig")}
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError(false);
            }}
            placeholder={`{"version": "0.1", "weights": {...}, "thresholds": {...}, "windows": {...}}`}
            className="h-28 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-[11px] text-ink"
          />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const ok = importJson(importText);
                setImportError(!ok);
                if (ok) setImportText("");
              }}
            >
              {t("research.importConfig")}
            </Button>
            {importError && (
              <Badge tone="critical">{t("research.importInvalid")}</Badge>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
