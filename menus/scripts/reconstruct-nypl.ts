import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { menuSchema } from "../src/model.ts";
import { importNypl } from "./nypl.ts";
import {
  expectedInputsSchema,
  reconstructSources,
  transferManifestSchema,
  sha256,
} from "./nypl-transfer.ts";

const directory = process.argv[2];
const destination = process.argv[3];
if (directory === undefined || destination === undefined)
  throw new Error("Usage: node scripts/reconstruct-nypl.ts <chunks-directory> <new-CSV-directory>");
const manifestBytes = await readFile(join(directory, "manifest.json"));
const manifest = transferManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
const expected = expectedInputsSchema.parse(
  JSON.parse(await readFile(new URL("../snapshots/nypl-inputs.json", import.meta.url), "utf8")),
);
if (JSON.stringify(manifest.tables.map((table) => table.source)) !== JSON.stringify(expected))
  throw new Error("Transfer sources differ from the four authorized CSV artifacts");
const files = new Map(
  await Promise.all(
    manifest.tables.flatMap((table) =>
      table.parts.map(
        async (part) =>
          [part.fileName, await readFile(join(directory, part.fileName))] satisfies [
            string,
            Buffer,
          ],
      ),
    ),
  ),
);
const sources = reconstructSources(manifest, files);
await mkdir(destination, { recursive: true });
await Promise.all(
  [...sources].map(([name, bytes]) => writeFile(join(destination, name), bytes, { flag: "wx" })),
);
const menus = z.array(menuSchema).parse(await importNypl(destination, "nypl-transfer-verified"));
process.stdout.write(
  `${JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      manifestSha256: sha256(manifestBytes),
      parts: manifest.tables.reduce((count, table) => count + table.parts.length, 0),
      csvBytes: [...sources.values()].reduce((count, bytes) => count + bytes.length, 0),
      totalRows: manifest.tables.reduce((count, table) => count + table.source.rowCount, 0),
      sources: manifest.tables.map((table) => table.source),
      verifiedMenus: menus.length,
      displayPages: menus.flatMap((menu) => menu.pages).length,
      items: menus.flatMap((menu) => menu.dishes).length,
      pricedItems: menus.flatMap((menu) => menu.dishes).filter((dish) => dish.price !== null)
        .length,
      highPriceItems: menus.flatMap((menu) => menu.dishes).filter((dish) => dish.priceHigh !== null)
        .length,
    },
    null,
    2,
  )}\n`,
);
