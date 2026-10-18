import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { join } from "node:path";
import { z } from "zod";
import type { Dish, Menu, MenuDate } from "../src/model.ts";
import { nyplMenuIds } from "./selection.ts";

const catalogSchema = z.record(z.string(), z.string());
const id = z.string().regex(/^\d+$/u);
const menuRowSchema = z.object({
  id,
  name: z.string(),
  sponsor: z.string(),
  date: z.string(),
  catalogue_date_original: z.string().optional(),
  date_verification: z.string().optional(),
  cuisine_analytical_label: z.string().optional(),
  quality_notes: z.string().optional(),
  currency: z.string(),
});
export const nyplPageRowSchema = z.object({
  id,
  menu_id: id,
  page_number: z
    .union([z.literal(""), z.string().regex(/^\d+(?:\.0+)?$/u)])
    .transform((raw) => (raw === "" ? null : Number(raw))),
});
const priceCell = z
  .union([z.literal(""), z.string().regex(/^\d+(?:\.\d+)?$/u)])
  .transform((raw) => (raw === "" ? null : Number(raw)));
const itemRowSchema = z.object({
  id,
  menu_page_id: id,
  dish_id: id,
  price: priceCell,
  high_price: priceCell,
});
const dishRowSchema = z.object({ id, name: z.string().min(1) });

type SourceRow<T> = { readonly data: T; readonly catalog: Readonly<Record<string, string>> };

async function* csvRows<T>(path: string, schema: z.ZodType<T>): AsyncGenerator<SourceRow<T>> {
  const parser = createReadStream(path).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true }),
  );
  for await (const value of parser) {
    const raw: unknown = value;
    yield { data: schema.parse(raw), catalog: catalogSchema.parse(raw) };
  }
}

export function catalogDate(raw: string): MenuDate {
  if (raw === "")
    return {
      label: "Undated",
      year: null,
      value: null,
      precision: "unknown",
      basis: "No catalog date",
      catalogValue: raw,
    };
  // Catalog timestamps can overstate printed precision. Retain the raw value,
  // and show only a year until a printed date has been reviewed.
  const value = raw.slice(0, 4);
  return {
    label: value,
    year: Number(value),
    value,
    precision: "year",
    basis: "Catalog year; printed date precision has not been checked",
    catalogValue: raw,
  };
}

