import { readFile, writeFile } from "node:fs/promises";
import { ciaExportSchema, withoutCiaTranscripts } from "./cia.ts";
import { sha256 } from "./nypl-transfer.ts";

const input = process.argv[2];
const output = process.argv[3];
if (input === undefined || output === undefined)
  throw new Error(
    "Usage: node scripts/prepare-cia-metadata.ts <private-original.json> <metadata.json>",
  );
const bytes = await readFile(input);
if (
  bytes.length !== 70874 ||
  sha256(bytes) !== "3abe44636acac88ecccd8d04f6570c952e53829eafd496c9c008c8508322aafb"
)
  throw new Error("Private CIA input differs from the verified original");
const records = ciaExportSchema.parse(JSON.parse(bytes.toString("utf8")));
const omitted = records.filter(
  (record) => typeof record["transc"] === "string" && record["transc"] !== "",
);
if (
  omitted.length !== 4 ||
  !records.every(
    (record) => typeof record["rights"] === "string" && record["rights"].includes("/CNE/1.0/"),
  )
)
  throw new Error("CIA rights/transcript audit no longer matches the original");
await writeFile(output, `${JSON.stringify(withoutCiaTranscripts(records), null, 2)}\n`);
process.stdout.write(
  `Retained ${String(records.length)} catalog records; omitted ${String(omitted.length)} full transcripts.\n`,
);
