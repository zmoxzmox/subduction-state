"use client";

import * as React from "react";
import {
  Map as MlMap,
  NavigationControl,
  AttributionControl,
  type StyleSpecification,
  type LngLat,
  type MapMouseEvent,
  type FilterSpecification,
  type SourceSpecification,
  type LayerSpecification,
  type VisibilitySpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import type { QuakeEvent, Volcano } from "@/types";
import type { Boundary } from "@/data/adapters/usgs-plates";
import type { RegionScoreEntry } from "@/data/scores";
import type { TimeWindow } from "@/lib/queries";
import { buildPalette } from "@/lib/viz";
import { useI18n } from "@/i18n/provider";
import { useResearchConfig } from "@/research/config-context";
import { aggregateScoredMetrics } from "@/scoring/score";
import type { GnssStation } from "@/types";

import lightStyle from "@/map-styles/light.json";
import darkStyle from "@/map-styles/dark.json";

export interface MapFilters {
  window: TimeWindow;
  minMag: 2.5 | 4 | 5 | 6 | 7;
  depth: "any" | DepthClassName;
}
export type DepthClassName = "shallow" | "intermediate" | "deep";

export interface LayerToggles {
  earthquakes: boolean;
  plates: boolean;
  faults: boolean;
  volcanoes: boolean;
  gnss: boolean;
  regime: boolean;
}

export interface MapProps {
  filters: MapFilters;
  layers: LayerToggles;
  regions: RegionScoreEntry[];
  quakes: QuakeEvent[];
  quakeMode: string;
  boundaries: Boundary[] | null;
  faultsGeojson: object | null;
  volcanoes: Volcano[] | null;
  gnssStations: GnssStation[];
  selectedSlug: string | null;
  onSelectRegion: (slug: string) => void;
  /** initial camera */
  initialCenter?: [number, number];
  initialZoom?: number;
}

type Popover =
  | { kind: "quake"; lngLat: LngLat; quake: QuakeEvent & { nearestRegion?: { slug: string; distanceKm: number } | null } }
  | { kind: "volcano"; lngLat: LngLat; volcano: Volcano }
  | { kind: "region"; lngLat: LngLat; region: RegionScoreEntry }
  | { kind: "station"; lngLat: LngLat; station: GnssStation }
  | null;

export function WorldMap(props: MapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MlMap | null>(null);
  const [ready, setReady] = React.useState(false);
  const [popover, setPopover] = React.useState<Popover>(null);
  const [popPos, setPopPos] = React.useState<{ x: number; y: number } | null>(null);
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "dark" ? "dark" : "light";
  const { lang, t } = useI18n();
  const { aggregate } = useResearchConfig();
  const propsRef = React.useRef(props);
  React.useEffect(() => {
    propsRef.current = props;
  });

  /* --------------------------- init map ---------------------------- */
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const style = (resolvedTheme === "dark" ? darkStyle : lightStyle) as unknown as StyleSpecification;
    const map = new MlMap({
      container: containerRef.current,
      style,
      center: props.initialCenter ?? [-100, 15],
      zoom: props.initialZoom ?? 1.6,
      minZoom: 1,
      maxZoom: 12,
      attributionControl: false,
      maxPitch: 0,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org">OpenFreeMap</a> · USGS · Smithsonian GVP · NOAA · UNR NGL',
      }),
      "bottom-left",
    );
    map.on("load", () => {
      addHatchPattern(map);
      setReady(true);
    });
    map.on("click", (e) => handleMapClick(map, e, setPopover));
    map.on("move", () => {
      setPopover((p) => {
        if (p) positionPopover(map, p.lngLat, setPopPos);
        return p;
      });
    });
    for (const layer of ["quakes-circle", "volcanoes-circle", "gnss-circle", "regions-fill", "quakes-clusters"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------ theme switch --------------------------- */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const style = (mode === "dark" ? darkStyle : lightStyle) as unknown as StyleSpecification;
    map.setStyle(style);
    map.once("styledata", () => {
      addHatchPattern(map);
      syncAllLayers(map, propsRef.current, mode, lang, aggregate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready]);

  /* -------------------------- data sync ---------------------------- */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    registerRegionsForClick(props.regions);
    syncAllLayers(map, props, mode, lang, aggregate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.quakes, props.regions, props.boundaries, props.faultsGeojson, props.volcanoes, props.gnssStations, props.selectedSlug, props.layers, lang, mode]);

  /* ------------------------- quake filters -------------------------- */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const { filters, layers } = props;
    const magFilter: FilterSpecification = [">=", ["get", "mag"], filters.minMag];
    let depthFilter: FilterSpecification = ["any", true];
    if (filters.depth === "shallow") depthFilter = ["<", ["get", "depthKm"], 50];
    else if (filters.depth === "intermediate")
      depthFilter = ["all", [">=", ["get", "depthKm"], 50], ["<=", ["get", "depthKm"], 150]];
    else if (filters.depth === "deep") depthFilter = [">", ["get", "depthKm"], 150];
    const combined: FilterSpecification = ["all", magFilter, depthFilter];
    for (const layer of ["quakes-circle", "quakes-clusters", "quakes-cluster-count"]) {
      if (map.getLayer(layer)) map.setFilter(layer, combined);
    }
    applyVisibility(map, layers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.filters, props.layers]);

  /* ------------------------- popover ------------------------------- */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !popover) return;
    positionPopover(map, popover.lngLat, setPopPos);
  }, [popover]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="application"
        aria-label={t("map.title")}
      />
      {popover && popPos && (
        <MapPopover
          popover={popover}
          pos={popPos}
          onClose={() => setPopover(null)}
          onSelectRegion={props.onSelectRegion}
        />
      )}
    </div>
  );
}