export function nyplDate(
  menuId: string,
  raw: string,
  originalRaw = raw,
  verification = "",
): MenuDate {
  if (menuId === "33270")
    return {
      label: "January 2, 1915",
      year: 1915,
      value: "1915-01-02",
      precision: "day",
      basis: "Printed date correction verified during source audit",
      catalogValue: originalRaw,
    };
  if (
    verification === "printed scan date" ||
    verification === "catalogue date plus printed date code"
  ) {
    const value = z.iso.date().parse(raw);
    return {
      label: new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`)),
      year: Number(value.slice(0, 4)),
      value,
      precision: "day",
      basis: `Printed date reviewed in supplied source audit: ${verification}`,
      catalogValue: originalRaw,
    };
  }
  return { ...catalogDate(raw), catalogValue: originalRaw };
}

export async function importNypl(directory: string, snapshotId: string): Promise<Menu[]> {
  const menus = new Map<string, SourceRow<z.infer<typeof menuRowSchema>>>();
  for await (const row of csvRows(join(directory, "Menu.csv"), menuRowSchema)) {
    if (nyplMenuIds.has(Number(row.data.id))) menus.set(row.data.id, row);
  }
  const pages = new Map<string, z.infer<typeof nyplPageRowSchema>>();
  for await (const row of csvRows(join(directory, "MenuPage.csv"), nyplPageRowSchema)) {
    if (menus.has(row.data.menu_id)) pages.set(row.data.id, row.data);
  }
  const items = new Map<string, z.infer<typeof itemRowSchema>[]>();
  const dishIds = new Set<string>();
  let itemCount = 0;
  for await (const row of csvRows(join(directory, "MenuItem.csv"), itemRowSchema)) {
    const item = row.data;
    if (!pages.has(item.menu_page_id)) continue;
    const group = items.get(item.menu_page_id) ?? [];
    group.push(item);
    items.set(item.menu_page_id, group);
    dishIds.add(item.dish_id);
    itemCount += 1;
  }
  const dishes = new Map<string, string>();
  for await (const row of csvRows(join(directory, "Dish.csv"), dishRowSchema)) {
    if (dishIds.has(row.data.id)) dishes.set(row.data.id, row.data.name);
  }
  const priced = [...items.values()].flat().filter((item) => item.price !== null).length;
  if (
    menus.size !== 72 ||
    pages.size !== 432 ||
    itemCount !== 3469 ||
    dishIds.size !== 2534 ||
    priced !== 1488
  ) {
    throw new Error(
      `NYPL snapshot changed: ${JSON.stringify({ menus: menus.size, pages: pages.size, items: itemCount, dishes: dishIds.size, priced })}`,
    );
  }
  return [...menus.entries()].map(([menuId, source]) => {
    const row = source.data;
    const sourcePages = [...pages.values()].filter((page) => page.menu_id === menuId);
    if (menuId === "29916") {
      const advertisement = sourcePages.find((page) => page.page_number === 4);
      if (advertisement === undefined || (items.get(advertisement.id)?.length ?? 0) !== 0) {
        throw new Error(
          "Verify the audited Rosoff advertisement page ID/number before importing menu 29916; a transcribed page must never be dropped.",
        );
      }
    }
    const visiblePages = sourcePages
      .filter((page) => !(menuId === "29916" && page.page_number === 4))
      .toSorted((a, b) => {
        if (a.page_number === b.page_number) return Number(a.id) - Number(b.id);
        if (a.page_number === null) return 1;
        if (b.page_number === null) return -1;
        return a.page_number - b.page_number;
      });
    const menuDishes: Dish[] = visiblePages.flatMap((page) =>
      (items.get(page.id) ?? []).map((item) => {
        const name = dishes.get(item.dish_id);
        if (name === undefined) throw new Error(`Missing Dish ${item.dish_id}`);
        return {
          id: item.id,
          dishId: item.dish_id,
          pageId: page.id,
          name,
          price: item.price,
          priceHigh: item.high_price,
        };
      }),
    );
    const date = nyplDate(
      menuId,
      row.date,
      row.catalogue_date_original ?? row.date,
      row.date_verification,
    );
    const excluded = sourcePages.find((page) => menuId === "29916" && page.page_number === 4);
    const notes =
      excluded === undefined
        ? []
        : [
            `Page 4 (NYPL page ${excluded.id}, https://menus.nypl.org/menu_pages/${excluded.id}) is an unrelated Rosoff New York advertisement with no transcribed items; omitted from display and retained in the verified source snapshot.`,
          ];
    if (menuId === "33662") notes.push("Date is catalog-only; the printed scan is faint.");
    if (menuId === "24827")
      notes.push(
        "Image association audit: NYPL menu 24827, page 38725, image 476920 resolves to an official digital catalog record naming St. Nicholas Hotel with an uncertain New York location, unlike the bulk catalog's Continental Hotel in Philadelphia. Compare https://old-digitalcollections.nypl.org/items/510d47db-1a2d-a3d9-e040-e00a18064a99. Original CSV rows and source links are retained; this image is withheld from the story pending review.",
      );
    if (row.quality_notes !== undefined && row.quality_notes !== "") notes.push(row.quality_notes);
    const cuisine = row.cuisine_analytical_label ?? "";
    return {
      id: `nypl-${menuId}`,
      name: row.name || row.sponsor || `Menu ${menuId}`,
      provider: "NYPL",
      collection: "Buttolph Collection of Menus · What's on the Menu?",
      recordId: menuId,
      url: `https://menus.nypl.org/menus/${menuId}`,
      rights:
        "NYPL menu data is available for reuse; scans have item-specific rights. Consult the library record before reusing images.",
      scanNote:
        menuId === "24827"
          ? "Scan attribution is disputed. The bulk catalog names Philadelphia’s Continental Hotel; NYPL’s current image record names St. Nicholas Hotel, with its New York location marked uncertain."
          : null,
      snapshotId,
      date,
      location: null,
      locationNote:
        menuId === "30411"
          ? "Philadelphia is established; the exact Horn & Hardart outlet is unresolved. No pin assigned."
          : "Catalog place may name the sponsoring club rather than the venue. No location assigned without review.",
      cuisines: ["American", "French", "Seafood", "Continental"].filter((label) =>
        new RegExp(`\\b${label}\\b`, "iu").test(cuisine),
      ),
      cuisineBasis:
        cuisine === ""
          ? "Not assigned by the catalog"
          : `Analytical labels from the supplied source audit, not NYPL catalog categories: ${cuisine}`,
      notes,
      currency: row.currency,
      pages: visiblePages.map((page) => ({
        id: page.id,
        label:
          page.page_number === null
            ? `Scan ${page.id} · page number unrecorded`
            : `Page ${String(page.page_number)}`,
        url: `https://menus.nypl.org/menu_pages/${page.id}`,
        transcript: "",
      })),
      dishes: menuDishes,
      catalog: source.catalog,
    };
  });
}
