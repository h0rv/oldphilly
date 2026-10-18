import { readFile } from "node:fs/promises";
import { z } from "zod";

// Existing repository fixture, used only by browser request interception.
const source = z
  .object({
    assets: z
      .array(
        z.object({
          assetId: z.int().positive(),
          title: z.string(),
          date: z.string(),
          address: z.string(),
          lat: z.number(),
          lon: z.number(),
          medialist: z.array(z.object({ mediaId: z.int().positive() })).min(1),
        }),
      )
      .min(1),
  })
  .parse(
    JSON.parse(
      await readFile(
        new URL("../../tests/fixtures/detail_api_sample.json", import.meta.url),
        "utf8",
      ),
    ),
  );
const asset = source.assets[0];
const media = asset?.medialist[0];
if (asset === undefined || media === undefined) throw new Error("Photo fixture is incomplete");
const year = z.coerce
  .number()
  .int()
  .positive()
  .parse(asset.date.match(/\d{4}$/u)?.[0]);
const id = String(asset.assetId);
const imageUrl = `https://www.phillyhistory.org/PhotoArchive/MediaStream.ashx?mediaId=${String(media.mediaId)}`;
export const photoFixture = Object.freeze({
  markers: [[asset.lat, asset.lon, [id], [year]]],
  chunk: Math.floor(asset.assetId / 500),
  record: {
    id,
    title: asset.title,
    date: asset.date,
    address: asset.address,
    thumb: imageUrl,
    preview: imageUrl,
    url: `https://www.phillyhistory.org/PhotoArchive/detail.aspx?ImageId=${id}`,
  },
});
