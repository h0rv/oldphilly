import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ciaExportSchema, importCia, withoutCiaTranscripts } from "../scripts/cia.ts";
import { sha256 } from "../scripts/nypl-transfer.ts";
import { parseArchive } from "../src/model.ts";

const bytes = await readFile(new URL("../snapshots/cia-metadata.json", import.meta.url));
const records = ciaExportSchema.parse(JSON.parse(bytes.toString("utf8")));
const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);

await test("released CIA metadata matches its audited derivative and retains every source identity and rights statement", () => {
  assert.equal(bytes.length, 56824);
  assert.equal(sha256(bytes), "38932b1b208c375a14f32f0dbf43b6ee2cd26173e3a91c8957d00b34441b9315");
  assert.equal(records.length, 30);
  for (const catalog of records) {
    const rights = catalog["rights"];
    assert.ok(typeof rights === "string");
    assert.match(rights, /Copyright Not Evaluated.*CNE\/1\.0/u);
    const menu = archive.menus.find(
      (record) => record.recordId === catalog["dmrecord"] && record.provider === "CIA",
    );
    assert.ok(menu);
    assert.deepEqual(menu.catalog, catalog);
    assert.equal(
      menu.url,
      `https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/${menu.recordId}`,
    );
    assert.ok(menu.pages.every((page) => page.transcript === ""));
  }
});

await test("CIA imports strip full text before catalog and page export without altering other fields", () => {
  const original = records.map((record) =>
    Object.assign({}, record, { transc: "__private_transcript_fixture__" }),
  );
  const sanitized = withoutCiaTranscripts(original);
  assert.deepEqual(
    sanitized,
    records.map((record) => Object.assign({}, record, { transc: "" })),
  );
  assert.deepEqual(withoutCiaTranscripts(sanitized), sanitized);
  const imported = importCia(original, "test-snapshot");
  assert.ok(!JSON.stringify(imported).includes("__private_transcript_fixture__"));
  assert.ok(imported.every((menu) => menu.pages.every((page) => page.transcript === "")));
});

await test("release archive validation rejects CIA transcript leakage through either page or raw catalog", () => {
  const menu = archive.menus.find((record) => record.id === "cia-18438");
  assert.ok(menu);
  assert.throws(
    () =>
      parseArchive({
        ...archive,
        menus: [
          { ...menu, catalog: { ...menu.catalog, transc: "__private_transcript_fixture__" } },
        ],
      }),
    /CIA full transcripts/u,
  );
  assert.throws(
    () =>
      parseArchive({
        ...archive,
        menus: [
          {
            ...menu,
            pages: menu.pages.map((page) =>
              Object.assign({}, page, { transcript: "__private_transcript_fixture__" }),
            ),
          },
        ],
      }),
    /CIA full transcripts/u,
  );
});