/* ==================================================================== */
/* layer management                                                      */
/* ==================================================================== */

function addHatchPattern(map: MlMap) {
  if (map.hasImage("hatch")) return;
  const size = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.strokeStyle = "rgba(120,120,120,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, 14);
  ctx.lineTo(14, -2);
  ctx.moveTo(-2, 8);
  ctx.lineTo(8, -2);
  ctx.stroke();
  map.addImage("hatch", ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
}

function firstSymbolId(map: MlMap): string | undefined {
  const layers = map.getStyle().layers;
  return layers?.find((l) => l.type === "symbol" && l.id?.startsWith("label-"))?.id;
}

function ensureSource(map: MlMap, id: string, source: SourceSpecification) {
  if (!map.getSource(id)) map.addSource(id, source);
}

function ensureLayer(
  map: MlMap,
  layer: LayerSpecification,
  before: string | undefined,
) {
  if (!map.getLayer(layer.id)) map.addLayer(layer, before);
}

function syncAllLayers(
  map: MlMap,
  props: MapProps,
  mode: "light" | "dark",
  lang: "en" | "es",
  aggregate: (metrics: RegionScoreEntry["metrics"]) => ReturnType<typeof aggregateScoredMetrics>,
) {
  const viz = buildPalette(mode);
  const before = firstSymbolId(map);

  /* ---- regime regions ---- */
  ensureSource(map, "regions", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: props.regions.map((r) => {
        const summary = aggregate(r.metrics);
        return {
          type: "Feature",
          id: r.slug,
          properties: {
            slug: r.slug,
            name: r.name[lang],
            observed: summary.observed ?? -1,
            coverage: Math.round(summary.coverage * 100),
            selected: r.slug === props.selectedSlug ? 1 : 0,
            featured: r.featured ? 1 : 0,
          },
          geometry: { type: "Polygon", coordinates: [[...r.polygon, r.polygon[0]]] },
        };
      }),
    },
  });

  const scoreStops = [0, 25, 40, 55, 65, 80, 100].map(
    (v) => [v, viz.scoreColor(v)] as [number, string],
  );

  ensureLayer(
    map,
    {
      id: "regions-hatch",
      type: "fill",
      source: "regions",
      filter: ["any", ["<", ["get", "coverage"], 50], ["<", ["get", "observed"], 0]],
      paint: { "fill-pattern": "hatch", "fill-opacity": 0.4 },
    },
    before,
  );
  ensureLayer(
    map,
    {
      id: "regions-fill",
      type: "fill",
      source: "regions",
      filter: [">=", ["get", "observed"], 0],
      paint: {
        "fill-color": ["interpolate", ["linear"], ["get", "observed"], ...scoreStops.flat()],
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.22, 5, 0.3],
      },
    },
    before,
  );
  ensureLayer(
    map,
    {
      id: "regions-outline",
      type: "line",
      source: "regions",
      paint: {
        "line-color": [
          "case",
          ["get", "selected"],
          viz.series(1),
          mode === "dark" ? "#39424c" : "#a8aca0",
        ],
        "line-width": ["case", ["get", "selected"], 2.4, 1],
      },
    },
    before,
  );
  ensureLayer(
    map,
    {
      id: "regions-label",
      type: "symbol",
      source: "regions",
      minzoom: 3,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Medium"],
        "text-size": 10.5,
        "text-letter-spacing": 0.04,
      },
      paint: {
        "text-color": mode === "dark" ? "#c6cdd4" : "#3c4247",
        "text-halo-color": mode === "dark" ? "#0e1217" : "#f2f2ee",
        "text-halo-width": 1.4,
      },
    },
    undefined,
  );

  /* ---- plate boundaries ---- */
  ensureSource(map, "plates", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features:
        props.boundaries?.flatMap((b) =>
          b.lines.map((line) => ({
            type: "Feature",
            properties: { kind: b.kind },
            geometry: { type: "LineString", coordinates: line },
          })),
        ) ?? [],
    },
  });
  ensureLayer(
    map,
    {
      id: "plates-other",
      type: "line",
      source: "plates",
      filter: ["!=", ["get", "kind"], "convergent"],
      paint: {
        "line-color": mode === "dark" ? "#3a4550" : "#b6bab0",
        "line-width": 0.7,
        "line-opacity": 0.8,
      },
    },
    before,
  );
  ensureLayer(
    map,
    {
      id: "plates-convergent",
      type: "line",
      source: "plates",
      filter: ["==", ["get", "kind"], "convergent"],
      paint: {
        "line-color": mode === "dark" ? "#5f86b5" : "#52739c",
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.4, 6, 2.2],
      },
    },
    before,
  );

  /* ---- GEM faults (context only) ---- */
  if (props.faultsGeojson) {
    ensureSource(map, "faults", {
      type: "geojson",
      data: props.faultsGeojson as never,
    });
    ensureLayer(
      map,
      {
        id: "faults-line",
        type: "line",
        source: "faults",
        minzoom: 5,
        paint: {
          "line-color": mode === "dark" ? "#6b639b" : "#8f86c2",
          "line-width": 0.8,
          "line-opacity": 0.7,
        },
      },
      before,
    );
  }

  /* ---- earthquakes (clustered) ---- */
  ensureSource(map, "quakes", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: props.quakes.map((q) => ({
        type: "Feature",
        id: q.id,
        properties: {
          mag: q.mag,
          depthKm: q.depthKm,
          ageDays: (Date.now() - q.time) / 86_400_000,
          aftershock: q.aftershockCandidate ? 1 : 0,
          quake: JSON.stringify(q),
        },
        geometry: { type: "Point", coordinates: [q.lon, q.lat] },
      })),
    },
    cluster: true,
    clusterMaxZoom: 4.5,
    clusterRadius: 44,
    clusterProperties: {
      maxMag: ["max", ["get", "mag"]],
    },
  });

  const depthStops = [0, 25, 70, 150, 300, 500, 700].map(
    (v) => [v, viz.depthColor(v)] as [number, string],
  );

  ensureLayer(
    map,
    {
      id: "quakes-clusters",
      type: "circle",
      source: "quakes",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": mode === "dark" ? "#1d2733" : "#e3e8ee",
        "circle-opacity": 0.85,
        "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 9, 25, 14, 100, 20, 500, 27],
        "circle-stroke-color": viz.series(1),
        "circle-stroke-width": 1.2,
        "circle-stroke-opacity": 0.7,
      },
    },
    before,
  );
  ensureLayer(
    map,
    {
      id: "quakes-cluster-count",
      type: "symbol",
      source: "quakes",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Medium"],
        "text-size": 10,
      },
      paint: {
        "text-color": mode === "dark" ? "#c6cdd4" : "#3c4247",
      },
    },
    before,
  );
  ensureLayer(
    map,
    {
      id: "quakes-circle",
      type: "circle",
      source: "quakes",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "mag"],
          2, 2.2,
          4, 4,
          5, 6,
          6, 9,
          7, 13,
          8, 19,
          9, 26,
        ],
        "circle-color": [
          "interpolate",
          ["linear"],
          ["get", "depthKm"],
          ...depthStops.flat(),
        ],
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["get", "ageDays"],
          0, 0.95,
          14, 0.85,
          90, 0.6,
        ],
        "circle-stroke-color": mode === "dark" ? "#0e1217" : "#fbfbfa",
        "circle-stroke-width": ["case", ["get", "aftershock"], 1.6, 0.6],
        "circle-stroke-opacity": 0.9,
      },
    },
    before,
  );

  /* ---- volcanoes ---- */
  ensureSource(map, "volcanoes", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features:
        props.volcanoes?.map((v) => ({
          type: "Feature",
          id: v.id,
          properties: { state: v.activityState, volcano: JSON.stringify(v) },
          geometry: { type: "Point", coordinates: [v.lon, v.lat] },
        })) ?? [],
    },
  });
  ensureLayer(
    map,
    {
      id: "volcanoes-circle",
      type: "circle",
      source: "volcanoes",
      paint: {
        "circle-radius": [
          "match",
          ["get", "state"],
          "recent-eruption",
          6,
          "historical",
          4.2,
          3,
        ],
        "circle-color": [
          "match",
          ["get", "state"],
          "recent-eruption",
          viz.series(2),
          "historical",
          viz.series(3),
          mode === "dark" ? "#5b636b" : "#a9aeb3",
        ],
        "circle-opacity": 0.9,
        "circle-stroke-color": mode === "dark" ? "#0e1217" : "#fbfbfa",
        "circle-stroke-width": 1,
      },
    },
    before,
  );

  /* ---- GNSS stations ---- */
  ensureSource(map, "gnss", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: props.gnssStations.map((s) => ({
        type: "Feature",
        properties: {
          z: s.robustZ ?? -1,
          station: JSON.stringify(s),
        },
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      })),
    },
  });
  ensureLayer(
    map,
    {
      id: "gnss-circle",
      type: "circle",
      source: "gnss",
      paint: {
        "circle-radius": 4.5,
        "circle-color": [
          "case",
          ["<", ["get", "z"], 0],
          mode === "dark" ? "#5b636b" : "#a9aeb3",
          [">=", ["get", "z"], 2.5],
          viz.series(2),
          viz.series(1),
        ],
        "circle-stroke-color": mode === "dark" ? "#0e1217" : "#fbfbfa",
        "circle-stroke-width": 1.2,
      },
    },
    before,
  );

  applyVisibility(map, props.layers);
}

