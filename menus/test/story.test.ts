import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { parseArchive } from "../src/model.ts";
import { resolveStory, storySchema } from "../src/story.ts";

const archive = parseArchive(
  JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
);
const source = storySchema.parse(
  JSON.parse(await readFile(new URL("../snapshots/story.json", import.meta.url), "utf8")),
);

await test("chronological stops resolve real records and occurrence IDs from the complete export", async () => {
  const stops = resolveStory(archive, source);
  assert.equal(stops.length, 3);
  assert.deepEqual(
    stops.map((stop) => stop.menu.date.year),
    [1912, 1949, 1957],
  );
  assert.deepEqual(
    stops.flatMap((stop) => stop.dishes.map((dish) => dish.price)),
    [0.9, 1.25, 1.5, 0.35, 8.25, 0.65],
  );
  const csv: unknown = parse(
    await readFile(new URL("../snapshots/nypl-selected/MenuPage.csv", import.meta.url)),
    { columns: true },
  );
  const pages = z
    .array(z.object({ id: z.string(), image_id: z.string(), uuid: z.string() }))
    .parse(csv);
  for (const stop of stops) {
    if (stop.image === null) continue;
    const page = pages.find((item) => item.id === stop.image?.pageId);
    assert.ok(page);
    assert.equal(page.image_id, stop.image.imageId);
    assert.equal(new URL(stop.image.url).searchParams.get("id"), page.image_id);
    assert.match(stop.image.rightsEvidence, /NYPL-publicdomain/u);
  }
});

await test("the story rejects undated, absent, misjoined and disputed source material", () => {
  const first = source[0];
  assert.ok(first);
  assert.throws(() => resolveStory(archive, [{ ...first, menuId: "cia-17865" }]), /dated menu/u);
  assert.throws(() => resolveStory(archive, [{ ...first, itemIds: ["absent"] }]), /absent/u);
  assert.throws(
    () => resolveStory(archive, [{ ...first, image: { ...first.image, pageId: "58186" } }]),
    /outside/u,
  );
  assert.throws(() => resolveStory(archive, source.toReversed()), /chronological/u);
  assert.throws(() => resolveStory(archive, [{ ...first, menuId: "nypl-24827" }]), /disputed/u);
});
