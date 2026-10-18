import { readFile } from "node:fs/promises";
import { parseArchive } from "../src/model.ts";
import { basemapSchema } from "../src/basemap.ts";
parseArchive(JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")));
basemapSchema.parse(
  JSON.parse(
    await readFile(
      new URL("../snapshots/philadelphia-neighborhoods.json", import.meta.url),
      "utf8",
    ),
  ),
);
