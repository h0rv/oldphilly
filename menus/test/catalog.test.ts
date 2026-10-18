import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArchive } from "../src/model.ts";
import {
  parseCatalog,
  validateCatalogSources,
  catalogDateSchema,
  catalogLocationSchema,
  reviewSchema,
} from "../src/catalog-model.ts";
import { buildCatalog } from "../scripts/build-catalog.ts";

const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);
const catalog = parseCatalog(
  JSON.parse(await readFile(new URL("../public/catalog.json", import.meta.url), "utf8")),
);
const scans: unknown = JSON.parse(
  await readFile(new URL("../public/scans.json", import.meta.url), "utf8"),
);
function menu(id: string) {
  const result = catalog.menus.find((m) => m.id === id);
  assert.ok(result, id);
  return result;
}

await test("normalized catalog retains every source artifact and owns every source page exactly once", () => {
  assert.deepEqual(
    catalog.menus.map((m) => m.sourceRecordId).toSorted(),
    archive.menus.map((m) => m.id).toSorted(),
  );
  assert.equal(
    catalog.pages.length,
    archive.menus.reduce((n, m) => n + m.pages.length, 0),
  );
  assert.equal(validateCatalogSources(catalog, archive), catalog);
  assert.deepEqual(buildCatalog(archive, scans), catalog);
  assert.throws(() => parseCatalog({ ...catalog, pages: [...catalog.pages, catalog.pages[0]] }));
  assert.throws(() => parseCatalog({ ...catalog, citations: [] }));
  const missing = catalog.menus.map((m) => (m.id === "nypl-28620" ? { ...m, pageIds: [] } : m));
  assert.throws(() => parseCatalog({ ...catalog, menus: missing }));
});

await test("new source records remain visible and explicitly await review without annotation code changes", () => {
  const source = archive.menus.find((m) => m.provider === "CIA");
  assert.ok(source);
  const expanded = parseArchive({
    ...archive,
    menus: [
      ...archive.menus,
      {
        ...source,
        id: "cia-new-record",
        recordId: "new-record",
        name: "New source item",
        catalog: { ...source.catalog, restau: "New catalog venue candidate" },
      },
    ],
  });
  const result = buildCatalog(expanded, scans);
  const added = result.menus.find((m) => m.id === "cia-new-record");
  assert.ok(added);
  assert.equal(added.review.status, "not-reviewed");
  assert.equal(added.date.review.status, "not-reviewed");
  assert.equal(result.venues.find((v) => v.id === added.venueId)?.kind, "unknown");
  assert.deepEqual(added.date.sourceValues, [
    { name: "catalog date", value: source.date.catalogValue },
    { name: "source archive date", value: source.date.value ?? "" },
  ]);
});

await test("dining venues replace sponsors while uncertain items and historical branches remain separate", () => {
  const hotel = catalog.venues.find((v) => v.id === menu("nypl-14406").venueId);
  assert.ok(hotel);
  assert.equal(hotel.name, "Bellevue-Stratford Hotel");
  assert.equal(hotel.kind, "hotel");
  const unknown = catalog.venues.find((v) => v.id === menu("nypl-21244").venueId);
  assert.ok(unknown);
  assert.equal(unknown.kind, "unknown");
  assert.equal(unknown.review.status, "unresolved");
  assert.notEqual(menu("nypl-14050").venueId, menu("nypl-14406").venueId);
  assert.notEqual(menu("nypl-29916").venueId, menu("nypl-30462").venueId);
  assert.notEqual(menu("cia-17581").venueId, menu("cia-12094").venueId);
  assert.notEqual(menu("nypl-28620").venueId, menu("cia-12094").venueId);
  assert.notEqual(menu("cia-19539").venueId, menu("cia-13733").venueId);
  assert.equal(menu("nypl-24827").review.status, "conflict");
  assert.equal(menu("nypl-24827").location.precision, "unknown");
});

