import { parseCatalog, validateCatalogSources } from "../src/catalog-model.ts";
import { readFile } from "node:fs/promises";
import { parseArchive } from "../src/model.ts";
import { basemapSchema } from "../src/basemap.ts";
const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);
validateCatalogSources(
  parseCatalog(
    JSON.parse(await readFile(new URL("../public/catalog.json", import.meta.url), "utf8")),
  ),
  archive,
);
basemapSchema.parse(
  JSON.parse(
    await readFile(
      new URL("../snapshots/philadelphia-neighborhoods.json", import.meta.url),
      "utf8",
    ),
  ),
);