function applyVisibility(map: MlMap, layers: LayerToggles) {
  const vis = (v: boolean): VisibilitySpecification => (v ? "visible" : "none");
  for (const [id, on] of [
    ["quakes-circle", layers.earthquakes],
    ["quakes-clusters", layers.earthquakes],
    ["quakes-cluster-count", layers.earthquakes],
    ["plates-convergent", layers.plates],
    ["plates-other", layers.plates],
    ["faults-line", layers.faults],
    ["volcanoes-circle", layers.volcanoes],
    ["gnss-circle", layers.gnss],
    ["regions-fill", layers.regime],
    ["regions-hatch", layers.regime],
    ["regions-outline", layers.regime],
    ["regions-label", layers.regime],
  ] as const) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(on));
  }
}

/* ==================================================================== */
/* interaction                                                           */
/* ==================================================================== */

function handleMapClick(
  map: MlMap,
  e: MapMouseEvent,
  setPopover: (p: Popover) => void,
) {
  const point = e.point;
  const pick = (layer: string) =>
    map.queryRenderedFeatures(point, { layers: [layer] })[0];

  const quake = pick("quakes-circle");
  if (quake) {
    const q = JSON.parse(quake.properties!.quake) as QuakeEvent;
    setPopover({ kind: "quake", lngLat: e.lngLat, quake: q });
    return;
  }
  const cluster = pick("quakes-clusters");
  if (cluster) {
    const src = map.getSource("quakes") as GeoJSONSource;
    const coords = (cluster.geometry as unknown as { coordinates: [number, number] }).coordinates;
    void src
      .getClusterExpansionZoom(cluster.properties!.cluster_id)
      .then((z: number) => {
        map.easeTo({ center: coords, zoom: z + 0.2 });
      });
    return;
  }
  const volcano = pick("volcanoes-circle");
  if (volcano) {
    const v = JSON.parse(volcano.properties!.volcano) as Volcano;
    setPopover({ kind: "volcano", lngLat: e.lngLat, volcano: v });
    return;
  }
  const station = pick("gnss-circle");
  if (station) {
    const s = JSON.parse(station.properties!.station) as GnssStation;
    setPopover({ kind: "station", lngLat: e.lngLat, station: s });
    return;
  }
  const region = pick("regions-fill") ?? pick("regions-hatch");
  if (region && region.properties) {
    // parent holds RegionScoreEntry list
    const slug = region.properties.slug as string;
    const entry = (propsRegionsCache.get(slug));
    if (entry) {
      setPopover({ kind: "region", lngLat: e.lngLat, region: entry });
    }
    return;
  }
  setPopover(null);
}

