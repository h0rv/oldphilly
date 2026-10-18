import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { basemapSchema } from "../src/basemap.ts";
const path = process.argv[2];
if (path === undefined)
  throw new Error("Pass the published philadelphia-neighborhoods.geojson file");
const bytes = await readFile(path);
const source = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        properties: z.object({ MAPNAME: z.string() }),
        geometry: z.object({
          type: z.literal("MultiPolygon"),
          coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
        }),
      }),
    ),
  })
  .parse(JSON.parse(bytes.toString("utf8")));
const normalized = basemapSchema.parse({
  type: source.type,
  features: source.features.map((feature) => ({
    type: feature.type,
    properties: { name: feature.properties.MAPNAME },
    geometry: feature.geometry,
  })),
});
await writeFile("snapshots/philadelphia-neighborhoods.json", `${JSON.stringify(normalized)}\n`);
await writeFile(
  "snapshots/basemap-provenance.json",
  `${JSON.stringify({ provider: "Abaca Labs / OpenDataPhilly", license: "CC BY 4.0", source: "https://github.com/opendataphilly/odp-data-storage/blob/5c4538b5f4d2a26a81b7fab2d0006d327a39e3d0/philadelphia-neighborhoods/philadelphia-neighborhoods.geojson", sha256: createHash("sha256").update(bytes).digest("hex"), features: normalized.features.length, changes: "Keep original geometry and MAPNAME as name; remove unused attribute fields. These are reference neighborhoods, not historical street or venue boundaries." }, null, 2)}\n`,
);
