import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseArchive } from "../src/model.ts";
import { parseCatalog } from "../src/catalog-model.ts";
const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);
const catalog = parseCatalog(
  JSON.parse(await readFile(new URL("../public/catalog.json", import.meta.url), "utf8")),
);
// No automated requests to the public OSM tile service or blocked image origin.
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("https://images.nypl.org/**", (route) => route.abort());
});
test("map retains all records and accessible pins during a tile and image outage", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./map/");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(102);
  await expect(page.locator(".menu-pin")).toHaveCount(6);
  await expect(page.locator("#map-status")).toContainText("Street map unavailable.");
  const pin = page.locator(".menu-pin").first();
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu-content h2")).toBeFocused();
  await page
    .getByRole("combobox", { name: "Choose a menu", exact: true })
    .selectOption("nypl-28620");
  await expect(page.locator("#menu-content h2")).toHaveText("Old Original Bookbinder's");
  await expect(page.getByRole("link", { name: "Open menu", exact: true })).toHaveAttribute(
    "href",
    "/menus/menu/nypl-28620/",
  );
  await expect(page.locator(".map-image-error")).toBeVisible();
  await expect(page.locator(".dish-details")).not.toHaveAttribute("open");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test("date, neighborhood, cuisine and collection filters compose with unknown states", async ({
  page,
}, info) => {
  await page.goto("./map/");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(102);
  if (info.project.name === "mobile") await page.locator("#filter-panel > summary").click();
  await page.getByRole("combobox", { name: "Decade", exact: true }).selectOption("undated");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(14);
  await page.getByRole("combobox", { name: "Neighborhood", exact: true }).selectOption("unlocated");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(
    catalog.menus.filter((menu) => menu.date.year === null && menu.location.precision === "unknown")
      .length,
  );
  await expect(page.locator(".menu-pin")).toHaveCount(0);
  await expect(page.locator("#map-status")).toContainText("No mapped menus");
  await page.getByRole("searchbox", { name: "Search menus", exact: true }).fill("__missing__");
  await expect(page.getByText("No menus match.", { exact: true })).toBeVisible();
  await page.locator("#menu-content").getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("CIA");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(30);
  await page.getByRole("combobox", { name: "Cuisine", exact: true }).selectOption("Lebanese");
  await expect(page.locator("#menu-content h2")).toHaveText("Middle East Restaurant");
  await page
    .getByRole("combobox", { name: "Neighborhood", exact: true })
    .selectOption("Rittenhouse");
  await expect(page.getByText("No menus match.", { exact: true })).toBeVisible();
  await page.locator("#menu-content").getByRole("button", { name: "Reset filters" }).click();
  await page.locator(".dates > summary").click();
  await page.getByLabel("From", { exact: true }).fill("2000");
  await page.getByLabel("To", { exact: true }).fill("1800");
  await expect(page.getByText("Start year is after end year.", { exact: true })).toBeVisible();
});
test("unlocated named menus keep their original address and source without a fake scan", async ({
  page,
}) => {
  await page.goto("./map/#menu=cia-17865");
  await expect(page.locator("#menu-content h2")).toHaveText("Middle East Restaurant");
  await expect(page.locator(".menu-byline")).toContainText("Undated");
  await page.locator(".source-details > summary").click();
  await expect(page.locator(".source-details")).toContainText("935 Ellsworth Street");
  await expect(page.locator(".source-details")).toContainText("Copyright Not Evaluated");
  await expect(page.locator(".map-scan")).toHaveCount(0);
});
test("source dishes preserve duplicate occurrences and prices behind a disclosure", async ({
  page,
}) => {
  await page.goto("./map/#menu=nypl-27260");
  await page.locator(".dish-details > summary").click();
  const melon = page.getByRole("row").filter({ hasText: "Half Arizona Cantaloupe" });
  await expect(melon).toHaveCount(2);
  await expect(melon.locator("td:last-child")).toHaveText(["$0.90", "$0.90"]);
});
test("load/schema failures are announced", async ({ page }) => {
  await page.route("**/menus.json", (route) => route.fulfill({ status: 503, body: "missing" }));
  await page.goto("./map/");
  await expect(page.getByRole("alert")).toContainText("Menu data unavailable");
  await page.unroute("**/menus.json");
  await page.route("**/catalog.json", (route) => route.fulfill({ json: { schemaVersion: 999 } }));
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
});
test("Web Mercator placement survives zoom, pan and neighborhood filtering", async ({
  page,
}, info) => {
  await page.goto("./map/");
  const west = page.locator('.menu-pin[data-menu-ids~="cia-18438"]');
  const east = page.locator('.menu-pin[data-menu-ids~="cia-8063"]');
  await expect(west).toBeVisible();
  await expect(east).toBeVisible();
  const first = catalog.menus.find((menu) => menu.id === "cia-18438")?.location;
  const second = catalog.menus.find((menu) => menu.id === "cia-8063")?.location;
  if (first?.precision !== "exact" || second?.precision !== "exact")
    throw new Error("Missing reviewed points");
  const scale = 256 * 2 ** 14;
  const mercatorY = (lat: number): number =>
    (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * scale;
  const westBox = await west.boundingBox(),
    eastBox = await east.boundingBox(),
    mapBox = await page.locator("#map").boundingBox();
  if (westBox === null || eastBox === null || mapBox === null) throw new Error("Missing map/pins");
  const points = catalog.menus.flatMap((menu) =>
    menu.location.precision === "exact" ? [menu.location] : [],
  );
  const widthAt14 =
    ((Math.max(...points.map((p) => p.lng)) - Math.min(...points.map((p) => p.lng))) / 360) * scale;
  const heightAt14 =
    Math.max(...points.map((p) => mercatorY(p.lat))) -
    Math.min(...points.map((p) => mercatorY(p.lat)));
  const fit = Math.min((mapBox.width - 70) / widthAt14, (mapBox.height - 70) / heightAt14);
  const initialZoom = Math.min(14, Math.max(11, 14 + Math.floor(Math.log2(fit))));
  const ratio = 2 ** (initialZoom - 14),
    expectedX = ((second.lng - first.lng) / 360) * scale * ratio,
    expectedY = (mercatorY(second.lat) - mercatorY(first.lat)) * ratio;
  expect(Math.abs(eastBox.x - westBox.x - expectedX)).toBeLessThan(1.1);
  expect(Math.abs(eastBox.y - westBox.y - expectedY)).toBeLessThan(1.1);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoomWest = await west.boundingBox(),
    zoomEast = await east.boundingBox();
  if (zoomWest === null || zoomEast === null) throw new Error("Zoom lost pins");
  expect(Math.abs(zoomEast.x - zoomWest.x - expectedX * 2)).toBeLessThan(1.1);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.locator("#map").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await west.boundingBox())?.x).not.toBe(westBox.x);
  await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-pan-anim/u);
  const panWest = await west.boundingBox(),
    panEast = await east.boundingBox();
  if (panWest === null || panEast === null) throw new Error("Pan lost pins");
  expect(Math.abs(panEast.x - panWest.x - expectedX)).toBeLessThan(1.1);
  if (info.project.name === "mobile") await page.locator("#filter-panel > summary").click();
  await page.getByRole("combobox", { name: "Neighborhood", exact: true }).selectOption("Fairmount");
  await expect(page.locator(".menu-pin")).toHaveCount(1);
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(1);
  expect(await page.locator(".menu-pin").getAttribute("data-menu-ids")).toBe("nypl-30472");
});
test("zero and missing source prices stay distinct and text cannot inject markup", async ({
  page,
}) => {
  const base = archive.menus[0];
  if (base === undefined) throw new Error("No source fixture");
  const fixture = {
    ...base,
    id: "fixture-only",
    name: "Synthetic test fixture",
    currency: "USD",
    pages: [{ id: "fixture-page", label: "Fixture page", url: base.url, transcript: "" }],
    dishes: [
      {
        id: "zero",
        dishId: "zero",
        pageId: "fixture-page",
        name: "Fixture <img src=x>",
        price: 0,
        priceHigh: null,
      },
      {
        id: "missing",
        dishId: "missing",
        pageId: "fixture-page",
        name: "Missing-price fixture",
        price: null,
        priceHigh: null,
      },
    ],
  };
  await page.route("**/menus.json", (route) =>
    route.fulfill({ json: { ...archive, menus: [fixture] } }),
  );
  await page.goto("./map/");
  await page.locator(".dish-details > summary").click();
  await expect(page.getByRole("cell", { name: "$0.00", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Price unrecorded", exact: true })).toBeVisible();
  await expect(page.locator("#menu-content img, #menu-content script")).toHaveCount(0);
});
