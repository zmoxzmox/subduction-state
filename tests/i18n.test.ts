import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import es from "@/i18n/es.json";
import { translate, translateList } from "@/i18n";
import { describeStaleness } from "@/data/health";

/** Recursively collect leaf key paths. */
function leafPaths(obj: unknown, prefix = ""): string[] {
  if (obj == null || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) return leafPaths(v, p);
    return [p];
  });
}

describe("translations", () => {
  it("ES dictionary has every EN key (and no extras)", () => {
    const enPaths = leafPaths(en).sort();
    const esPaths = leafPaths(es).sort();
    expect(esPaths).toEqual(enPaths);
  });

  it("no empty strings", () => {
    for (const [k, v] of Object.entries(flatten(en))) expect(v.length, k).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(flatten(es))) expect(v.length, k).toBeGreaterThan(0);
  });

  it("interpolates params", () => {
    expect(translate("en", "home.pendingRegions", { count: 3 })).toContain("3");
    expect(translate("es", "home.pendingRegions", { count: 3 })).toContain("3");
    expect(translate("es", "home.pendingRegions", { count: 3 })).toMatch(/región/);
  });

  it("falls back to EN for a missing path", () => {
    expect(translate("es", "app.name")).toBe("Subduction State");
  });

  it("spec terminology is respected in ES", () => {
    expect(translate("es", "score.regimeMatch")).toBe("Coincidencia con el régimen");
    expect(translate("es", "score.coverage")).toBe("Cobertura de datos");
    expect(translate("es", "evidence.title")).toBe("Evidencia");
    expect(translate("es", "metrics.gnssTransient.fullName")).toContain("GNSS");
    expect(translate("es", "badges.missing")).toBe("Faltante");
    expect(translate("es", "badges.live")).toBe("En vivo");
    expect(translate("es", "score.band.substantial")).toBe("Coincidencia sustancial");
    expect(translate("es", "score.coverageBand.good")).toBe("Buena");
  });

  it("translates lists", () => {
    expect(translateList("en", "data.attribution").length).toBeGreaterThanOrEqual(8);
    expect(translateList("es", "data.attribution").length).toBe(
      translateList("en", "data.attribution").length,
    );
  });
});

function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, p));
    } else if (typeof v === "string") {
      out[p] = v;
    }
  }
  return out;
}

describe("data freshness", () => {
  it("classifies staleness", () => {
    const now = new Date().toISOString();
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    expect(describeStaleness(null, 1000).status).toBe("unknown");
    expect(describeStaleness(now, 3_600_000).status).toBe("healthy");
    expect(describeStaleness(hourAgo, 3_600_000).status).toBe("healthy");
    expect(describeStaleness(weekAgo, 3_600_000).status).toBe("stale");
    expect(describeStaleness(hourAgo, 3_600_000).ageMinutes).toBe(60);
  });
});
