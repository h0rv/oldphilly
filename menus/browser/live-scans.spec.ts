import { test, expect } from "@playwright/test";
// This test deliberately uses real source-hosted public-domain image responses.
// It runs only in the separate CI scan-preview job, with no image interception.
for (const artifact of [
  { id: "nypl-34841", image: "5055386", name: "bellevue" },
  { id: "nypl-29916", image: "3991700", name: "kuglers" },
  { id: "nypl-28620", image: "3963610", name: "bookbinders" },
]) {
  test(`real ${artifact.name} source scan renders and enlarges`, async ({ page }, info) => {
    await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
    const responses: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      if (new URL(response.url()).hostname === "images.nypl.org")
        responses.push({ url: response.url(), status: response.status() });
    });
    try {
      await page.goto(`./menu/${artifact.id}/`);
      if (artifact.name === "kuglers") await page.locator("[data-scan-page]").selectOption("58184");
      const image = page.locator("[data-scan-image]");
      await expect(image).toHaveAttribute("src", new RegExp(`id=${artifact.image}`, "u"));
      await expect
        .poll(
          async () =>
            await image.evaluate(
              (element) =>
                element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
            ),
          {
            timeout: 30000,
            message: "The real NYPL source scan must render before this preview is accepted",
          },
        )
        .toBe(true);
      await page.screenshot({
        path: `review/after/${info.project.name}-${artifact.name}.png`,
        fullPage: true,
      });
      await page.locator("[data-scan-open]").click();
      const full = page.locator("[data-scan-full]");
      await expect
        .poll(
          async () =>
            await full.evaluate(
              (element) =>
                element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      await page.getByRole("dialog").getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.screenshot({
        path: `review/after/${info.project.name}-${artifact.name}-enlarged.png`,
      });
    } finally {
      await info.attach("NYPL source responses", {
        body: Buffer.from(JSON.stringify(responses, null, 2)),
        contentType: "application/json",
      });
    }
  });
}

test("restaurant search reaches an original menu and returns to the same date and search", async ({
  page,
}, info) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("./");
  await page.getByRole("searchbox", { name: "Find a restaurant" }).fill("Bookbinder");
  await page.screenshot({
    path: `review/journey/${info.project.name}-restaurants.jpg`,
    type: "jpeg",
    quality: 85,
    fullPage: true,
  });
  await page
    .locator("#restaurant-venue-old-original-bookbinders-125-walnut-street")
    .getByRole("link", { name: "Old Original Bookbinder's", exact: true })
    .click();
  await expect(page.locator("#menu-nypl-28620")).toContainText("Branch unresolved");
  await page.screenshot({
    path: `review/journey/${info.project.name}-dates.jpg`,
    type: "jpeg",
    quality: 85,
    fullPage: true,
  });
  await page.locator(".dated-menus").getByRole("link", { name: /1957/u }).click();
  const preview = page.locator("[data-scan-image]");
  await expect
    .poll(
      async () =>
        await preview.evaluate(
          (element) =>
            element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.screenshot({
    path: `review/journey/${info.project.name}-original-menu.jpg`,
    type: "jpeg",
    quality: 90,
    fullPage: true,
  });
  await page.locator("[data-scan-open]").click();
  const dialog = page.getByRole("dialog"),
    full = dialog.locator("[data-scan-full]");
  await expect
    .poll(
      async () =>
        await full.evaluate(
          (element) =>
            element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  const dimensions = await full.evaluate((element) =>
    element instanceof HTMLImageElement
      ? { width: element.naturalWidth, height: element.naturalHeight }
      : null,
  );
  await info.attach("Original scan dimensions", {
    body: Buffer.from(JSON.stringify(dimensions)),
    contentType: "application/json",
  });
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.screenshot({
    path: `review/journey/${info.project.name}-enlarged.jpg`,
    type: "jpeg",
    quality: 90,
  });
  await dialog.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator("[data-scan-page]")).toHaveValue("53308");
  await expect(full).toHaveAttribute("src", /id=3963611/u);
  await expect
    .poll(
      async () =>
        await full.evaluate(
          (element) =>
            element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-scan-open]")).toBeFocused();
  await page.getByRole("link", { name: "Restaurant menus", exact: true }).click();
  await expect(page.locator("#menu-nypl-28620")).toBeInViewport();
  await page.getByRole("link", { name: "Restaurants", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Find a restaurant" })).toHaveValue(
    "Bookbinder",
  );
});
