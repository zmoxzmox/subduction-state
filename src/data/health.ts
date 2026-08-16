import type { DataHealth, HealthStatus, PayloadMode } from "@/types";

/**
 * Central health registry: every adapter records the outcome of its
 * last fetch here, surfaced on /data.
 */

interface HealthRecord extends Omit<DataHealth, "lastFetch" | "latestObservation"> {
  lastFetch: string | null;
  latestObservation: string | null;
}

class HealthRegistry {
  private records = new Map<string, HealthRecord>();

  record(
    source: string,
    status: HealthStatus,
    mode: PayloadMode,
    message?: string,
    latestObservation?: string | null,
  ): void {
    this.records.set(source, {
      source,
      status,
      mode,
      message,
      lastFetch: new Date().toISOString(),
      latestObservation: latestObservation ?? this.records.get(source)?.latestObservation ?? null,
    });
  }

  /** mark a source that was never even attempted this session */
  ensure(source: string): void {
    if (!this.records.has(source)) {
      this.records.set(source, {
        source,
        status: "unknown",
        mode: "unknown",
        message: undefined,
        lastFetch: null,
        latestObservation: null,
      });
    }
  }

  snapshot(): DataHealth[] {
    return [...this.records.values()].map((r) => ({ ...r }));
  }
}

export const healthRegistry = new HealthRegistry();

export function describeStaleness(
  lastFetch: string | null,
  maxAgeMs: number,
): { status: HealthStatus; ageMinutes: number | null } {
  if (!lastFetch) return { status: "unknown", ageMinutes: null };
  const age = Date.now() - new Date(lastFetch).getTime();
  return {
    status: age > maxAgeMs * 4 ? "stale" : "healthy",
    ageMinutes: Math.round(age / 60_000),
  };
}
