import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArchive, locationSchema } from "../src/model.ts";
import { basemapSchema } from "../src/basemap.ts";

const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);
const boundaries = basemapSchema.parse(
  JSON.parse(
    await readFile(
      new URL("../snapshots/philadelphia-neighborhoods.json", import.meta.url),
      "utf8",
    ),
  ),
);

function inRing(lng: number, lat: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  let previous = ring.at(-1);
  for (const current of ring) {
    if (previous === undefined) return false;
    const [x1, y1] = previous;
    const [x2, y2] = current;
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) inside = !inside;
    previous = current;
  }
  return inside;
}

await test("every published point belongs to its declared area in the licensed reference geometry", () => {
  const located = archive.menus.filter((menu) => menu.location !== null);
  assert.ok(located.length > 0);
  for (const menu of located) {
    const point = menu.location;
    assert.ok(point);
    const area = boundaries.features.find((feature) => feature.properties.name === point.area);
    assert.ok(area, `${menu.id}: unknown area ${point.area}`);
    assert.ok(
      area.geometry.coordinates.some((polygon) => {
        const [outer, ...holes] = polygon;
        return (
          outer !== undefined &&
          inRing(point.lng, point.lat, outer) &&
          !holes.some((hole) => inRing(point.lng, point.lat, hole))
        );
      }),
      `${menu.id}: point is outside ${point.area}`,
    );
    assert.equal(
      locationSchema.safeParse({ ...point, lat: point.lng, lng: point.lat }).success,
      false,
    );
  }
});

await test("reviewed CIA venue groups stay separate from the other Bookbinders address", () => {
  const cia = archive.menus.filter((menu) => menu.provider === "CIA");
  assert.deepEqual(
    cia
      .filter((menu) => menu.location !== null)
      .map((menu) => menu.recordId)
      .toSorted(),
    ["12094", "16186", "16789", "18438", "19268", "8063", "8701"],
  );
  for (const recordId of ["8063", "12094"]) {
    const point = cia.find((menu) => menu.recordId === recordId)?.location;
    assert.ok(point);
    assert.equal(point.address, "125 Walnut Street");
    assert.ok(Math.abs(point.lat - (39 + 56 / 60 + 48.8 / 3600)) < 1e-10);
    assert.ok(Math.abs(point.lng + (75 + 8 / 60 + 38 / 3600)) < 1e-10);
  }
  for (const recordId of ["8701", "16186", "16789", "18438"]) {
    const point = cia.find((menu) => menu.recordId === recordId)?.location;
    assert.ok(point);
    assert.equal(point.address, "200 South Broad Street · Bellevue-Stratford Hotel");
    assert.ok(Math.abs(point.lat - (39 + 56 / 60 + 56 / 3600)) < 1e-10);
    assert.ok(Math.abs(point.lng + (75 + 9 / 60 + 54 / 3600)) < 1e-10);
  }
  for (const recordId of ["17581", "17072"])
    assert.equal(cia.find((menu) => menu.recordId === recordId)?.location, null);
});

await test("only the six print-audited NYPL Bellevue records use the reviewed post-1904 hotel point", () => {
  const menus = archive.menus.filter(
    (menu) =>
      menu.provider === "NYPL" &&
      menu.location?.address.startsWith("200 South Broad Street") === true,
  );
  assert.deepEqual(menus.map((menu) => menu.recordId).toSorted(), [
    "30431",
    "32047",
    "33270",
    "33548",
    "33796",
    "34327",
  ]);
  for (const menu of menus) {
    const point = menu.location;
    assert.ok(point);
    assert.equal(menu.catalog["curated_venue"], "Bellevue-Stratford Hotel");
    assert.equal(menu.catalog["date_verification"], "printed scan date");
    assert.ok(menu.date.year !== null && menu.date.year >= 1904);
    assert.ok(Math.abs(point.lat - (39 + 56 / 60 + 56 / 3600)) < 1e-10);
    assert.ok(Math.abs(point.lng + (75 + 9 / 60 + 54 / 3600)) < 1e-10);
    assert.match(point.evidence, /Q7716429/u);
    assert.match(point.address, /^200 South Broad Street/u);
  }
});

await test("new NYPL points require exact audited addresses, venue IDs and gazetteer coordinates", () => {
  const expected = [
    {
      ids: ["nypl-27260"],
      venue: "Warwick Hotel",
      address: "1701 Locust Street",
      lat: 39 + 56 / 60 + 56 / 3600,
      lng: -(75 + 10 / 60 + 12 / 3600),
      entity: "Q7773621",
      earliest: 1925,
    },
    {
      ids: ["nypl-29996", "nypl-30777"],
      venue: "Benjamin Franklin Hotel",
      address: "834 Chestnut Street",
      lat: 39 + 57 / 60,
      lng: -(75 + 9 / 60 + 18 / 3600),
      entity: "Q4885674",
      earliest: 1925,
    },
  ];
  for (const group of expected)
    for (const id of group.ids) {
      const menu = archive.menus.find((record) => record.id === id);
      assert.ok(menu?.location);
      assert.equal(menu.catalog["curated_address"], group.address);
      assert.equal(menu.catalog["curated_venue"], group.venue);
      assert.equal(menu.catalog["date_verification"], "printed scan date");
      assert.ok(menu.date.year !== null && menu.date.year >= group.earliest);
      assert.ok(Math.abs(menu.location.lat - group.lat) < 1e-10);
      assert.ok(Math.abs(menu.location.lng - group.lng) < 1e-10);
      assert.ok(menu.location.evidence.includes(group.entity));
    }
  assert.equal(archive.menus.filter((menu) => menu.location !== null).length, 16);
});

await test("Palm's exact catalog address supports a building point without inventing a date", () => {
  const palm = archive.menus.find((menu) => menu.id === "cia-19268");
  assert.ok(palm?.location);
  assert.equal(palm.catalog["addres"], "200 South Broad");
  assert.equal(palm.date.precision, "unknown");
  assert.equal(
    palm.location.lat,
    archive.menus.find((menu) => menu.id === "cia-8701")?.location?.lat,
  );
  for (const id of [
    "cia-6425",
    "nypl-32212",
    "nypl-33662",
    "nypl-33793",
    "nypl-33815",
    "nypl-33972",
    "nypl-30411",
    "nypl-30462",
    "nypl-29916",
    "nypl-30472",
  ])
    assert.equal(archive.menus.find((menu) => menu.id === id)?.location, null);
});
