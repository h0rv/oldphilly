import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { parseArchive } from "../src/model.ts";
import { expectedInputsSchema, sha256 } from "../scripts/nypl-transfer.ts";
import type { SourceInput } from "../scripts/nypl-transfer.ts";

const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);
const inputs = expectedInputsSchema.parse(
  JSON.parse(await readFile(new URL("../snapshots/nypl-inputs.json", import.meta.url), "utf8")),
);
const rowSchema = z.array(z.record(z.string(), z.string()).readonly()).readonly();
const tables = new Map(
  await Promise.all(
    inputs.map(async (source) => {
      const bytes = await readFile(
        new URL(`../snapshots/nypl-selected/${source.fileName}`, import.meta.url),
      );
      const raw: unknown = parse(bytes, { columns: true, bom: true });
      return [source.table, { bytes, rows: rowSchema.parse(raw) }] satisfies [
        string,
        { bytes: Buffer; rows: z.infer<typeof rowSchema> },
      ];
    }),
  ),
);
function rows(name: SourceInput["table"]) {
  const table = tables.get(name);
  assert.ok(table);
  return table.rows;
}

await test("every complete NYPL source matches its authorized byte hash and row count", () => {
  for (const source of inputs) {
    const table = tables.get(source.table);
    assert.ok(table);
    assert.equal(table.bytes.length, source.byteLength);
    assert.equal(sha256(table.bytes), source.sha256);
    assert.equal(table.rows.length, source.rowCount);
    assert.equal(new Set(table.rows.map((row) => row["id"])).size, source.rowCount);
  }
});

await test("all 3469 occurrences join source menu/page/dish IDs and retain names and prices", () => {
  const menus = new Set(rows("Menu").map((row) => row["id"]));
  const pages = new Map(rows("MenuPage").map((row) => [row["id"], row["menu_id"]]));
  const dishes = new Map(rows("Dish").map((row) => [row["id"], row["name"]]));
  const published = archive.menus.filter((menu) => menu.provider === "NYPL");
  const output = new Map(
    published.flatMap((menu) =>
      menu.dishes.map(
        (dish) =>
          [dish.id, { dish, menu }] satisfies [string, { dish: typeof dish; menu: typeof menu }],
      ),
    ),
  );
  assert.equal(output.size, 3469);
  for (const menuId of pages.values()) assert.ok(menus.has(menuId));
  for (const row of rows("MenuItem")) {
    const sourceId = row["id"];
    if (sourceId === undefined) throw new Error("Source row has no ID");
    const result = output.get(sourceId);
    assert.ok(result, `Missing occurrence ${sourceId}`);
    assert.equal(result.menu.recordId, pages.get(row["menu_page_id"]));
    assert.equal(result.dish.pageId, row["menu_page_id"]);
    assert.equal(result.dish.dishId, row["dish_id"]);
    assert.equal(result.dish.name, dishes.get(row["dish_id"]));
    assert.equal(result.dish.price, row["price"] === "" ? null : Number(row["price"]));
    assert.equal(
      result.dish.priceHigh,
      row["high_price"] === "" ? null : Number(row["high_price"]),
    );
  }
  assert.equal([...output.values()].filter((result) => result.dish.price !== null).length, 1488);
  for (const source of rows("Menu"))
    assert.deepEqual(published.find((menu) => menu.recordId === source["id"])?.catalog, source);
});

await test("all source pages survive except the audited zero-item advertisement", () => {
  const published = new Set(
    archive.menus
      .filter((menu) => menu.provider === "NYPL")
      .flatMap((menu) => menu.pages.map((page) => page.id)),
  );
  assert.equal(published.size, 431);
  assert.equal(archive.menus.find((menu) => menu.id === "nypl-13759")?.pages[0]?.id, "3984");
  for (const page of rows("MenuPage")) {
    const pageId = page["id"];
    if (pageId === undefined) throw new Error("Source page has no ID");
    assert.equal(published.has(pageId), pageId !== "58186");
  }
  assert.ok(
    archive.menus
      .find((menu) => menu.id === "nypl-29916")
      ?.notes.some((note) => note.includes("58186")) === true,
  );
  for (const id of ["49164", "60473"])
    assert.match(
      archive.menus.flatMap((menu) => menu.pages).find((page) => page.id === id)?.label ?? "",
      /unrecorded/u,
    );
});

await test("the complete combined export has 102 source records, 88 dated and 14 undated", () => {
  assert.equal(archive.menus.length, 102);
  assert.equal(archive.menus.filter((menu) => menu.date.year !== null).length, 88);
  assert.equal(archive.menus.filter((menu) => menu.date.year === null).length, 14);
  assert.equal(archive.menus.filter((menu) => menu.provider === "NYPL").length, 72);
  assert.equal(archive.menus.flatMap((menu) => menu.pages).length, 435);
  assert.equal(archive.menus.find((menu) => menu.id === "nypl-30411")?.location, null);
  assert.equal(
    archive.menus.find((menu) => menu.id === "nypl-33270")?.date.catalogValue,
    "1915-01-01",
  );
  assert.equal(archive.menus.find((menu) => menu.id === "nypl-33270")?.date.value, "1915-01-02");
  assert.deepEqual(archive.menus.find((menu) => menu.id === "nypl-27260")?.cuisines, [
    "American",
    "Continental",
  ]);
  assert.match(
    archive.menus.find((menu) => menu.id === "nypl-27260")?.cuisineBasis ?? "",
    /Analytical/u,
  );
});
