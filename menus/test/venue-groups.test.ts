import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCatalog } from "../src/catalog-model.ts";
import { venueGroups, dateSummary } from "../src/venue-groups.ts";
const catalog = parseCatalog(
  JSON.parse(await readFile(new URL("../public/catalog.json", import.meta.url), "utf8")),
);
await test("name browsing joins dates without inheriting a branch address or merging identities", () => {
  const groups = venueGroups(catalog);
  const original = groups.find((group) => group.venue.name === "Old Original Bookbinder's");
  assert.ok(original);
  assert.equal(original.venueIds.length, 2);
  assert.deepEqual(
    original.menus.map((menu) => menu.date.year),
    [1953, 1957, 1977, 1978],
  );
  assert.equal(original.menus.find((menu) => menu.id === "nypl-28620")?.location.address, null);
  assert.equal(
    original.menus.find((menu) => menu.id === "cia-8063")?.location.address,
    "125 Walnut Street",
  );
  assert.equal(dateSummary(original.menus), "1953–1978");
  assert.equal(
    groups.reduce((total, group) => total + group.menus.length, 0),
    catalog.menus.length,
  );
  const middleEast = groups.find((group) => group.venue.name === "Middle East Restaurant");
  assert.ok(middleEast);
  assert.equal(dateSummary(middleEast.menus), "Undated");
});
