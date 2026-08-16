import { test, expect } from "@playwright/test";

/**
 * Spec §47 smoke tests. The app must work with live upstreams OR
 * fixture fallback — both count as a pass (fixtures are labeled).
 */

test.describe("Subduction State — smoke", () => {
  test("1. homepage loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Global subduction observatory|Observatorio global/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/not earthquake predictions|no predicen terremotos/i).first()).toBeVisible();
  });

  test("2. map renders", async ({ page }) => {
    await page.goto("/");
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    // a real rendered map: sized canvas + attribution control
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    expect(box?.height ?? 0).toBeGreaterThan(200);
    await expect(page.locator(".maplibregl-ctrl-attrib").first()).toBeVisible();
  });

  test("3. earthquakes appear or fixture fallback activates", async ({ page }) => {
    const res = await page.request.get("/api/earthquakes?window=24h");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // live data or clearly-labeled snapshot — never silent emptiness
    if (body.mode === "fixture") {
      expect(body.events.length).toBeGreaterThan(20);
    } else {
      expect(body.events.length).toBeGreaterThan(10);
    }
    expect(typeof body.mode).toBe("string");
  });

  test("4. Central Peru / Lima is selectable", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    const lima = page.getByRole("link", { name: /Central Peru|Perú central/i }).first();
    await expect(lima).toBeVisible({ timeout: 120_000 });
  });

  test("5. region page loads", async ({ page }) => {
    await page.goto("/region/central-peru-lima");
    await expect(
      page.getByRole("heading", { name: /Central Peru \/ Lima|Perú central \/ Lima/i }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Observed-data similarity|Similitud con datos observados/i)).toBeVisible();
    await expect(page.getByText(/Data coverage|Cobertura de datos/i).first()).toBeVisible();
  });

  test("6. score breakdown opens with evidence", async ({ page }) => {
    await page.goto("/region/central-peru-lima");
    const firstMetric = page.getByRole("button", { name: /Megathrust coupling|Acoplamiento de la megafalla/i }).first();
    await expect(firstMetric).toBeVisible({ timeout: 90_000 });
    await firstMetric.click();
    await expect(page.getByText(/Sources|Fuentes/i).first()).toBeVisible();
    // curated provenance must be visible
    await expect(
      page.getByText(/curated research prior|a priori de investigación curado/i).first(),
    ).toBeVisible();
  });

  test("7. EN → ES works", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "ES" }).click();
    // disclaimer banner flips to Spanish
    await expect(
      page.getByText("Interfaz experimental de investigación geofísica").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.goto("/methodology");
    await expect(
      page.getByRole("heading", { name: /Metodología y limitaciones científicas/i }),
    ).toBeVisible();
    // persisted
    await page.reload();
    await expect(
      page.getByText("Interfaz experimental de investigación geofísica").first(),
    ).toBeVisible();
  });

  test("8. light → dark works", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await page.waitForTimeout(600);
    const initial = (await html.getAttribute("class")) ?? "";
    await page.getByRole("button", { name: /Theme: /i }).click();
    await expect(html).not.toHaveClass(initial, { timeout: 10_000 });
  });

  test("9. research mode changes weights", async ({ page }) => {
    await page.goto("/research");
    await expect(
      page.getByRole("heading", { name: /Research mode|Modo investigación/i }),
    ).toBeVisible();
    // raise Megathrust coupling to 40 (auto-redistributes)
    const couplingSlider = page.locator("#w-couplingAsperity");
    await expect(couplingSlider).toBeVisible();
    await couplingSlider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, "40");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(
      page.locator("#main").getByText(
        /Custom research configuration|Configuración de investigación personalizada/i,
      ),
    ).toBeVisible({ timeout: 10_000 });
    // weight total still 100
    await expect(page.getByText(/Total: 100(\.0)?/).first()).toBeVisible();
  });

  test("10. reset restores canonical weights", async ({ page }) => {
    await page.goto("/research");
    const reset = page.getByRole("button", { name: /Reset to V0.1|Restablecer a V0.1/i });
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(
      page.locator("#main").getByText(
        /Custom research configuration|Configuración de investigación personalizada/i,
      ),
    ).toHaveCount(0);
  });
});

test("11. home ranking matches the region page score", async ({ page }) => {
  await page.goto("/");
  // first data row of the Highest-matches table
  const table = page.getByRole("table").first();
  await expect(table.getByRole("row").nth(1)).toBeVisible({ timeout: 120_000 });
  const firstRow = table.getByRole("row").nth(1);
  const regionHref = await firstRow.getByRole("link").first().getAttribute("href");
  const homeScore = (await firstRow.locator("span.tnum").first().textContent())?.trim();
  expect(regionHref).toMatch(/^\/region\//);
  expect(homeScore).toMatch(/^\d+$/);

  // the region page hero must show the SAME observed number
  await page.goto(regionHref!);
  const hero = page.locator('[aria-label*="regime match" i]').first();
  await expect(hero).toBeVisible({ timeout: 120_000 });
  const regionScore = (await hero.textContent())?.trim();
  expect(regionScore).toBe(homeScore);
});
