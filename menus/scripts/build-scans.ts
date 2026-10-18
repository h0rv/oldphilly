import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { parseArchive } from "../src/model.ts";
import { enrichmentSchema } from "../src/enrichment.ts";
import rawEnrichment from "../snapshots/venue-evidence.json" with { type: "json" };
const enrichment = enrichmentSchema.parse(rawEnrichment);

const source = z
  .object({
    source: z.object({
      repo: z.url(),
      commit: z.string().regex(/^[a-f0-9]{40}$/u),
      description: z.string(),
    }),
    records: z.array(
      z.object({
        sourceFile: z.string(),
        sourceLine: z.int().positive(),
        record: z.object({
          UUID: z.string(),
          title: z.string().nullable(),
          captures: z.array(z.url()),
        }),
      }),
    ),
  })
  .parse(JSON.parse(await readFile("snapshots/nypl-public-domain.json", "utf8")));
const archive = parseArchive(JSON.parse(await readFile("public/menus.json", "utf8")));
const rows = z
  .array(
    z.object({
      id: z.string(),
      menu_id: z.string(),
      image_id: z.string(),
      full_width: z.coerce.number().int().positive(),
      full_height: z.coerce.number().int().positive(),
    }),
  )
  .parse(parse(await readFile("snapshots/nypl-selected/MenuPage.csv"), { columns: true }));
const captures = new Map(
  source.records.flatMap((item) =>
    item.record.captures.map((capture) => {
      const url = new URL(capture);
      if (url.hostname !== "images.nypl.org") throw new Error("Unexpected NYPL capture host");
      url.protocol = "https:";
      return [url.searchParams.get("id"), { url, item }] satisfies [
        string | null,
        { url: URL; item: typeof item },
      ];
    }),
  ),
);
const pages = archive.menus.flatMap((menu) => {
  if (menu.provider !== "NYPL" || menu.scanNote !== null) return [];
  if (
    enrichment.dateConflicts.some((record) => record.menuId === menu.id && record.withholdPreview)
  )
    return [];
  return menu.pages.flatMap((page) => {
    const row = rows.find((item) => item.id === page.id && `nypl-${item.menu_id}` === menu.id);
    const capture = row === undefined ? undefined : captures.get(row.image_id);
    if (row === undefined || capture === undefined) return [];
    const preview = new URL(capture.url);
    preview.searchParams.set("t", "w");
    return [
      {
        menuId: menu.id,
        pageId: page.id,
        imageId: row.image_id,
        previewUrl: preview.href,
        fullUrl: capture.url.href,
        width: row.full_width,
        height: row.full_height,
        credit: "From The New York Public Library",
        recordUrl: `https://old-digitalcollections.nypl.org/items/${capture.item.record.UUID}`,
        evidence: `${source.source.repo}/blob/${source.source.commit}/${capture.item.sourceFile}#L${String(capture.item.sourceLine)}`,
      },
    ];
  });
});
await writeFile(
  "public/scans.json",
  `${JSON.stringify({ schemaVersion: 1, source: source.source, pages })}\n`,
);
process.stdout.write(
  `${String(pages.length)} source-hosted, public-domain scan previews; no image bytes copied.\n`,
);
