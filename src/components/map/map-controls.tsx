"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/controls";
import type { LayerToggles, MapFilters } from "./world-map";
import type { TimeWindow } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** One filter row above everything it scopes (dataviz interaction rule). */
export function MapFilterRow({
  filters,
  onChange,
  layers,
  onLayersChange,
  quakeMode,
}: {
  filters: MapFilters;
  onChange: (f: MapFilters) => void;
  layers: LayerToggles;
  onLayersChange: (l: LayerToggles) => void;
  quakeMode: string;
}) {
  const { t } = useI18n();
  const [showLegend, setShowLegend] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          {t("map.timeWindow")}
        </span>
        <Segmented
          size="sm"
          ariaLabel={t("map.timeWindow")}
          value={filters.window}
          onChange={(w) => onChange({ ...filters, window: w as TimeWindow })}
          options={(["24h", "7d", "30d", "90d"] as TimeWindow[]).map((w) => ({
            value: w,
            label: t(`map.window.${w}`),
          }))}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          {t("map.magnitude")}
        </span>
        <Segmented
          size="sm"
          ariaLabel={t("map.magnitude")}
          value={String(filters.minMag)}
          onChange={(v) => onChange({ ...filters, minMag: Number(v) as MapFilters["minMag"] })}
          options={[2.5, 4, 5, 6, 7].map((m) => ({ value: String(m), label: `M${m}+` }))}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          {t("map.depth")}
        </span>
        <Select
          ariaLabel={t("map.depth")}
          value={filters.depth}
          onChange={(e) =>
            onChange({ ...filters, depth: e.target.value as MapFilters["depth"] })
          }
        >
          <option value="any">{t("map.depthAny")}</option>
          <option value="shallow">{t("map.depthShallow")}</option>
          <option value="intermediate">{t("map.depthIntermediate")}</option>
          <option value="deep">{t("map.depthDeep")}</option>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <LayerTogglesPopover layers={layers} onChange={onLayersChange} />
        <button
          onClick={() => setShowLegend((s) => !s)}
          aria-expanded={showLegend}
          className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-2 hover:bg-surface-3"
        >
          {t("map.legend.title")}
          <ChevronDown className={cn("h-3 w-3 transition-transform", showLegend && "rotate-180")} />
        </button>
        {quakeMode === "fixture" && (
          <span className="rounded border border-[color-mix(in_srgb,var(--viz-2)_35%,transparent)] bg-[color-mix(in_srgb,var(--viz-2)_10%,transparent)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[var(--viz-2)]">
            {t("map.fixturesActive")}
          </span>
        )}
      </div>

      {showLegend && <MapLegend />}
    </div>
  );
}

function LayerTogglesPopover({
  layers,
  onChange,
}: {
  layers: LayerToggles;
  onChange: (l: LayerToggles) => void;
}) {
  const { t } = useI18n();
  const keys = ["regime", "earthquakes", "plates", "faults", "volcanoes", "gnss"] as const;
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-2 hover:bg-surface-3">
        {t("map.layers")}
        <ChevronDown className="h-3 w-3" />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-line bg-surface-2 p-2 shadow-xl">
        {keys.map((key) => (
          <label
            key={key}
            className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-3"
          >
            {t(`map.layer.${key}`)}
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(e) => onChange({ ...layers, [key]: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
          </label>
        ))}
      </div>
    </details>
  );
}

function MapLegend() {
  const { t } = useI18n();
  return (
    <div className="w-full rounded-md border border-line bg-surface-2 p-3 text-[11px] text-ink-2">
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-1 font-semibold text-ink">{t("map.legend.regimeScale")}</div>
          <div className="flex h-2 overflow-hidden rounded">
            {[10, 35, 55, 72, 90].map((v) => (
              <div
                key={v}
                className="flex-1"
                style={{ background: `var(--viz-${v < 45 ? 1 : v < 65 ? 3 : 2})`, opacity: 0.3 + v / 150 }}
              />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-ink-3">{t("map.legend.coverageHatch")}</p>
        </div>
        <div>
          <div className="mb-1 font-semibold text-ink">{t("map.legend.magScale")}</div>
          <div className="flex items-end gap-2">
            {[4, 6, 8].map((m) => (
              <span key={m} className="flex flex-col items-center gap-0.5">
                <svg viewBox="0 0 20 20" style={{ width: 6 + m * 2.2, height: 6 + m * 2.2 }} aria-hidden>
                  <polygon points="10,2 18.5,17 1.5,17" fill="var(--viz-1)" />
                </svg>
                <span className="text-[9px] text-ink-3 tnum">M{m}</span>
              </span>
            ))}
            <span className="flex flex-col items-center gap-0.5">
              <svg viewBox="0 0 20 20" style={{ width: 14, height: 14 }} aria-hidden>
                <polygon points="10,2 18.5,17 1.5,17" fill="none" stroke="var(--viz-1)" strokeWidth="2.5" />
              </svg>
              <span className="text-[9px] text-ink-3">◎</span>
            </span>
          </div>
          <p className="mt-1 text-[10px] text-ink-3">{t("map.legend.aftershock")} · {t("map.depthNote")}</p>
        </div>
        <div>
          <div className="mb-1 font-semibold text-ink">{t("map.legend.title")}</div>
          <ul className="space-y-0.5 text-[10px] text-ink-3">
            <li>— {t("map.legend.convergent")}</li>
            <li>· {t("map.legend.otherBoundaries")}</li>
            <li>▲ {t("map.legend.volcanoStates")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