const propsRegionsCache = new Map<string, RegionScoreEntry>();
export function registerRegionsForClick(regions: RegionScoreEntry[]) {
  propsRegionsCache.clear();
  for (const r of regions) propsRegionsCache.set(r.slug, r);
}

function positionPopover(
  map: MlMap,
  lngLat: LngLat,
  set: (p: { x: number; y: number }) => void,
) {
  const p = map.project(lngLat);
  set({ x: p.x, y: p.y });
}

/* ==================================================================== */
/* popover UI                                                            */
/* ==================================================================== */

function MapPopover({
  popover,
  pos,
  onClose,
  onSelectRegion,
}: {
  popover: NonNullable<Popover>;
  pos: { x: number; y: number };
  onClose: () => void;
  onSelectRegion: (slug: string) => void;
}) {
  const { t, formatTime, formatNumber, lang } = useI18n();
  const { aggregate } = useResearchConfig();
  const style: React.CSSProperties = {
    position: "absolute",
    left: pos.x,
    top: pos.y,
    transform: "translate(-50%, calc(-100% - 14px))",
  };

  return (
    <div
      style={style}
      className="pointer-events-auto z-30 w-64 rounded-lg border border-line bg-surface-2 p-3 shadow-xl"
      role="dialog"
      aria-label={t("map.title")}
    >
      <button
        onClick={onClose}
        className="absolute right-1.5 top-1.5 rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
        aria-label={t("common.close")}
      >
        <span aria-hidden className="text-xs leading-none">
          ✕
        </span>
      </button>

      {popover.kind === "quake" && (
        <div className="space-y-1.5 text-xs text-ink-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-ink">
              M {formatNumber(popover.quake.mag, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="tnum">
              {formatNumber(popover.quake.depthKm)} {t("region.charts.depth").toLowerCase()}
            </span>
          </div>
          <p className="text-ink">{popover.quake.place}</p>
          <p className="tnum">{formatTime(popover.quake.time)}</p>
          <p className="tnum text-[11px] text-ink-3">
            {popover.quake.lat.toFixed(2)}°, {popover.quake.lon.toFixed(2)}°
          </p>
          <p className={popover.quake.aftershockCandidate ? "text-[var(--viz-2)]" : "text-ink-2"}>
            {popover.quake.aftershockCandidate
              ? `◎ ${t("map.popover.aftershockYes")}`
              : t("map.popover.aftershockNo")}
          </p>
          {popover.quake.url && (
            <a
              href={popover.quake.url}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {t("map.popover.usgsLink")} ↗
            </a>
          )}
        </div>
      )}

      {popover.kind === "volcano" && (
        <div className="space-y-1.5 text-xs text-ink-2">
          <div className="font-semibold text-ink">{popover.volcano.name}</div>
          <p>
            {popover.volcano.country} · {popover.volcano.type ?? "—"}
          </p>
          <p>
            {t("region.volcanoes.lastEruption")}:{" "}
            <span className="tnum">
              {popover.volcano.lastEruptionYear != null
                ? popover.volcano.lastEruptionYear > 0
                  ? popover.volcano.lastEruptionYear
                  : `${Math.abs(popover.volcano.lastEruptionYear)} BCE`
                : t("common.unknown")}
            </span>
          </p>
          <p className="text-[10px] leading-snug text-ink-3">
            {t("map.popover.volcanoDisclaimer")}
          </p>
        </div>
      )}

      {popover.kind === "station" && (
        <div className="space-y-1.5 text-xs text-ink-2">
          <div className="font-semibold text-ink">
            {popover.station.id} <span className="text-ink-3">GNSS</span>
          </div>
          <p className="tnum">
            {t("map.popover.stationZ")}:{" "}
            <span className="font-semibold text-ink">
              {popover.station.robustZ != null
                ? formatNumber(popover.station.robustZ, { maximumFractionDigits: 2 })
                : t("common.unknown")}
            </span>
          </p>
          {popover.station.dataSpanDays && (
            <p className="tnum">
              {t("map.popover.stationSpan")}: {formatNumber(popover.station.dataSpanDays)}{" "}
              {t("common.days")}
            </p>
          )}
          <p className="tnum text-[11px] text-ink-3">
            {popover.station.lat.toFixed(3)}°, {popover.station.lon.toFixed(3)}°
          </p>
        </div>
      )}

      {popover.kind === "region" && (
        <div className="space-y-1.5 text-xs text-ink-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">
              {popover.region.name[lang]}
            </span>
            {popover.region.featured && (
              <span className="rounded border border-accent/40 px-1 text-[9px] font-semibold uppercase tracking-wide text-accent">
                ★
              </span>
            )}
          </div>
          <p className="text-[11px]">{popover.region.platePair[lang]}</p>
          <p className="tnum">
            {t("map.popover.regionScore")}:{" "}
            <span className="font-semibold text-ink">
              {(() => {
                const s = aggregate(popover.region.metrics);
                return s.observed != null ? formatNumber(Math.round(s.observed)) : "—";
              })()}
            </span>
          </p>
          <p className="tnum">
            {t("map.popover.regionCoverage")}:{" "}
            {formatNumber(Math.round(aggregate(popover.region.metrics).coverage * 100))}%
          </p>
          <button
            onClick={() => onSelectRegion(popover.region.slug)}
            className="mt-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-strong"
          >
            {t("map.popover.openRegion")} →
          </button>
        </div>
      )}
    </div>
  );
}
