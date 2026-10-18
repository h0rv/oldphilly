import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";

export const maxPartBytes = 24_576;
export const maxPartRows = 200;
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const tableName = z.enum(["Menu", "MenuPage", "MenuItem", "Dish"]);
const fileName = z.enum(["Menu.csv", "MenuPage.csv", "MenuItem.csv", "Dish.csv"]);
export const sourceInputSchema = z
  .strictObject({
    table: tableName,
    fileName,
    libraryFileId: z
      .string()
      .regex(/^libfile_[a-f0-9]+$/u)
      .optional(),
    byteLength: z.int().positive(),
    rowCount: z.int().positive(),
    sha256: digest,
  })
  .refine((source) => source.fileName === `${source.table}.csv`, "Table and filename disagree")
  .readonly();
export const expectedInputsSchema = z
  .array(sourceInputSchema)
  .length(4)
  .refine((sources) => new Set(sources.map((source) => source.table)).size === 4)
  .readonly();
const partSchema = z
  .strictObject({
    format: z.literal("nypl-csv-chunk-v1"),
    table: tableName,
    index: z.int().min(0).max(999),
    firstDataRow: z.int().positive(),
    rowCount: z.int().min(1).max(maxPartRows),
    startByte: z.int().nonnegative(),
    byteLength: z.int().positive(),
    sha256: digest,
    csv: z.string(),
  })
  .readonly();
const partDescriptorSchema = z
  .strictObject({
    fileName: z.string().regex(/^(Menu|MenuPage|MenuItem|Dish)\.part\d{3}\.json$/u),
    index: z.int().min(0).max(999),
    firstDataRow: z.int().positive(),
    rowCount: z.int().min(1).max(maxPartRows),
    startByte: z.int().nonnegative(),
    byteLength: z.int().positive(),
    sha256: digest,
    fileBytes: z.int().min(1).max(maxPartBytes),
    fileSha256: digest,
  })
  .readonly();
const transferTableSchema = z
  .strictObject({
    source: sourceInputSchema,
    columns: z.array(z.string().min(1)).min(1).readonly(),
    parts: z.array(partDescriptorSchema).min(1).readonly(),
  })
  .readonly();
export const transferManifestSchema = z
  .strictObject({
    format: z.literal("nypl-csv-manifest-v1"),
    encoding: z.literal("utf-8"),
    maxPartBytes: z.literal(maxPartBytes),
    maxPartRows: z.literal(maxPartRows),
    tables: z.array(transferTableSchema).min(1).max(4).readonly(),
  })
  .refine(
    (manifest) =>
      new Set(manifest.tables.map((table) => table.source.table)).size === manifest.tables.length,
    "Duplicate transfer table",
  )
  .readonly();
const csvEntriesSchema = z.array(
  z.object({
    record: z.array(z.string()).readonly(),
    info: z.object({ bytes: z.int().positive() }),
  }),
);
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type TransferManifest = z.infer<typeof transferManifestSchema>;
type Part = z.infer<typeof partSchema>;

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function csvEntries(bytes: Buffer) {
  const parsed: unknown = parse(bytes, { bom: true, info: true });
  const entries = csvEntriesSchema.parse(parsed);
  if (entries.length < 2 || entries.at(-1)?.info.bytes !== bytes.length)
    throw new Error("CSV must contain a header and data, with every byte accounted for");
  const columns = entries[0]?.record;
  if (columns === undefined || new Set(columns).size !== columns.length)
    throw new Error("CSV header is missing or contains duplicate columns");
  if (!entries.every((entry) => entry.record.length === columns.length))
    throw new Error("CSV row width differs from its header");
  return { entries, columns };
}

function makePart(
  table: SourceInput["table"],
  index: number,
  firstDataRow: number,
  rowCount: number,
  startByte: number,
  bytes: Buffer,
): Part {
  const csv = bytes.toString("utf8");
  if (!Buffer.from(csv, "utf8").equals(bytes)) throw new Error("Input is not lossless UTF-8");
  return partSchema.parse({
    format: "nypl-csv-chunk-v1",
    table,
    index,
    firstDataRow,
    rowCount,
    startByte,
    byteLength: bytes.length,
    sha256: sha256(bytes),
    csv,
  });
}

