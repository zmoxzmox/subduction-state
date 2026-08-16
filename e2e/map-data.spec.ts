import { test, expect, type Page } from "@playwright/test";

/**
 * Regression tests for map-source freshness: sources must receive NEW
 * data when windows/filters change and when async data arrives after
 * the map was already created (previously ensureSource never called
 * setData, so the map silently kept stale geometry).
 */

interface MapDebug {
  quakeCount: number;
  window: string;
  regionCount: number;
  volcanoCount: number;
}

async function mapDebug(page: Page): Promise<MapDebug | null> {
  return page.evaluate(
    () =>
      (window as unknown as { __mapDebug?: MapDebug }).__mapDebug ?? null,
  );
}

/** the map filter row's time-window group (the dashboard panel has one too) */
function mapTimeGroup(page: Page) {
  return page.getByRole("radiogroup", { name: "Time window" }).first();
}

test.describe("map data freshness", () => {
  test("switching time window updates the earthquake source", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(async () => (await mapDebug(page))?.window, { timeout: 30_000, intervals: [1000] })
      .toBe("24h");
    const n24 = (await mapDebug(page))!.quakeCount;
    expect(n24).toBeGreaterThan(10); // live or fixture — both have events

    // switch to 7 d: the sync must push a different event set
    await mapTimeGroup(page).getByRole("radio", { name: "7 d" }).click();
    await expect
      .poll(async () => (await mapDebug(page))?.window, { timeout: 30_000, intervals: [1000] })
      .toBe("7d");
    const n7 = (await mapDebug(page))!.quakeCount;
    expect(n7).not.toBe(n24);
    // a week of data holds at least as many events as a day
    expect(n7).toBeGreaterThanOrEqual(n24);
  });

  test("magnitude filter is applied to the data, not just the layers", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

    await mapTimeGroup(page).getByRole("radio", { name: "7 d" }).click();
    await expect
      .poll(async () => (await mapDebug(page))?.window, { timeout: 30_000, intervals: [1000] })
      .toBe("7d");
    const all = (await mapDebug(page))!.quakeCount;
    expect(all).toBeGreaterThan(50);

    // M6+ — the pushed event set itself shrinks (clusters therefore
    // also reflect exactly the visible set)
    await page.getByRole("radio", { name: "M6+" }).click();
    await expect
      .poll(async () => (await mapDebug(page))?.quakeCount, {
        timeout: 20_000,
        intervals: [800],
      })
      .toBeLessThan(all);
  });

  test("async layers (regions, volcanoes) populate after map creation", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

    // region scores and the volcano db arrive after the map exists —
    // the sync must push them into the already-created sources
    // generous budget: a cold server computes regional scores in the
    // background while the client polls (15 s) until complete
    await expect
      .poll(async () => (await mapDebug(page))?.regionCount, {
        timeout: 150_000,
        intervals: [3000],
      })
      .toBeGreaterThanOrEqual(20);
    await expect
      .poll(async () => (await mapDebug(page))?.volcanoCount, {
        timeout: 30_000,
        intervals: [1500],
      })
      .toBeGreaterThan(500);
  });
});
