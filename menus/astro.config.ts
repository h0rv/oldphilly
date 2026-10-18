import { defineConfig } from "astro/config";
import { basePath } from "./src/base-path.ts";
import { z } from "zod";
const site = z
  .url({ protocol: /^https$/u })
  .optional()
  .parse(process.env["ASTRO_SITE"] ?? "https://oldphilly.org");
export default defineConfig({
  output: "static",
  base: basePath(process.env["ASTRO_BASE_PATH"] ?? "/menus/"),
  ...(site === undefined ? {} : { site }),
  devToolbar: { enabled: false },
  vite: { build: { target: "es2024" } },
});
