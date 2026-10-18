import { test, expect } from "@playwright/test";
// Interaction fixture only. The visible label prevents confusion with real artifacts.
const testScan =
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1400"><rect width="900" height="1400" fill="#e5ca79"/><text x="60" y="140" font-size="64">TEST SCAN</text><text x="60" y="240" font-size="36">Layout fixture only</text></svg>';
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("https://images.nypl.org/**", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: testScan }),
  );
});
test("find restaurant, choose dated artifact, zoom, switch pages and return with search context", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.getByRole("searchbox", { name: "Find a restaurant" }).fill("Bookbinder");
  await page.screenshot({
    path: `test-results/${info.project.name}-browse-TEST-FIXTURE.png`,
    fullPage: true,
  });
  const card = page.locator("#restaurant-venue-old-original-bookbinders-125-walnut-street");
  await card.getByRole("link", { name: "Old Original Bookbinder's", exact: true }).click();
  await expect(page.locator(".dated-menus li")).toHaveCount(4);
  await page.screenshot({
    path: `test-results/${info.project.name}-dates-TEST-FIXTURE.png`,
    fullPage: true,
  });
  await expect(page.locator("#menu-nypl-28620")).toContainText("Branch unresolved");
  await expect(page.locator("#menu-cia-8063")).toContainText("125 Walnut");
  await page.locator(".dated-menus").getByRole("link", { name: /1957/u }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Old Original Bookbinder's");
  await expect(page.locator("[data-scan-image]")).toBeVisible();
  await expect(page.locator("[data-scan-page]")).toHaveValue("53307");
  await page
    .getByRole("button", { name: "Enlarge Old Original Bookbinder's", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.locator("[data-scan-full]")).toHaveCSS("width", /\d+px/u);
  const imageWidth = await dialog
    .locator("[data-scan-full]")
    .evaluate((image) => image.getBoundingClientRect().width);
  const scrollWidth = await dialog
    .locator(".scan-zoom-scroll")
    .evaluate((element) => element.clientWidth);
  expect(imageWidth).toBeGreaterThan(scrollWidth);
  await dialog.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator("[data-scan-page]")).toHaveValue("53308");
  await expect(dialog.locator("[data-scan-full]")).toHaveAttribute("src", /3963611/u);
  await expect(page).toHaveURL(/page=53308/u);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Enlarge Old Original Bookbinder's", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(page.locator("[data-scan-page]")).toHaveValue("53308");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-reader-TEST-FIXTURE.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Restaurant menus", exact: true }).click();
  await expect(page).toHaveURL(/q=Bookbinder/u);
  await page.getByRole("link", { name: "Restaurants", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Find a restaurant" })).toHaveValue(
    "Bookbinder",
  );
  await expect(page.locator("[data-restaurant]:visible")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});
test("unknown and missing-image menus stay readable without invented dates or pins", async ({
  page,
}) => {
  await page.goto("./menu/cia-17865/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Middle East Restaurant");
  await expect(page.locator(".reader-date")).toHaveText("Undated");
  await expect(page.locator(".scan-unavailable")).toBeVisible();
  await expect(page.getByRole("link", { name: "CIA record", exact: true })).toHaveAttribute(
    "href",
    /17865/u,
  );
  await expect(page.locator("[data-scan-viewer]")).toHaveCount(0);
});
test("restaurant search supports addresses, empty states and preserves branch separation", async ({
  page,
}) => {
  await page.goto("./");
  const search = page.getByRole("searchbox", { name: "Find a restaurant" });
  await search.fill("935 Ellsworth");
  await expect(page.locator("[data-restaurant]:visible")).toHaveCount(1);
  await expect(page.locator("[data-restaurant]:visible")).toContainText("Middle East Restaurant");
  await search.fill("__missing__");
  await expect(page.locator("#browse-empty")).toBeVisible();
  await search.fill("Bookbinder");
  expect(await page.locator("[data-restaurant]:visible").count()).toBeGreaterThan(1);
});
