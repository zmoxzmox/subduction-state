"use client";

import { useTheme } from "next-themes";

/**
 * Visualization color system — the validated palette as runtime ramps.
 * Score = sequential blue; coverage & depth = sequential orange (second
 * sequential context). Dark mode flips ramp anchors (strong = lighter).
 */

const BLUE_LIGHT = [
  [0, "#e8f0fc"],
  [25, "#cde2fb"],
  [40, "#9ec5f4"],
  [55, "#6da7ec"],
  [65, "#3987e5"],
  [80, "#256abf"],
  [100, "#104281"],
] as const;

const BLUE_DARK = [
  [0, "#101a29"],
  [25, "#10315c"],
  [40, "#1c5cab"],
  [55, "#2a78d6"],
  [65, "#3987e5"],
  [80, "#86b6ef"],
  [100, "#cde2fb"],
] as const;

const ORANGE_LIGHT = [
  [0, "#fdeee6"],
  [25, "#facdb6"],
  [50, "#f4a778"],
  [75, "#eb6834"],
  [100, "#b23c10"],
] as const;

const ORANGE_DARK = [
  [0, "#221410"],
  [25, "#4a2314"],
  [50, "#8a3c14"],
  [75, "#d95926"],
  [100, "#f4a778"],
] as const;

function ramp(stops: readonly (readonly [number, string])[], t: number): string {
  const x = Math.min(100, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, c0] = stops[i];
    const [x1, c1] = stops[i + 1];
    if (x <= x1) {
      const f = (x - x0) / (x1 - x0);
      return mix(c0, c1, f);
    }
  }
  return stops[stops.length - 1][1];
}

function mix(a: string, b: string, f: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * f));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export interface VizPalette {
  mode: "light" | "dark";
  scoreColor: (score: number) => string;
  coverageColor: (coveragePct: number) => string;
  depthColor: (depthKm: number) => string;
  series: (slot: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => string;
  grid: string;
  axisText: string;
  ink: string;
  ink2: string;
  surface: string;
  status: {
    good: string;
    warning: string;
    serious: string;
    critical: string;
  };
}

export function useViz(): VizPalette {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return buildPalette(dark ? "dark" : "light");
}

export function buildPalette(mode: "light" | "dark"): VizPalette {
  const dark = mode === "dark";
  const cat = dark
    ? ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
    : ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
  return {
    mode,
    scoreColor: (s) => ramp(dark ? BLUE_DARK : BLUE_LIGHT, s),
    coverageColor: (p) => ramp(dark ? ORANGE_DARK : ORANGE_LIGHT, p),
    depthColor: (d) =>
      ramp(dark ? ORANGE_DARK : ORANGE_LIGHT, Math.min(100, (d / 300) * 100)),
    series: (slot) => cat[slot - 1],
    grid: dark ? "#232930" : "#e1e0d9",
    axisText: dark ? "#7b838c" : "#7d8388",
    ink: dark ? "#e8eaee" : "#16181d",
    ink2: dark ? "#a9b0b7" : "#4c5157",
    surface: dark ? "#12161b" : "#fbfbfa",
    status: {
      good: "#0ca30c",
      warning: "#fab219",
      serious: "#ec835a",
      critical: "#d03b3b",
    },
  };
}
