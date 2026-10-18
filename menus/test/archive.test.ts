import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArchive, menuDateSchema } from "../src/model.ts";
import { defaults, filterMenus, priceLabel } from "../src/filters.ts";
import { nyplMenuIds } from "../scripts/selection.ts";
import { nyplDate, nyplPageRowSchema } from "../scripts/nypl.ts";

const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);

await test("cross-record invariants reject missing snapshots, duplicate records and orphan items", () => {
  const first = archive.menus[0];
  assert.ok(first);
  assert.throws(() => parseArchive({ ...archive, snapshots: [] }), /missing snapshot/u);
  assert.throws(() => parseArchive({ ...archive, menus: [first, first] }), /Duplicate menu/u);
  const orphan = {
    ...first,
    dishes: [
      {
        id: "test-item",
        dishId: "test-dish",
        pageId: "missing",
        name: "test-only fixture",
        price: null,
        priceHigh: null,
      },
    ],
  };
  assert.throws(() => parseArchive({ ...archive, menus: [orphan] }), /missing page/u);
});

await test("date adapter preserves catalog values and the supplied printed correction", () => {
  assert.equal(nyplMenuIds.size, 72);
  const corrected = nyplDate("33270", "1915-01-01");
  assert.equal(corrected.value, "1915-01-02");
  assert.equal(corrected.catalogValue, "1915-01-01");
  const enriched = nyplDate("33270", "1915-01-02", "1915-01-01");
  assert.equal(enriched.value, "1915-01-02");
  assert.equal(enriched.catalogValue, "1915-01-01");
  const faint = nyplDate("33662", "1915-01-01");
  assert.equal(faint.precision, "year");
  assert.equal(faint.catalogValue, "1915-01-01");
});

await test("NYPL whole-number page fields normalize before the advertisement audit", () => {
  const page = { id: "1", menu_id: "29916", page_number: "4.0" };
  assert.equal(nyplPageRowSchema.parse(page).page_number, 4);
  assert.equal(nyplPageRowSchema.parse({ ...page, page_number: "" }).page_number, null);
  assert.equal(nyplPageRowSchema.safeParse({ ...page, page_number: "4.5" }).success, false);
});

await test("real CIA metadata preserves the original name and unknown date", () => {
  const middleEast = archive.menus.find((m) => m.id === "cia-17865");
  assert.equal(middleEast?.name, "Middle East Restaurant");
  assert.equal(middleEast.date.precision, "unknown");
  assert.equal(middleEast.date.year, null);
});

await test("date schema rejects disagreeing year while preserving raw catalog value", () => {
  const date = {
    label: "1915",
    year: 1915,
    value: "1916",
    precision: "year",
    basis: "test",
    catalogValue: "original",
  };
  assert.equal(menuDateSchema.safeParse(date).success, false);
  assert.equal(menuDateSchema.parse({ ...date, value: "1915" }).catalogValue, "original");
});

await test("all/unknown filters retain unlocated and undated source records", () => {
  assert.equal(filterMenus(archive.menus, defaults).length, archive.menus.length);
  const undated = archive.menus.filter((m) => m.date.year === null);
  assert.deepEqual(
    filterMenus(archive.menus, { ...defaults, decade: "undated" }).map((m) => m.id),
    undated.map((m) => m.id),
  );
  assert.equal(
    filterMenus(archive.menus, { ...defaults, includeUndated: false }).length,
    archive.menus.length - undated.length,
  );
  assert.equal(
    filterMenus(archive.menus, { ...defaults, area: "unlocated" }).length,
    archive.menus.filter((m) => m.location === null).length,
  );
});

await test("combined filters, inclusive date boundaries, reversed dates and empty search", () => {
  const dated = archive.menus.find((m) => m.date.year !== null);
  assert.ok(dated);
  assert.notEqual(dated.date.year, null);
  assert.ok(
    filterMenus(archive.menus, { ...defaults, from: dated.date.year, to: dated.date.year }).some(
      (m) => m.id === dated.id,
    ),
  );
  assert.equal(filterMenus(archive.menus, { ...defaults, from: 2000, to: 1800 }).length, 0);
  assert.equal(
    filterMenus(archive.menus, { ...defaults, search: "__this_menu_does_not_exist__" }).length,
    0,
  );
  const area = dated.location?.area ?? "unlocated";
  assert.ok(
    filterMenus(archive.menus, {
      ...defaults,
      search: dated.name.toUpperCase(),
      collection: dated.provider,
      area,
    }).some((m) => m.id === dated.id),
  );
});

await test("missing prices, zero prices, ranges and unknown currency remain distinct", () => {
  assert.equal(priceLabel(null, null, "USD"), "Price unrecorded");
  assert.equal(priceLabel(0, null, "USD"), "$0.00");
  assert.equal(priceLabel(1.25, 1.5, "Dollars"), "$1.25–$1.50");
  assert.equal(priceLabel(2, null, ""), "2.00 (currency unrecorded)");
});

await test("CIA release retains catalog records and source pages without full transcripts", () => {
  const cia = archive.menus.filter((menu) => menu.provider === "CIA");
  assert.equal(cia.length, 30);
  assert.equal(cia.filter((menu) => menu.date.year !== null).length, 16);
  assert.equal(cia.filter((menu) => menu.date.year === null).length, 14);
  assert.equal(
    cia.flatMap((menu) => menu.pages).filter((page) => page.transcript !== "").length,
    0,
  );
  assert.equal(cia.flatMap((menu) => menu.pages).length, 4);
  assert.ok(cia.every((menu) => menu.catalog["cdmhasocr"] === "0"));
  assert.equal(cia.find((menu) => menu.id === "cia-8063")?.date.value, "1977-02-15");
  assert.equal(cia.find((menu) => menu.id === "cia-17581")?.location, null);
});
