import { defineConfig } from "@playwright/test";
import { basePath } from "./src/base-path.ts";
const url = `http://127.0.0.1:4173${basePath(process.env["ASTRO_BASE_PATH"] ?? "/menus/")}`;
export default defineConfig({
  testDir: "./browser",
  outputDir: "./test-results",
  fullyParallel: true,
  workers: 1,
  use: {
    baseURL: url,
    colorScheme: "light",
    launchOptions:
      process.env["CHROMIUM_PATH"] === undefined
        ? {}
        : { executablePath: process.env["CHROMIUM_PATH"] },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory ../site",
    url,
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1100 } } },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
