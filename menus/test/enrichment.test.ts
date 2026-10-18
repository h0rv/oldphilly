import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArchive } from "../src/model.ts";
import { parseCatalog } from "../src/catalog-model.ts";
import { enrichmentSchema } from "../src/enrichment.ts";
import { filterMenus, defaults } from "../src/filters.ts";
const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);
const catalog = parseCatalog(
  JSON.parse(await readFile(new URL("../public/catalog.json", import.meta.url), "utf8")),
);
const evidence = enrichmentSchema.parse(
  JSON.parse(await readFile(new URL("../snapshots/venue-evidence.json", import.meta.url), "utf8")),
);
await test("new building matches use source-specific venue metadata independently of machine date readings", () => {
  assert.equal(evidence.points.length, 11);
  for (const match of evidence.points) {
    const normalized = catalog.menus.find((menu) => menu.id === match.menuId);
    assert.ok(normalized);
    assert.equal(normalized.location.precision, "exact");
    const original = archive.menus.find((menu) => menu.id === match.menuId);
    assert.ok(original);
    assert.equal(original.location, null);
    if (!evidence.dateReadings.some((reading) => reading.menuId === match.menuId))
      assert.equal(normalized.date.precision, original.date.precision);
    assert.ok(normalized.location.review.citationIds.length >= 3);
  }
  for (const id of ["nypl-22396", "nypl-14110", "nypl-21577", "nypl-27457"]) {
    assert.equal(catalog.menus.find((menu) => menu.id === id)?.location.precision, "unknown");
  }
  assert.equal(catalog.menus.filter((menu) => menu.location.precision === "exact").length, 33);
});
await test("twenty-year date conflict retains both catalog values and leaves the 1930 filter", () => {
  const menu = catalog.menus.find((item) => item.id === "nypl-27457");
  assert.ok(menu);
  assert.equal(menu.date.precision, "unknown");
  assert.equal(menu.date.review.status, "conflict");
  assert.equal(
    catalog.venues.find((venue) => venue.id === menu.venueId)?.review.status,
    "unresolved",
  );
  assert.ok(
    catalog.pages
      .filter((page) => page.menuId === menu.id)
      .every((page) => page.image === null && page.review.status === "conflict"),
  );
  assert.ok(menu.date.sourceValues.some((value) => value.value === "1930-11-03"));
  assert.ok(menu.date.sourceValues.some((value) => value.value.includes("1910-12-16")));
  const source = archive.menus.find((item) => item.id === menu.id);
  assert.ok(source);
  const view = { ...source, date: menu.date };
  assert.equal(filterMenus([view], { ...defaults, decade: "1930" }).length, 0);
  assert.equal(filterMenus([view], { ...defaults, decade: "undated" }).length, 1);
});
await test("all CIA structured addresses are reviewed without replacing original names or inventing geometry", () => {
  assert.equal(evidence.addresses.filter((item) => item.menuId.startsWith("cia-")).length, 15);
  assert.equal(evidence.addresses.filter((item) => item.menuId.startsWith("nypl-")).length, 8);
  for (const record of evidence.addresses) {
    const menu = catalog.menus.find((item) => item.id === record.menuId);
    assert.ok(menu);
    assert.notEqual(menu.location.address, null);
  }
  assert.equal(
    archive.menus.find((menu) => menu.id === "cia-17865")?.name,
    "Middle East Restaurant",
  );
  for (const id of ["cia-17581", "cia-17072", "cia-13733", "cia-13777", "cia-20281", "cia-20356"]) {
    assert.equal(catalog.menus.find((menu) => menu.id === id)?.location.precision, "unknown");
  }
});
await test("machine-supported dates retain uncertainty, image hashes and source day while preserving a two-day event", () => {
  assert.equal(evidence.dateReadings.length, 5);
  for (const reading of evidence.dateReadings) {
    const menu = catalog.menus.find((item) => item.id === reading.menuId);
    assert.ok(menu);
    assert.equal(menu.date.review.status, "unresolved");
    assert.match(menu.date.basis, /not visually verified/u);
    assert.ok(menu.date.sourceValues.some((value) => value.value === reading.imageSha256));
    assert.ok(
      catalog.pages.some(
        (page) =>
          page.menuId === reading.menuId &&
          page.sourcePageId === reading.pageId &&
          page.image?.imageId === reading.imageId,
      ),
    );
  }
  const range = catalog.menus.find((menu) => menu.id === "nypl-26300")?.date;
  assert.equal(range?.precision, "range");
  assert.equal(range.start, "1906-10-08");
  assert.equal(range.end, "1906-10-09");
  assert.ok(range.sourceValues.some((value) => value.value === "1906-10-08"));
});
