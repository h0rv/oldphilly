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
