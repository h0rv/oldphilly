import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { scansSchema } from "../src/scans.ts";
import { parseArchive } from "../src/model.ts";
const scans = scansSchema.parse(
  JSON.parse(await readFile(new URL("../public/scans.json", import.meta.url), "utf8")),
);
const evidence = z
  .object({
    source: z.object({ commit: z.string() }),
    records: z.array(
      z.object({
        sourceFile: z.string(),
        sourceLine: z.number(),
        record: z.object({ UUID: z.string(), captures: z.array(z.string()) }),
      }),
    ),
  })
  .parse(
    JSON.parse(
      await readFile(new URL("../snapshots/nypl-public-domain.json", import.meta.url), "utf8"),
    ),
  );
const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);
await test("each released preview joins a source page to its exact public-domain capture and evidence line", () => {
  assert.equal(scans.pages.length, 426);
  assert.equal(new Set(scans.pages.map((page) => page.pageId)).size, 426);
  for (const page of scans.pages) {
    const source = archive.menus.find((menu) => menu.id === page.menuId);
    assert.ok(source);
    assert.equal(source.provider, "NYPL");
    assert.equal(source.scanNote, null);
    assert.ok(source.pages.some((original) => original.id === page.pageId));
    const record = evidence.records.find((row) =>
      row.record.captures.some(
        (capture) => new URL(capture).searchParams.get("id") === page.imageId,
      ),
    );
    assert.ok(record);
    assert.equal(new URL(page.fullUrl).hostname, "images.nypl.org");
    assert.equal(new URL(page.fullUrl).searchParams.get("t"), "g");
    assert.equal(
      page.recordUrl,
      `https://old-digitalcollections.nypl.org/items/${record.record.UUID}`,
    );
    assert.equal(
      page.evidence,
      `${scans.source.repo}/blob/${evidence.source.commit}/${record.sourceFile}#L${String(record.sourceLine)}`,
    );
  }
  assert.ok(!scans.pages.some((page) => page.pageId === "58186" || page.menuId === "nypl-24827"));
});