await test("review status requires evidence and uninspected scans stay explicitly unavailable", () => {
  assert.equal(
    reviewSchema.safeParse({ status: "verified", reason: "Reviewed", citationIds: [] }).success,
    false,
  );
  for (const status of ["unresolved", "conflict", "source-unavailable"])
    assert.equal(
      reviewSchema.safeParse({ status, reason: null, citationIds: ["source"] }).success,
      false,
    );
  assert.ok(catalog.pages.some((p) => p.image !== null));
  assert.ok(
    catalog.pages.every(
      (p) => p.review.status === "source-unavailable" || p.review.status === "conflict",
    ),
  );
  assert.ok(catalog.pages.filter((p) => p.menuId === "nypl-24827").every((p) => p.image === null));
  assert.equal(
    catalog.pages.some((p) => p.sourcePageId === "58186" && p.image !== null),
    false,
  );
  for (const id of ["53307", "53308", "53309"])
    assert.ok(catalog.pages.find((p) => p.id === `nypl-${id}`)?.image);
});

await test("date precision and original values stay separate, with valid days and ordered ranges", () => {
  const early = menu("nypl-13759").date;
  assert.equal(early.precision, "year");
  assert.ok(early.sourceValues.some((s) => s.value === "1900-11-29"));
  const conflict = menu("nypl-33270").date;
  assert.equal(conflict.review.status, "conflict");
  assert.ok(conflict.sourceValues.some((s) => s.value === "1915-01-01"));
  assert.ok(conflict.sourceValues.some((s) => s.value === "1915-01-02"));
  const common = {
    label: "Date",
    basis: "Catalog",
    sourceValues: [],
    review: { status: "not-reviewed", reason: null, citationIds: [] },
  };
  assert.equal(
    catalogDateSchema.safeParse({ ...common, precision: "day", value: "1900-02-29", year: 1900 })
      .success,
    false,
  );
  assert.equal(
    catalogDateSchema.safeParse({ ...common, precision: "month", value: "1900-13", year: 1900 })
      .success,
    false,
  );
  assert.equal(
    catalogDateSchema.safeParse({ ...common, precision: "year", value: "1900", year: 1901 })
      .success,
    false,
  );
  assert.equal(
    catalogDateSchema.safeParse({
      ...common,
      precision: "range",
      start: "1900-12-01",
      end: "1900-01-01",
      year: 1900,
    }).success,
    false,
  );
  assert.equal(
    catalogDateSchema.safeParse({
      ...common,
      precision: "range",
      start: "1900-01-01",
      end: "1901-12-31",
      year: 1900,
    }).success,
    true,
  );
});

await test("representative points require coordinate evidence; block or neighborhood precision cannot invent a point", () => {
  for (const id of [
    "nypl-32212",
    "nypl-33662",
    "nypl-33793",
    "nypl-33815",
    "nypl-33972",
    "nypl-30472",
  ]) {
    const location = menu(id).location;
    assert.equal(location.precision, "exact");
    assert.match(location.basis, /representative building/u);
    assert.ok(location.evidenceCitationIds.length > 0);
  }
  const common = {
    address: null,
    basis: "Historical evidence",
    evidenceCitationIds: ["evidence"],
    review: { status: "verified", reason: "Reviewed", citationIds: ["evidence"] },
  };
  assert.equal(
    catalogLocationSchema.safeParse({
      ...common,
      precision: "block",
      bbox: [-75.16, 39.95, -75.16, 39.95],
    }).success,
    false,
  );
  assert.equal(
    catalogLocationSchema.safeParse({
      ...common,
      precision: "neighborhood",
      area: "Old City",
      lat: 39.95,
      lng: -75.15,
    }).success,
    false,
  );
  assert.equal(
    catalogLocationSchema.safeParse({
      ...common,
      precision: "exact",
      lat: 39.95,
      lng: -75.15,
      area: "Old City",
      bbox: [-75.2, 39.9, -75.19, 39.91],
    }).success,
    false,
  );
});

await test("source price ordering conflicts remain visible and cannot pass as verified prices", () => {
  const price = menu("nypl-29996").priceReview;
  assert.equal(price.status, "conflict");
  assert.match(price.reason, /17 source items/u);
  const changed = parseCatalog({
    ...catalog,
    menus: catalog.menus.map((m) =>
      m.id === "nypl-29996"
        ? Object.assign({}, m, {
            priceReview: Object.assign({}, m.priceReview, { status: "verified" }),
          })
        : m,
    ),
  });
  assert.throws(() => validateCatalogSources(changed, archive), /Unreviewed source price order/u);
});
