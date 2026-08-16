import fs from "node:fs";
import path from "node:path";
import type { PayloadMode } from "@/types";
import { healthRegistry } from "./health";

/**
 * Cached, timeout-bounded fetch with a documented fallback chain:
 *
 *   live upstream → in-memory cache → on-disk cache (stale, labeled) → fixture
 *
 * Every payload records its provenance (`mode`) so the UI can display
 * "live", "cached" or "Cached demo snapshot" honestly. Upstream
 * failures never crash a request — they degrade to the next tier.
 */

export interface FetchResult<T> {
  data: T;
  mode: PayloadMode;
  fetchedAt: string;
  /** age of the underlying observation when known (epoch ms) */
  observedAt?: string | null;
  error?: string;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  observedAt?: string | null;
}

const memory = new Map<string, CacheEntry<unknown>>();
const CACHE_DIR = path.join(process.cwd(), ".cache", "upstream");

function diskPath(key: string): string {
  return path.join(CACHE_DIR, `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

function readDisk<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = fs.readFileSync(diskPath(key), "utf8");
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeDisk<T>(key: string, entry: CacheEntry<T>): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(diskPath(key), JSON.stringify(entry));
  } catch {
    // cache writes are best-effort
  }
}

export function getMemoryCache<T>(key: string): CacheEntry<T> | null {
  return (memory.get(key) as CacheEntry<T> | undefined) ?? null;
}

export interface CachedFetchOptions {
  /** cache key; also used for the on-disk file */
  key: string;
  /** fresh for this many ms */
  ttlMs: number;
  /** data source name for the health registry */
  source: string;
  /** read the latest observation timestamp out of the payload */
  observedAt?: (data: unknown) => string | null;
  /** optional fixture loader (last-resort fallback, clearly labeled) */
  fixture?: () => unknown | null;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** treat any upstream response as fixture-eligible demo snapshot */
  init?: RequestInit;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "SubductionState/0.1 (research prototype; contact: project repository)",
        Accept: "application/json,*/*",
        ...headers,
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export class UpstreamError extends Error {}

/**
 * Fetch an upstream URL through the cache/fallback chain. `parse`
 * validates with Zod; a parse failure counts as an upstream failure.
 */
export async function cachedFetch<T>(
  url: string,
  parse: (raw: unknown) => T,
  opts: CachedFetchOptions,
): Promise<FetchResult<T>> {
  const now = Date.now();
  const mem = memory.get(opts.key) as CacheEntry<T> | undefined;
  if (mem && now - mem.fetchedAt < opts.ttlMs) {
    return {
      data: mem.data,
      mode: now - mem.fetchedAt < opts.ttlMs / 3 ? "live" : "cached",
      fetchedAt: new Date(mem.fetchedAt).toISOString(),
      observedAt: mem.observedAt ?? null,
    };
  }

  const fail = async (message: string): Promise<FetchResult<T>> => {
    // stale memory cache, then disk cache, then fixture
    if (mem) {
      healthRegistry.record(opts.source, "stale", "cached", message);
      return {
        data: mem.data,
        mode: "cached",
        fetchedAt: new Date(mem.fetchedAt).toISOString(),
        observedAt: mem.observedAt ?? null,
        error: message,
      };
    }
    const disk = readDisk<T>(opts.key);
    if (disk) {
      healthRegistry.record(opts.source, "stale", "cached", message);
      return {
        data: disk.data,
        mode: "cached",
        fetchedAt: new Date(disk.fetchedAt).toISOString(),
        observedAt: disk.observedAt ?? null,
        error: message,
      };
    }
    if (opts.fixture) {
      const fixtureData = opts.fixture();
      if (fixtureData != null) {
        const parsed = parse(fixtureData);
        healthRegistry.record(opts.source, "stale", "fixture", message);
        return {
          data: parsed,
          mode: "fixture",
          fetchedAt: new Date().toISOString(),
          observedAt: null,
          error: message,
        };
      }
    }
    healthRegistry.record(opts.source, "failed", "unknown", message);
    throw new UpstreamError(`${opts.source}: ${message}`);
  };

  try {
    const res = await fetchWithTimeout(
      url,
      opts.timeoutMs ?? 12_000,
      opts.headers,
      opts.init,
    );
    if (!res.ok) {
      return fail(`upstream HTTP ${res.status}`);
    }
    const text = await res.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = text; // some endpoints return text (counts, ascii indices)
    }
    let data: T;
    try {
      data = parse(raw);
    } catch (e) {
      return fail(`payload validation failed: ${String(e).slice(0, 160)}`);
    }
    const observedAt = opts.observedAt?.(data) ?? null;
    const entry: CacheEntry<T> = { data, fetchedAt: now, observedAt };
    memory.set(opts.key, entry);
    writeDisk(opts.key, entry);
    healthRegistry.record(opts.source, "healthy", "live", undefined, observedAt);
    return {
      data,
      mode: "live",
      fetchedAt: new Date().toISOString(),
      observedAt,
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "fetch failed");
  }
}

export function clearCache(): void {
  memory.clear();
}