// CSV parser byte offsets keep quoted newlines, CRLF, BOM and final-newline
// choices intact. Only the first part contains the original header.
export function splitSource(input: SourceInput, bytes: Buffer) {
  const source = sourceInputSchema.parse(input);
  if (bytes.length !== source.byteLength || sha256(bytes) !== source.sha256)
    throw new Error(`Original bytes/hash differ for ${source.fileName}`);
  const { entries, columns } = csvEntries(bytes);
  if (entries.length - 1 !== source.rowCount)
    throw new Error(`Original row count differs for ${source.fileName}`);
  const parts: Part[] = [];
  let startByte = 0;
  let firstDataRow = 1;
  let pending: Part | null = null;
  for (let row = 1; row < entries.length; row += 1) {
    const entry = entries[row];
    if (entry === undefined) throw new Error("Missing parsed CSV record");
    if (row - firstDataRow + 1 > maxPartRows) {
      if (pending === null) throw new Error("Missing completed CSV part");
      parts.push(pending);
      startByte += pending.byteLength;
      firstDataRow = row;
      pending = null;
    }
    let candidate = makePart(
      source.table,
      parts.length,
      firstDataRow,
      row - firstDataRow + 1,
      startByte,
      bytes.subarray(startByte, entry.info.bytes),
    );
    if (jsonBytes(candidate).length > maxPartBytes) {
      if (pending === null)
        throw new Error("A complete CSV record exceeds the part limit; do not truncate it");
      parts.push(pending);
      startByte += pending.byteLength;
      firstDataRow = row;
      candidate = makePart(
        source.table,
        parts.length,
        firstDataRow,
        1,
        startByte,
        bytes.subarray(startByte, entry.info.bytes),
      );
      if (jsonBytes(candidate).length > maxPartBytes)
        throw new Error("A complete CSV record exceeds the part limit; do not truncate it");
    }
    pending = candidate;
  }
  if (pending !== null) parts.push(pending);
  const files = parts.map((part) => ({
    fileName: `${source.table}.part${String(part.index).padStart(3, "0")}.json`,
    bytes: jsonBytes(part),
  }));
  const table = transferTableSchema.parse({
    source,
    columns,
    parts: parts.map((part, index) => {
      const file = files[index];
      if (file === undefined) throw new Error("Missing serialized part");
      return {
        fileName: file.fileName,
        index: part.index,
        firstDataRow: part.firstDataRow,
        rowCount: part.rowCount,
        startByte: part.startByte,
        byteLength: part.byteLength,
        sha256: part.sha256,
        fileBytes: file.bytes.length,
        fileSha256: sha256(file.bytes),
      };
    }),
  });
  return { table, files };
}

export function reconstructSources(value: unknown, files: ReadonlyMap<string, Buffer>) {
  const manifest = transferManifestSchema.parse(value);
  const output = new Map<SourceInput["fileName"], Buffer>();
  for (const table of manifest.tables) {
    const buffers: Buffer[] = [];
    let nextByte = 0;
    let nextRow = 1;
    for (const [index, descriptor] of table.parts.entries()) {
      const expectedName = `${table.source.table}.part${String(index).padStart(3, "0")}.json`;
      if (
        descriptor.index !== index ||
        descriptor.fileName !== expectedName ||
        descriptor.startByte !== nextByte ||
        descriptor.firstDataRow !== nextRow
      )
        throw new Error("Part order, byte range or row range is discontinuous");
      const bytes = files.get(descriptor.fileName);
      if (bytes === undefined) throw new Error(`Missing part ${descriptor.fileName}`);
      if (bytes.length !== descriptor.fileBytes || sha256(bytes) !== descriptor.fileSha256)
        throw new Error(`Serialized part hash/size mismatch: ${descriptor.fileName}`);
      const part = partSchema.parse(JSON.parse(bytes.toString("utf8")));
      if (
        part.table !== table.source.table ||
        part.index !== index ||
        part.startByte !== nextByte ||
        part.firstDataRow !== nextRow ||
        part.rowCount !== descriptor.rowCount ||
        part.byteLength !== descriptor.byteLength ||
        part.sha256 !== descriptor.sha256
      )
        throw new Error(`Part metadata disagrees with manifest: ${descriptor.fileName}`);
      const csv = Buffer.from(part.csv, "utf8");
      if (csv.length !== part.byteLength || sha256(csv) !== part.sha256)
        throw new Error(`CSV payload hash/size mismatch: ${descriptor.fileName}`);
      buffers.push(csv);
      nextByte += csv.length;
      nextRow += part.rowCount;
    }
    const bytes = Buffer.concat(buffers);
    if (
      nextRow - 1 !== table.source.rowCount ||
      bytes.length !== table.source.byteLength ||
      sha256(bytes) !== table.source.sha256
    )
      throw new Error(
        `Reconstructed source hash, size or row count mismatch: ${table.source.fileName}`,
      );
    const { entries, columns } = csvEntries(bytes);
    if (
      entries.length - 1 !== table.source.rowCount ||
      JSON.stringify(columns) !== JSON.stringify(table.columns)
    )
      throw new Error(`Reconstructed CSV schema/count mismatch: ${table.source.fileName}`);
    output.set(table.source.fileName, bytes);
  }
  return output;
}
