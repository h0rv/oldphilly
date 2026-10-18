import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  expectedInputsSchema,
  maxPartBytes,
  maxPartRows,
  reconstructSources,
  sha256,
  sourceInputSchema,
  splitSource,
  transferManifestSchema,
} from "../scripts/nypl-transfer.ts";

function fixture(rows: readonly string[], separator: string, bom = "") {
  const bytes = Buffer.from(`${bom}id,name${separator}${rows.join(separator)}`, "utf8");
  const source = sourceInputSchema.parse({
    table: "Menu",
    fileName: "Menu.csv",
    byteLength: bytes.length,
    rowCount: rows.length,
    sha256: sha256(bytes),
  });
  const split = splitSource(source, bytes);
  const manifest = transferManifestSchema.parse({
    format: "nypl-csv-manifest-v1",
    encoding: "utf-8",
    maxPartBytes,
    maxPartRows,
    tables: [split.table],
  });
  const files = new Map<string, Buffer>();
  for (const file of split.files) files.set(file.fileName, file.bytes);
  return { bytes, source, split, manifest, files };
}

await test("transfer round trip preserves BOM, CRLF, quoted newlines, Unicode and absent final newline", () => {
  const rows = Array.from(
    { length: 405 },
    (_, index) => `${String(index + 1)},"Fixture café, ""quoted""\r\nsecond line"`,
  );
  const { bytes, split, manifest, files } = fixture(rows, "\r\n", "\uFEFF");
  assert.equal(split.files.length, 3);
  assert.ok(split.table.parts.every((part) => part.rowCount <= 200));
  assert.deepEqual(reconstructSources(manifest, files).get("Menu.csv"), bytes);
});

await test("serialized byte limit splits large complete records without changing CSV fields", () => {
  const rows = Array.from(
    { length: 8 },
    (_, index) => `${String(index + 1)},"Fixture ${"é".repeat(4000)}"`,
  );
  const { bytes, split, manifest, files } = fixture(rows, "\n");
  assert.ok(split.files.length > 1);
  assert.ok(split.files.every((file) => file.bytes.length <= 24_576));
  assert.ok(split.table.parts.every((part) => part.rowCount < 200));
  assert.deepEqual(reconstructSources(manifest, files).get("Menu.csv"), bytes);
});

await test("missing, reordered, corrupted and unsafe-named chunks are rejected", () => {
  const rows = Array.from({ length: 201 }, (_, index) => `${String(index + 1)},fixture`);
  const { split, manifest, files } = fixture(rows, "\n");
  const first = split.table.parts[0];
  const second = split.table.parts[1];
  assert.ok(first);
  assert.ok(second);
  const missing = new Map(files);
  missing.delete(first.fileName);
  assert.throws(() => reconstructSources(manifest, missing), /Missing part/u);
  const reordered = { ...manifest, tables: [{ ...split.table, parts: [second, first] }] };
  assert.throws(() => reconstructSources(reordered, files), /discontinuous/u);
  const corrupted = new Map(files);
  const original = files.get(first.fileName);
  assert.ok(original);
  corrupted.set(first.fileName, Buffer.concat([original, Buffer.from(" ")]));
  assert.throws(() => reconstructSources(manifest, corrupted), /hash\/size mismatch/u);
  const unsafe = {
    ...manifest,
    tables: [{ ...split.table, parts: [{ ...first, fileName: "../Menu.part000.json" }, second] }],
  };
  assert.throws(() => reconstructSources(unsafe, files));
});

await test("incorrect source hash/count and an oversized single record fail without truncation", () => {
  const { bytes, source, split, manifest, files } = fixture(["1,fixture"], "\n");
  assert.throws(
    () => splitSource({ ...source, sha256: "0".repeat(64) }, bytes),
    /Original bytes\/hash/u,
  );
  assert.throws(() => splitSource({ ...source, rowCount: 2 }, bytes), /Original row count/u);
  const wrongCount = {
    ...manifest,
    tables: [{ ...split.table, source: { ...source, rowCount: 2 } }],
  };
  assert.throws(() => reconstructSources(wrongCount, files), /Reconstructed source/u);
  assert.throws(() => fixture([`1,${"x".repeat(24_576)}`], "\n"), /exceeds the part limit/u);
});

await test("the authorized NYPL manifest records four complete original CSV artifacts", async () => {
  const expected = expectedInputsSchema.parse(
    JSON.parse(await readFile(new URL("../snapshots/nypl-inputs.json", import.meta.url), "utf8")),
  );
  assert.deepEqual(
    expected.map((source) => source.rowCount),
    [72, 432, 3469, 2534],
  );
  assert.equal(
    expected.reduce((sum, source) => sum + source.byteLength, 0),
    519007,
  );
});
