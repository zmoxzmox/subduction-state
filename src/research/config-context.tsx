"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { MetricId, ScoreSummary, ScoredMetric } from "@/types";
import {
  CANONICAL_CONFIG,
  isCanonical,
  validateConfig,
  type ResearchConfig,
} from "@/scoring/config";
import { CANONICAL_WEIGHTS, METRIC_IDS } from "@/scoring/weights";
import { aggregateScoredMetrics } from "@/scoring/score";

const STORAGE_KEY = "subduction-state:research-config";

interface ResearchConfigContextValue {
  config: ResearchConfig;
  isCustom: boolean;
  setWeight: (id: MetricId, value: number) => void;
  toggleMetric: (id: MetricId, enabled: boolean) => void;
  update: (partial: Partial<ResearchConfig>) => void;
  reset: () => void;
  importJson: (json: string) => boolean;
  exportJson: () => string;
  /** re-aggregate server metrics with the active (custom) weights */
  aggregate: (metrics: ScoredMetric[]) => ScoreSummary;
}

const ResearchConfigContext = createContext<ResearchConfigContextValue | null>(null);

/** Set one weight and redistribute the delta proportionally over the rest. */
function withWeight(
  config: ResearchConfig,
  id: MetricId,
  value: number,
): ResearchConfig {
  const weights = { ...config.weights };
  const others = METRIC_IDS.filter((m) => m !== id);
  const oldOthersTotal = others.reduce((s, m) => s + weights[m], 0);
  const delta = value - weights[id];
  weights[id] = value;
  if (oldOthersTotal > 0) {
    const scale = (oldOthersTotal - delta) / oldOthersTotal;
    for (const m of others) weights[m] = Math.round(weights[m] * scale * 10) / 10;
  } else {
    // everything else was 0 — spread the remainder evenly
    for (const m of others) weights[m] = Math.round(((100 - value) / others.length) * 10) / 10;
  }
  // final nudge to land exactly on 100
  const total = METRIC_IDS.reduce((s, m) => s + weights[m], 0);
  weights[others[0]] = Math.round((weights[others[0]] + (100 - total)) * 10) / 10;
  return { ...config, weights };
}

/** Disable/enable a metric with proportional redistribution. */
function withToggledMetric(
  config: ResearchConfig,
  id: MetricId,
  enabled: boolean,
): ResearchConfig {
  const disabled = new Set(config.disabledMetrics);
  const weights = { ...CANONICAL_WEIGHTS };
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  const active = METRIC_IDS.filter((m) => !disabled.has(m));
  if (active.length === 0) return config;
  // start from current weight distribution among active metrics, renormalised to 100
  const activeTotal = active.reduce((s, m) => s + (config.weights[m] ?? 0), 0);
  if (activeTotal <= 0) {
    const even = Math.round((100 / active.length) * 10) / 10;
    for (const m of active) weights[m] = even;
  } else {
    for (const m of active) {
      weights[m] = Math.round(((config.weights[m] / activeTotal) * 100) * 10) / 10;
    }
  }
  const total = active.reduce((s, m) => s + weights[m], 0);
  weights[active[0]] = Math.round((weights[active[0]] + (100 - total)) * 10) / 10;
  for (const m of METRIC_IDS) {
    if (disabled.has(m)) weights[m] = 0;
  }
  return { ...config, disabledMetrics: [...disabled], weights };
}

export function ResearchConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ResearchConfig>(CANONICAL_CONFIG);

  // one-time restore of the persisted research configuration
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = validateConfig(JSON.parse(raw));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore
      if (parsed) setConfig(parsed);
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    try {
      if (isCanonical(config)) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  const setWeight = useCallback((id: MetricId, value: number) => {
    setConfig((c) => withWeight(c, id, Math.min(100, Math.max(0, value))));
  }, []);

  const toggleMetric = useCallback((id: MetricId, enabled: boolean) => {
    setConfig((c) => withToggledMetric(c, id, enabled));
  }, []);

  const update = useCallback((partial: Partial<ResearchConfig>) => {
    setConfig((c) => validateConfig({ ...c, ...partial }) ?? c);
  }, []);

  const reset = useCallback(() => setConfig(CANONICAL_CONFIG), []);

  const importJson = useCallback((json: string): boolean => {
    try {
      const parsed = validateConfig(JSON.parse(json));
      if (!parsed) return false;
      setConfig(parsed);
      return true;
    } catch {
      return false;
    }
  }, []);

  const exportJson = useCallback(() => JSON.stringify(config, null, 2), [config]);

  const aggregate = useCallback(
    (metrics: ScoredMetric[]) => aggregateScoredMetrics(metrics, config.weights),
    [config],
  );

  const value = useMemo<ResearchConfigContextValue>(
    () => ({
      config,
      isCustom: !isCanonical(config),
      setWeight,
      toggleMetric,
      update,
      reset,
      importJson,
      exportJson,
      aggregate,
    }),
    [config, setWeight, toggleMetric, update, reset, importJson, exportJson, aggregate],
  );

  return (
    <ResearchConfigContext.Provider value={value}>
      {children}
    </ResearchConfigContext.Provider>
  );
}

export function useResearchConfig(): ResearchConfigContextValue {
  const ctx = useContext(ResearchConfigContext);
  if (!ctx) throw new Error("useResearchConfig must be used within ResearchConfigProvider");
  return ctx;
}
