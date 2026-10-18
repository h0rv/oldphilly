import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("https://images.nypl.org/**", (route) => route.abort());
});

test("three dated artifacts retain page identity and an honest image failure", async ({ page }) => {
  await page.goto("./story/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Three menus.");
  await expect(page.locator(".story-stop")).toHaveCount(3);
  await expect(page.locator(".stop-date")).toHaveText(["1912", "February 1, 1949", "1957"]);
  await expect(page.locator("#bellevue [data-scan-image]")).toHaveAttribute("src", /id=5055386/u);
  await expect(page.locator("#kuglers [data-scan-image]")).toHaveAttribute("src", /id=3991700/u);
  await expect(page.locator("#bookbinders [data-scan-image]")).toHaveAttribute(
    "src",
    /id=3963610/u,
  );
  await expect(page.locator("#bookbinders [data-scan-error]")).toBeVisible();
  await expect(page.locator("#bookbinders .story-items")).toContainText("$8.25");
  await page.locator("#bookbinders").getByRole("link", { name: "Full menu", exact: true }).click();
  await expect(page).toHaveURL(/\/menu\/nypl-28620\/$/u);
  await expect(page.locator("[data-scan-page] option")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("old map hashes still select the exact source and disclose a disputed scan", async ({
  page,
}) => {
  await page.goto("./#menu=nypl-24827");
  await expect(page.locator(".source-caution")).toContainText("St. Nicholas Hotel");
  await expect(page.locator(".map-scan")).toHaveCount(0);
  await expect(
    page.locator("#menu-content").getByRole("link", { name: "NYPL record", exact: true }),
  ).toBeVisible();
});

test.describe("static reading", () => {
  test.use({ javaScriptEnabled: false });
  test("restaurant dates, scan and story links work without JavaScript", async ({ page }) => {
    await page.goto("./story/");
    await page.getByRole("link", { name: "1912–1957" }).click();
    await expect(page.locator("#bellevue h2")).toBeInViewport();
    await page
      .locator("#bookbinders")
      .getByRole("link", { name: "Full menu", exact: true })
      .click();
    await expect(page.locator("[data-scan-image]")).toHaveAttribute("src", /3963610/u);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Old Original Bookbinder's");
  });
});
