"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  DataHealth,
  QuakeEvent,
  ScoreSummary,
  ScoredMetric,
  EnsoState,
} from "@/types";
import type { RegionDetail, RegionScoreEntry, GlobalScores } from "@/data/scores";
import type { Boundary } from "@/data/adapters/usgs-plates";
import type { Volcano } from "@/types";

export type TimeWindow = "24h" | "7d" | "30d" | "90d";

export interface QuakeFeed {
  window: TimeWindow;
  mode: string;
  fetchedAt: string;
  observedAt: string | null;
  count: number;
  events: Array<
    QuakeEvent & {
      nearestRegion: { slug: string; distanceKm: number } | null;
    }
  >;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} → HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useEarthquakes(window: TimeWindow) {
  return useQuery({
    queryKey: ["earthquakes", window],
    queryFn: () => json<QuakeFeed>(`/api/earthquakes?window=${window}`),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

export interface ScoredRegionsPayload extends GlobalScores {
  largest7d: QuakeEvent[];
  largest30d: QuakeEvent[];
  health: DataHealth[];
}

export function useScoredRegions() {
  return useQuery({
    queryKey: ["scored-regions"],
    queryFn: () => json<ScoredRegionsPayload>("/api/scored-regions"),
    staleTime: 5 * 60_000,
    refetchInterval: (query) =>
      query.state.data?.complete ? 10 * 60_000 : 30_000,
  });
}

export function useRegionDetail(slug: string | null, asOf?: string) {
  return useQuery({
    queryKey: ["region-detail", slug, asOf ?? null],
    queryFn: () =>
      json<RegionDetail>(
        `/api/regions/${slug}${asOf ? `?asOf=${asOf}` : ""}`,
      ),
    enabled: !!slug,
    staleTime: 10 * 60_000,
  });
}

export function usePlates() {
  return useQuery({
    queryKey: ["plates"],
    queryFn: () =>
      json<{
        mode: string;
        fetchedAt: string;
        boundaries: Boundary[];
        faults: { mode: string; featureCount: number; geojson: object } | null;
      }>("/api/plates"),
    staleTime: 24 * 60 * 60_000,
  });
}

export function useVolcanoes() {
  return useQuery({
    queryKey: ["volcanoes"],
    queryFn: () =>
      json<{
        mode: string;
        fetchedAt: string;
        count: number;
        volcanoes: Volcano[];
      }>("/api/volcanoes"),
    staleTime: 12 * 60 * 60_000,
  });
}

export interface GnssStationResponse {
  station: string;
  mode: string;
  fetchedAt: string;
  anomaly: { zEast: number; zNorth: number; zHorizontal: number } | null;
  series: Array<[number, number, number]>;
}

export function useGnssStation(station: string | null) {
  return useQuery({
    queryKey: ["gnss-station", station],
    queryFn: () => json<GnssStationResponse>(`/api/gnss/${station}`),
    enabled: !!station,
    staleTime: 60 * 60_000,
  });
}

export function useDataHealth() {
  return useQuery({
    queryKey: ["data-health"],
    queryFn: () =>
      json<{
        checkedAt: string;
        health: DataHealth[];
        policies: Array<{ source: string; cache: string; note: string }>;
      }>("/api/data-health"),
    staleTime: 60_000,
  });
}

/** re-exported types for components */
export type { ScoreSummary, ScoredMetric, RegionScoreEntry, EnsoState };
