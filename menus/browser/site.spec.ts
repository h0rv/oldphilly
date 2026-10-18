import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { photoFixture } from "./photo-fixture.ts";

// Serve the actual pinned package bytes used by the unchanged photo site's CDN
// URLs. No map-library stubs or synthetic photo pixels are substituted.
const photoAssets = [
  {
    url: "leaflet@1.9.4/dist/leaflet.js",
    path: "leaflet/dist/leaflet.js",
    type: "application/javascript",
  },
  { url: "leaflet@1.9.4/dist/leaflet.css", path: "leaflet/dist/leaflet.css", type: "text/css" },
  {
    url: "maplibre-gl@5.24.0/dist/maplibre-gl.js",
    path: "maplibre-gl/dist/maplibre-gl.js",
    type: "application/javascript",
  },
  {
    url: "maplibre-gl@5.24.0/dist/maplibre-gl.css",
    path: "maplibre-gl/dist/maplibre-gl.css",
    type: "text/css",
  },
  {
    url: "@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js",
    path: "@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js",
    type: "application/javascript",
  },
  {
    url: "leaflet-control-geocoder@2.4.0/dist/Control.Geocoder.js",
    path: "leaflet-control-geocoder/dist/Control.Geocoder.js",
    type: "application/javascript",
  },
];
test.beforeEach(async ({ page }) => {
  await Promise.all(
    photoAssets.map((asset) =>
      page.route(`https://unpkg.com/${asset.url}`, (route) =>
        route.fulfill({
          path: fileURLToPath(new URL(`../node_modules/${asset.path}`, import.meta.url)),
          contentType: asset.type,
        }),
      ),
    ),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("https://www.phillyhistory.org/**", (route) => route.abort());
  await page.route("https://images.nypl.org/**", (route) => route.abort());
  await page.route("**/markers.json", (route) => route.fulfill({ json: photoFixture.markers }));
  await page.route(`**/chunks/${String(photoFixture.chunk)}.json`, (route) =>
    route.fulfill({ json: { [photoFixture.record.id]: photoFixture.record } }),
  );
  await page.route("**/search.json", (route) =>
    route.fulfill({
      json: { ids: [photoFixture.record.id], t: [photoFixture.record.title.toLowerCase()] },
    }),
  );
});

test("photo home, about and menus remain connected on one static origin", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "OldPhilly", exact: true })).toBeVisible();
  if (info.project.name === "mobile") await page.locator("#title-toggle").click();
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveTitle("About - OldPhilly");
  await page.getByRole("link", { name: /Back to the map/u }).click();
  if (info.project.name === "mobile") await page.locator("#title-toggle").click();
  await page.getByRole("link", { name: "Menus", exact: true }).click();
  await expect(page).toHaveTitle("Old Philly Menus · Historical menus");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://oldphilly.org/menus/",
  );
  await page.getByRole("link", { name: "Explore OldPhilly’s photo map", exact: true }).click();
  await expect(page.locator("#photo-search")).toBeAttached();
  expect(errors).toEqual([]);
});

test("existing photo deep links still open the sourced detail and close with Escape", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/#photo=${photoFixture.record.id}`);
  await expect(page.locator("#modal")).toBeVisible();
  await expect(page.locator("#modal-caption h2")).toHaveText(photoFixture.record.title);
  await expect(page.locator("#modal-caption .mc-source")).toHaveAttribute(
    "href",
    photoFixture.record.url,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal")).toBeHidden();
  await expect(page.locator("#sidebar")).toBeVisible();
  expect(errors).toEqual([]);
});

test("compiled menu assets and data use /menus/ while photo files retain root paths", async ({
  page,
}) => {
  await page.goto("./map/#menu=nypl-30411");
  await expect(page.locator("#menu-content h2")).toHaveText("Horn & Hardart");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://oldphilly.org/menus/map/",
  );
  const paths = await page
    .locator('script[src], link[rel="stylesheet"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute(node.tagName === "SCRIPT" ? "src" : "href")),
    );
  expect(paths.length).toBeGreaterThan(0);
  await Promise.all(
    paths.map(async (path) => {
      if (path === null) throw new Error("Asset URL is missing");
      expect(path.startsWith("/menus/_astro/")).toBe(true);
      expect((await page.request.get(path)).status()).toBe(200);
    }),
  );
  expect((await page.request.get("/menus/menus.json")).status()).toBe(200);
  await Promise.all(
    ["app.js", "style.css", "about.html"].map(async (name) => {
      const response = await page.request.get(`/${name}`);
      expect(response.status()).toBe(200);
      expect(await response.body()).toEqual(
        await readFile(new URL(`../../site/${name}`, import.meta.url)),
      );
    }),
  );
});

test("menu 404 output is isolated and marked noindex", async ({ page }) => {
  await page.goto("./404.html");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("That page isn’t on the menu.");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(
    page.getByRole("link", { name: "Return to Old Philly Menus", exact: true }),
  ).toHaveAttribute("href", "/menus/");
  expect((await page.request.get("/menus/__missing_page__")).status()).toBe(404);
});
