import { z } from "zod";
import type { Menu, MenuDate } from "../src/model.ts";

// CONTENTdm represents absent metadata as {}, rather than null or a string.
const textCell = z
  .union([z.string(), z.strictObject({})])
  .transform((value) => (typeof value === "string" ? value : ""));
const sourceRecord = z.object({
  _pointer: z.int().positive(),
  dmrecord: z.string().regex(/^\d+$/u),
  title: z.string().min(1),
  restau: textCell,
  date: textCell,
  addres: textCell,
  cuisin: textCell,
  notes: textCell,
  descri: textCell,
  rights: textCell,
  source: textCell,
  transc: textCell,
  find: z.string(),
  cdmhasocr: z.string(),
});
const rawCatalog = z.record(z.string(), z.union([z.string(), z.number(), z.strictObject({})]));
export const ciaExportSchema = z.array(rawCatalog).length(30);

// Access and a CNE statement do not establish permission to republish full text.
// Apply this at every CIA import boundary, including private research exports.
export function withoutCiaTranscripts(records: z.infer<typeof ciaExportSchema>) {
  return records.map((catalog) =>
    typeof catalog["transc"] === "string" && catalog["transc"] !== ""
      ? { ...catalog, transc: "" }
      : catalog,
  );
}

export function ciaDate(raw: string): MenuDate {
  if (raw === "")
    return {
      precision: "unknown",
      year: null,
      value: null,
      label: "Undated",
      basis: "No date in the CIA catalog",
      catalogValue: raw,
    };
  const year = Number(raw.slice(0, 4));
  const common = {
    year,
    value: raw,
    catalogValue: raw,
    basis: "CIA catalog date; no additional printed precision inferred",
  };
  if (/^\d{4}$/u.test(raw)) return { ...common, precision: "year", label: raw };
  if (/^\d{4}-\d{2}$/u.test(raw)) return { ...common, precision: "month", label: raw };
  if (/^\d{4}-\d{2}-\d{2}$/u.test(raw))
    return {
      ...common,
      precision: "day",
      label: new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
        new Date(`${raw}T00:00:00Z`),
      ),
    };
  throw new Error(`Unrecognized CIA date: ${raw}`);
}

export function importCia(value: unknown, snapshotId: string): Menu[] {
  const records = withoutCiaTranscripts(ciaExportSchema.parse(value));
  const menus = records.map((catalog) => {
    const record = sourceRecord.parse(catalog);
    if (String(record["_pointer"]) !== record.dmrecord)
      throw new Error("CIA pointer and record ID disagree");
    const id = record.dmrecord;
    const url = `https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/${id}`;
    const restaurant = record.restau
      .replace(/\s*\([^)]*\);?\s*$/u, "")
      .replace(/;\s*$/u, "")
      .trim();
    const singlePage = /\.(?:jp2|jpe?g|png)$/iu.test(record.find);
    const notes = [record.descri, record.notes].filter((text) => text !== "");
    if (!singlePage)
      notes.push(
        "This export contains the parent catalog record only. Child scan-page identifiers and transcripts are not included; open the library viewer to turn the pages.",
      );
    notes.push(
      "Full menu text is not reproduced here. Copyright Not Evaluated does not establish reuse permission; consult the holding library for the menu itself.",
    );
    return {
      id: `cia-${id}`,
      name: restaurant || record.title,
      provider: "CIA",
      collection: "The Culinary Institute of America · Menu Collection (p16940coll1)",
      recordId: id,
      url,
      rights: record.rights || "Rights are unrecorded; consult the holding library.",
      scanNote: null,
      snapshotId,
      date: ciaDate(record.date),
      location: null,
      locationNote:
        record.addres === ""
          ? "Venue coordinates have not been established. The record remains in the list."
          : `Catalog address: ${record.addres}. A coordinate needs a reviewed venue match before a pin can be assigned.`,
      cuisines: record.cuisin
        .split(";")
        .map((text) => text.trim())
        .filter((text) => text !== ""),
      cuisineBasis:
        record.cuisin === ""
          ? "Not assigned in the CIA catalog"
          : "CIA catalog cuisine field; original values retained",
      notes,
      currency: "",
      pages: singlePage ? [{ id, label: "Menu page", url, transcript: "" }] : [],
      dishes: [],
      catalog,
    } satisfies Menu;
  });
  if (menus.filter((menu) => menu.date.year !== null).length !== 16)
    throw new Error("CIA dated-record count changed");
  return menus;
}
