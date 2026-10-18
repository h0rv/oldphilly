import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as z from "zod/mini";
import { parseArchive, locationSchema } from "../src/model.ts";
import { importCia } from "./cia.ts";
import { importNypl } from "./nypl.ts";
import { expectedInputsSchema, sha256 } from "./nypl-transfer.ts";

const ciaPath = "snapshots/cia-metadata.json";
const ciaBytes = await readFile(ciaPath);
const ciaHash = createHash("sha256").update(ciaBytes).digest("hex");
if (
  ciaBytes.length !== 56824 ||
  ciaHash !== "38932b1b208c375a14f32f0dbf43b6ee2cd26173e3a91c8957d00b34441b9315"
)
  throw new Error("CIA metadata differs from the verified release derivative");
const snapshotId = "cia-metadata-release-2026-10-18";
const sourceInputs = expectedInputsSchema.parse(
  JSON.parse(await readFile("snapshots/nypl-inputs.json", "utf8")),
);
await Promise.all(
  sourceInputs.map(async (source) => {
    const bytes = await readFile(`snapshots/nypl-selected/${source.fileName}`);
    if (bytes.length !== source.byteLength || sha256(bytes) !== source.sha256)
      throw new Error(`NYPL source differs from the verified transfer: ${source.fileName}`);
  }),
);
const manifestBytes = await readFile("snapshots/nypl-transfer-manifest.json");
if (
  manifestBytes.length !== 17737 ||
  sha256(manifestBytes) !== "f0104d28ba834cfd576ff2dd6f4c6376cfdaa420626abc1ec0a43b9bf327bfb5"
)
  throw new Error("NYPL transfer manifest differs from the supplied index");
const nyplSnapshotId = "nypl-selected-parent-export-2026-10-18";
const menus = [
  ...importCia(JSON.parse(ciaBytes.toString("utf8")), snapshotId),
  ...(await importNypl("snapshots/nypl-selected", nyplSnapshotId)),
];
const annotations = z
  .array(z.strictObject({ menuIds: z.array(z.string()), location: locationSchema }))
  .parse(JSON.parse(await readFile("snapshots/locations.json", "utf8")));
const locations = new Map(
  annotations.flatMap((annotation) =>
    annotation.menuIds.map(
      (id) => [id, annotation.location] satisfies [string, z.infer<typeof locationSchema>],
    ),
  ),
);
for (const id of locations.keys())
  if (!menus.some((menu) => menu.id === id))
    throw new Error(`Location annotation references missing menu ${id}`);
const result = parseArchive({
  schemaVersion: 1,
  title: "Philadelphia historical menus",
  snapshots: [
    {
      id: snapshotId,
      url: "https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1",
      retrievedAt: "2026-10-18T18:02:21.711968Z",
      sha256: ciaHash,
      description:
        "Release metadata derivative of the CIA30 parent export from private Library libfile_d319ffc09b188191b8e065f02d4ad702, version 0. This SHA-256 identifies the 56824-byte derivative, not the unchanged private original (70874 bytes; SHA-256 3abe44636acac88ecccd8d04f6570c952e53829eafd496c9c008c8508322aafb). All 30 catalog records and every field except four full Transcript values are retained. Copyright Not Evaluated establishes no reuse license, so those values are omitted from released source and app output; original research bytes remain private. Rights audit: snapshots/cia-rights-audit.json. Timestamp is Library artifact creation, not original provider retrieval; provider retrieval time was not supplied. Compound child-page metadata is absent.",
    },
    {
      id: nyplSnapshotId,
      url: "https://s3.amazonaws.com/menusdata.nypl.org/gzips/2021_08_01_07_01_17_data.tgz",
      retrievedAt: "2026-10-18T19:22:16.498067Z",
      sha256: sha256(manifestBytes),
      description:
        "Selected and enriched parent export from the NYPL 2021-08-01 bulk archive. All 36 JSON parts read completely through Library; serialized parts, unchanged CSV payloads and four reconstructed original CSV hashes verified. 72 menus, 432 source pages, 3469 item occurrences, 2534 dish rows; 1488 priced occurrences; all IDs unique and all joins resolved. This snapshot SHA-256 identifies the transfer manifest, not the unavailable full bulk archive. Source file identities/hashes are in snapshots/nypl-inputs.json; complete transfer identities are in snapshots/nypl-transfer-index.json (Library libfile_80083c4a24588191918dcce1297f5260). Timestamp is the Library manifest creation time, not original provider retrieval. Original provider retrieval time was not supplied. Parent enrichment preserves original catalog dates and labels printed-date/cuisine review separately. Page 58186 is an unrelated zero-item Rosoff advertisement retained in the source bytes and excluded from display.",
    },
  ],
  menus: menus.map((menu) => Object.assign({}, menu, { location: locations.get(menu.id) ?? null })),
});
await writeFile("public/menus.json", `${JSON.stringify(result)}\n`);
process.stdout.write(
  `${String(result.menus.length)} menus; ${String(result.menus.filter((m) => m.date.year !== null).length)} dated; ${String(result.menus.filter((m) => m.location !== null).length)} located; ${String(result.menus.flatMap((m) => m.pages).filter((p) => p.transcript !== "").length)} transcripts\n`,
);
