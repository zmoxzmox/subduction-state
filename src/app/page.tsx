"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import {
  useEarthquakes,
  usePlates,
  useScoredRegions,
  useVolcanoes,
} from "@/lib/queries";
import { WorldMap, type LayerToggles, type MapFilters } from "@/components/map/world-map";
import { MapFilterRow } from "@/components/map/map-controls";
import {
  EnvAnomaliesPanel,
  EnsoContextCard,
  HighestMatchesPanel,
  LargestQuakesPanel,
  LeadersPanel,
  LowestCoveragePanel,
  PendingNotice,
} from "@/components/dashboard/global-dashboard";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/controls";

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();

  const [filters, setFilters] = React.useState<MapFilters>({
    window: "24h",
    minMag: 2.5,
    depth: "any",
  });
  const [layers, setLayers] = React.useState<LayerToggles>({
    earthquakes: true,
    plates: true,
    faults: false,
    volcanoes: true,
    gnss: true,
    regime: true,
  });
  const [minCoverage, setMinCoverage] = React.useState(50);

  const quakes = useEarthquakes(filters.window);
  const scored = useScoredRegions();
  const plates = usePlates();
  const volcanoes = useVolcanoes();

  const regions = React.useMemo(
    () => scored.data?.regions ?? [],
    [scored.data],
  );
  const gnssStations = React.useMemo(
    () => regions.flatMap((r) => r.gnssStations ?? []),
    [regions],
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <div className="mb-3">
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          {t("home.title")}
        </h1>
        <p className="text-xs text-ink-3">{t("home.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* map column: filters + map, then the secondary panels fill the
            space below the map instead of leaving a gap */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--shadow-card)]">
            <MapFilterRow
              filters={filters}
              onChange={setFilters}
              layers={layers}
              onLayersChange={setLayers}
              quakeMode={quakes.data?.mode ?? ""}
            />
            <div className="relative h-[52vh] min-h-[360px] lg:h-[calc(100vh-24rem)]">
              {quakes.isPending ? (
                <div className="flex h-full items-center justify-center">
                  <Skeleton className="h-full w-full rounded-none" />
                </div>
              ) : (
                <WorldMap
                  filters={filters}
                  layers={layers}
                  regions={regions}
                  quakes={quakes.data?.events ?? []}
                  quakeMode={quakes.data?.mode ?? ""}
                  boundaries={plates.data?.boundaries ?? null}
                  faultsGeojson={plates.data?.faults?.geojson ?? null}
                  volcanoes={volcanoes.data?.volcanoes ?? null}
                  gnssStations={gnssStations}
                  selectedSlug={null}
                  onSelectRegion={(slug) => router.push(`/region/${slug}`)}
                />
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <LeadersPanel regions={regions} kind="quiescence" />
            <LeadersPanel regions={regions} kind="activation" />
            <EnvAnomaliesPanel regions={regions} />
            <LowestCoveragePanel regions={regions} />
          </div>
        </div>

        {/* dashboard column */}
        <div className="thin-scroll flex w-full flex-col gap-3 lg:w-[400px] lg:shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
              {t("home.rankingFilters.minCoverage")}
            </span>
            <Segmented
              size="sm"
              ariaLabel={t("home.rankingFilters.minCoverage")}
              value={String(minCoverage)}
              onChange={(v) => setMinCoverage(Number(v))}
              options={[
                { value: "0", label: t("home.rankingFilters.any") },
                { value: "50", label: "50%" },
                { value: "70", label: "70%" },
                { value: "90", label: "90%" },
              ]}
            />
          </div>

          <PendingNotice count={scored.data?.pendingRegions.length ?? 0} />
          <HighestMatchesPanel regions={regions} minCoveragePct={minCoverage} />
          <LargestQuakesPanel
            events7d={scored.data?.largest7d ?? []}
            events30d={scored.data?.largest30d ?? []}
          />
          <EnsoContextCard enso={scored.data?.enso ?? null} />
        </div>
      </div>
    </div>
  );
}
