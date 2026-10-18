import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  expectedInputsSchema,
  jsonBytes,
  maxPartBytes,
  maxPartRows,
  splitSource,
  transferManifestSchema,
} from "./nypl-transfer.ts";

const sourceDirectory = process.argv[2];
const destination = process.argv[3];
if (sourceDirectory === undefined || destination === undefined)
  throw new Error(
    "Usage: node scripts/split-nypl.ts <original-CSV-directory> <new-chunks-directory>",
  );
const expected = expectedInputsSchema.parse(
  JSON.parse(await readFile(new URL("../snapshots/nypl-inputs.json", import.meta.url), "utf8")),
);
const splits = await Promise.all(
  expected.map(async (source) =>
    splitSource(source, await readFile(join(sourceDirectory, source.fileName))),
  ),
);
const manifest = transferManifestSchema.parse({
  format: "nypl-csv-manifest-v1",
  encoding: "utf-8",
  maxPartBytes,
  maxPartRows,
  tables: splits.map((split) => split.table),
});
const manifestBytes = jsonBytes(manifest);
if (manifestBytes.length > maxPartBytes)
  throw new Error("Manifest exceeds the supported handoff size");
await mkdir(destination, { recursive: true });
await Promise.all(
  splits.flatMap((split) =>
    split.files.map((file) =>
      writeFile(join(destination, file.fileName), file.bytes, { flag: "wx" }),
    ),
  ),
);
await writeFile(join(destination, "manifest.json"), manifestBytes, { flag: "wx" });
process.stdout.write(
  `${JSON.stringify({ tables: expected.length, parts: splits.flatMap((split) => split.files).length, maxPartBytes, maxPartRows, destination })}\n`,
);
