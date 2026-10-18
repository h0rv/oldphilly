import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseArchive } from "../src/model.ts";
const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);

// OSM prohibits headless rendering traffic. Exercise the failure state and
// projection without making any requests to the public tile service.
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
});

test("minimal map and a real menu render on desktop and mobile", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("./map/");
  await expect(page).toHaveTitle("Old Philly Menus · Explore the map");
  await expect(page.getByRole("link", { name: "Old Philly Menus", exact: true })).toBeVisible();
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(archive.menus.length);
  await expect(page.locator("#menu-content h2")).toHaveText("The Warwick Hotel");
  await expect(page.locator(".dishes")).toContainText("Half Arizona Cantaloupe");
  const melonRows = page
    .getByRole("row")
    .filter({ hasText: "Half Arizona Cantaloupe" })
    .filter({ has: page.locator('a[href$="/menu_pages/48657"]') });
  // Both distinct source occurrences are retained, even on the same source page.
  await expect(melonRows).toHaveCount(2);
  await expect(melonRows.locator("td:last-child")).toHaveText(["$0.90", "$0.90"]);
  await expect(
    page.locator("#menu-content").getByRole("link", { name: "Original scan", exact: true }),
  ).toHaveAttribute("href", /menu_pages\/48657/u);
  await expect(page.locator(".source-details")).not.toHaveAttribute("open");
  await expect(page.locator("#menu-picker")).toHaveValue("");
  await expect(page.locator("#menu-picker option:checked")).toHaveText("Choose another menu");
  await expect(
    page.getByText("The Warwick Hotel", { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(page.locator(".menu-byline").getByText("May 12, 1959", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("link", { name: "OpenStreetMap contributors", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#map-status")).toContainText("Street tiles unavailable");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(page.locator("#map .leaflet-tile-pane")).toHaveCount(1);
  await expect(page.locator("#map canvas, #map svg")).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `review/${info.project.name}.png`,
    fullPage: info.project.name !== "mobile",
  });
});

test("filters compose and retain unknown dates and locations", async ({ page }, info) => {
  await page.goto("./map/");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(archive.menus.length);
  if (info.project.name === "mobile") await page.locator("#filter-panel > summary").click();
  await page.getByRole("combobox", { name: "Decade", exact: true }).selectOption("undated");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(
    archive.menus.filter((menu) => menu.date.year === null).length,
  );
  await page.getByRole("combobox", { name: "Area", exact: true }).selectOption("unlocated");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(
    archive.menus.filter((menu) => menu.date.year === null && menu.location === null).length,
  );
  await expect(page.locator(".menu-pin")).toHaveCount(0);
  await expect(page.locator("#map-status")).toContainText("No verified locations");
  await page.getByRole("searchbox", { name: "Search menus", exact: true }).fill("__missing_menu__");
  await expect(page.getByText("No menus match these filters.", { exact: true })).toBeVisible();
  await page.locator("#menu-content").getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(archive.menus.length);
  await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("CIA");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(30);
  await page.getByRole("combobox", { name: "Cuisine", exact: true }).selectOption("Lebanese");
  await expect(page.locator("#menu-content h2")).toHaveText("Middle East Restaurant");
  await page.getByRole("combobox", { name: "Area", exact: true }).selectOption("Rittenhouse");
  await expect(page.getByText("No menus match these filters.", { exact: true })).toBeVisible();
  await page.locator("#menu-content").getByRole("button", { name: "Reset filters" }).click();
  await page.locator(".dates > summary").click();
  await page.getByLabel("From", { exact: true }).fill("2000");
  await page.getByLabel("To", { exact: true }).fill("1800");
  await expect(page.getByText("Start year comes after end year.", { exact: true })).toBeVisible();
});

test("unlocated Middle East remains selectable, named and undated", async ({ page }, info) => {
  await page.goto("./map/#menu=cia-17865");
  await expect(page.locator("#menu-content h2")).toHaveText("Middle East Restaurant");
  await expect(page.locator(".menu-byline")).toContainText("Undated");
  await page.getByText("Source & details", { exact: true }).click();
  await expect(page.locator(".source-details")).toContainText("935 Ellsworth Street");
  await expect(page.locator(".source-details")).toContainText("Copyright Not Evaluated");
  await page.screenshot({ path: `review/${info.project.name}-detail.png`, fullPage: true });
});

test("CIA menus retain their source link while withholding full text in release output", async ({
  page,
}) => {
  await page.goto("./map/#menu=cia-18438");
  await expect(page.locator("#menu-content h2")).toHaveText("Stratford Gardens");
  await expect(page.locator("#menu-content .empty")).toHaveText(
    "Read this menu at the holding library.",
  );
  await expect(page.locator(".transcript, .dishes")).toHaveCount(0);
  await expect(
    page.locator("#menu-content").getByRole("link", { name: "Original scan", exact: true }),
  ).toHaveAttribute("href", /id\/18438/u);
  await page.getByText("Source & details", { exact: true }).click();
  await expect(page.locator(".source-details")).toContainText(
    "Full menu text is not reproduced here",
  );
  await expect(page.locator(".source-details")).toContainText("Copyright Not Evaluated");
});

test("complete NYPL filters compose with analytical cuisine and a dated real price", async ({
  page,
}, info) => {
  await page.goto("./map/");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(102);
  if (info.project.name === "mobile") await page.locator("#filter-panel > summary").click();
  await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("NYPL");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(72);
  await page.getByRole("combobox", { name: "Cuisine", exact: true }).selectOption("Seafood");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Area", exact: true }).selectOption("unlocated");
  await expect(page.locator(".menu-pin")).toHaveCount(0);
  await page.locator(".dates > summary").click();
  await page.getByLabel("From", { exact: true }).fill("1949");
  await page.getByLabel("To", { exact: true }).fill("1949");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(1);
  await expect(page.locator("#menu-content h2")).toHaveText("Kugler's");
  await expect(page.locator(".menu-byline")).toContainText("February 1, 1949");
  const soup = page.getByRole("row").filter({ hasText: "Snapper Soup a la Kugler" });
  await expect(soup.getByRole("cell", { name: "$0.35", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("keyboard can activate a named real pin and select any menu", async ({ page }) => {
  await page.goto("./map/");
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(archive.menus.length);
  const pin = page.locator(".menu-pin").first();
  await expect(pin).toBeVisible();
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu-content h2")).toBeFocused();
  await page.getByRole("combobox", { name: "Choose a menu", exact: true }).selectOption("cia-8063");
  await expect(page.locator("#menu-content h2")).toHaveText("Old Original Bookbinder's");
  await expect(page.locator("#menu-content h2")).toBeFocused();
  await expect(page.locator(".menu-byline")).toContainText("February 15, 1977");
});

test("load/schema failures are accessible and pins survive a tile outage", async ({ page }) => {
  await page.route("**/menus.json", (route) => route.fulfill({ status: 503, body: "missing" }));
  await page.goto("./map/");
  await expect(page.getByRole("alert")).toContainText("Menu data unavailable");
  await page.unroute("**/menus.json");
  await page.route("**/menus.json", (route) => route.fulfill({ json: { schemaVersion: 999 } }));
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/menus.json");
  await page.reload();
  await expect(page.locator("#map .leaflet-tile-pane")).toHaveCount(1);
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(archive.menus.length);
  await expect(page.locator("#map-status")).toContainText("Street tiles unavailable");
  await expect(page.locator(".menu-pin").first()).toBeVisible();
});

test("real pins retain Web Mercator placement through zoom, pan and area filtering", async ({
  page,
}, info) => {
  await page.goto("./map/");
  const west = page.locator('.menu-pin[data-menu-ids~="cia-18438"]');
  const east = page.locator('.menu-pin[data-menu-ids~="cia-8063"]');
  await expect(west).toBeVisible();
  await expect(east).toBeVisible();
  const first = archive.menus.find((menu) => menu.id === "cia-18438")?.location;
  const second = archive.menus.find((menu) => menu.id === "cia-8063")?.location;
  if (first === undefined || first === null || second === undefined || second === null)
    throw new Error("Missing verified venue points");
  // Independent EPSG:3857 equations. Fit depends on all reviewed points and the viewport.
  const scale = 256 * 2 ** 14;
  const mercatorY = (lat: number): number =>
    (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * scale;
  const westBox = await west.boundingBox();
  const eastBox = await east.boundingBox();
  const mapBox = await page.locator("#map").boundingBox();
  if (westBox === null || eastBox === null || mapBox === null) throw new Error("Missing map/pins");
  const points = archive.menus.flatMap((menu) => (menu.location === null ? [] : [menu.location]));
  const widthAt14 =
    ((Math.max(...points.map((point) => point.lng)) -
      Math.min(...points.map((point) => point.lng))) /
      360) *
    scale;
  const heightAt14 =
    Math.max(...points.map((point) => mercatorY(point.lat))) -
    Math.min(...points.map((point) => mercatorY(point.lat)));
  const fit = Math.min((mapBox.width - 70) / widthAt14, (mapBox.height - 70) / heightAt14);
  const initialZoom = Math.min(14, Math.max(11, 14 + Math.floor(Math.log2(fit))));
  const ratio = 2 ** (initialZoom - 14);
  const expectedX = ((second.lng - first.lng) / 360) * scale * ratio;
  const expectedY = (mercatorY(second.lat) - mercatorY(first.lat)) * ratio;
  expect(Math.abs(eastBox.x - westBox.x - expectedX)).toBeLessThan(1.1);
  expect(Math.abs(eastBox.y - westBox.y - expectedY)).toBeLessThan(1.1);
  const markerBoxes = await Promise.all(
    (await page.locator(".menu-pin").all()).map((marker) => marker.boundingBox()),
  );
  expect(markerBoxes).toHaveLength(4);
  for (const [index, box] of markerBoxes.entries()) {
    if (box === null) throw new Error("A reviewed pin is missing");
    expect(box.x).toBeGreaterThanOrEqual(mapBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(mapBox.x + mapBox.width);
    expect(box.y).toBeGreaterThanOrEqual(mapBox.y);
    expect(box.y + box.height).toBeLessThanOrEqual(mapBox.y + mapBox.height);
    for (const other of markerBoxes.slice(index + 1)) {
      if (other === null) throw new Error("A reviewed pin is missing");
      expect(
        box.x + box.width <= other.x ||
          other.x + other.width <= box.x ||
          box.y + box.height <= other.y ||
          other.y + other.height <= box.y,
      ).toBe(true);
    }
  }
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoomWest = await west.boundingBox();
  const zoomEast = await east.boundingBox();
  if (zoomWest === null || zoomEast === null) throw new Error("Zoom lost pins");
  expect(Math.abs(zoomEast.x - zoomWest.x - expectedX * 2)).toBeLessThan(1.1);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.locator("#map").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await west.boundingBox())?.x).not.toBe(westBox.x);
  await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-pan-anim/u);
  const panWest = await west.boundingBox();
  const panEast = await east.boundingBox();
  if (panWest === null || panEast === null) throw new Error("Pan lost pins");
  expect(Math.abs(panEast.x - panWest.x - expectedX)).toBeLessThan(1.1);
  if (info.project.name === "mobile") await page.locator("#filter-panel > summary").click();
  await page.getByRole("combobox", { name: "Area", exact: true }).selectOption("Old City");
  await expect(page.locator(".menu-pin")).toHaveCount(1);
  expect((await east.getAttribute("data-menu-ids"))?.split(" ").toSorted()).toEqual([
    "cia-12094",
    "cia-8063",
  ]);
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(2);
});

// Test-only intercepted data never enters the export or preview screenshots.
test("item rendering keeps zero/missing prices distinct and escapes markup", async ({ page }) => {
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
  await expect(page.getByRole("cell", { name: "$0.00", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Price unrecorded", exact: true })).toBeVisible();
  await expect(page.locator("#menu-content img, #menu-content script")).toHaveCount(0);
});
