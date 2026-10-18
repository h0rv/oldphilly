import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("https://images.nypl.org/**", (route) => route.abort());
});

test("chronological home offers an immediate map and honest source-image fallback", async ({
  page,
}, info) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pull up a chair.");
  const map = page.getByRole("link", { name: "Explore the map", exact: true });
  await expect(map).toBeInViewport();
  await expect(page.locator(".story-stop")).toHaveCount(3);
  await expect(page.locator(".stop-date")).toHaveText([
    "January 2, 1914",
    "August 3, 1940",
    "February 1, 1949",
  ]);
  await expect(page.locator(".image-unavailable")).toBeVisible();
  await expect(page.locator(".hero-scan img")).toHaveAttribute("src", /id=4046889/u);
  await expect(
    page.locator(".hero-scan").getByRole("link", { name: "Image & rights" }),
  ).toHaveAttribute("href", /c2e99748-bc89-4d90-e040-e00a18061570/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `review/${info.project.name}-home.png`, fullPage: true });
  await map.click();
  await expect(page.locator("#menu-picker option[data-menu]")).toHaveCount(102);
});

test("each story stop opens its exact imported record and recorded prices", async ({ page }) => {
  await page.goto("./#coffee-counter");
  await page.locator("#coffee-counter").getByRole("link", { name: "Read this menu" }).click();
  await expect(page.locator("#menu-content h2")).toHaveText("Horn & Hardart");
  await expect(page.locator(".menu-byline")).toContainText("August 3, 1940");
  const coffee = page.getByRole("row").filter({ hasText: "Gilt Edge Coffee with Pure Cream, Cup" });
  await expect(coffee.getByRole("cell", { name: "$0.05", exact: true })).toBeVisible();
  await expect(coffee.getByRole("link", { name: "source", exact: true })).toHaveAttribute(
    "href",
    /60238/u,
  );
  await expect(
    page.getByText("Horn & Hardart", { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(page.locator("#menu-picker")).toHaveValue("");
});

test("earlier menu hashes redirect to the map and disputed scans are flagged", async ({ page }) => {
  await page.goto("./#menu=nypl-24827");
  await expect(page.locator("#menu-content h2")).toHaveText("CONTINENTAL HOTEL, PHILADELPHIA, PA.");
  await expect(page.locator(".source-caution")).toContainText("St. Nicholas Hotel");
  await expect(page.locator(".source-caution")).toContainText("location marked uncertain");
  await expect(
    page.locator("#menu-content").getByRole("link", { name: "Catalog scans", exact: true }),
  ).toBeVisible();
});

test.describe("ordinary static reading", () => {
  test.use({ javaScriptEnabled: false });
  test("the story and anchor navigation work without JavaScript", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(".story-stop")).toHaveCount(3);
    await page.getByRole("link", { name: "Start the short tour" }).click();
    await expect(page).toHaveURL(/#hotel-supper$/u);
    await expect(page.locator("#hotel-supper h2")).toBeInViewport();
    await expect(page.locator("#coffee-counter .story-items")).toContainText("$0.05");
  });
});
