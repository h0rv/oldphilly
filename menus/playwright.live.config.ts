import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser",
  testMatch: "live-scans.spec.ts",
  outputDir: "./test-results/live",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173/menus/",
    colorScheme: "light",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory ../site",
    url: "http://127.0.0.1:4173/menus/",
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
