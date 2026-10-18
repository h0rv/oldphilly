import * as z from "zod/mini";
import type { MenuArchive } from "./model.ts";

const text = z.string().check(z.minLength(1));
const url = z.url({ protocol: /^https$/u });
export const storySchema = z.readonly(
  z
    .array(
      z.readonly(
        z.strictObject({
          anchor: z.string().check(z.regex(/^[a-z][a-z-]+$/u)),
          menuId: text,
          heading: text,
          observation: text,
          itemIds: z.readonly(z.array(text).check(z.minLength(1), z.maxLength(3))),
          image: z.nullable(
            z.readonly(
              z.strictObject({
                pageId: text,
                imageId: text,
                url,
                recordUrl: url,
                width: z.int().check(z.positive()),
                height: z.int().check(z.positive()),
                alt: text,
                rights: text,
                rightsEvidence: url,
              }),
            ),
          ),
        }),
      ),
    )
    .check(z.minLength(1)),
);

export function resolveStory(archive: MenuArchive, value: unknown) {
  const stops = storySchema.parse(value);
  if (new Set(stops.map((stop) => stop.anchor)).size !== stops.length)
    throw new Error("Story anchors must be unique");
  let previousYear = 0;
  return Object.freeze(
    stops.map((stop) => {
      const menu = archive.menus.find((item) => item.id === stop.menuId);
      if (menu === undefined || menu.date.year === null)
        throw new Error(`Story stop must reference a real dated menu: ${stop.menuId}`);
      if (menu.date.year < previousYear) throw new Error("Story menus must be chronological");
      previousYear = menu.date.year;
      if (menu.scanNote !== null) throw new Error("A disputed scan cannot lead the story");
      if (stop.image !== null && !menu.pages.some((page) => page.id === stop.image?.pageId))
        throw new Error("Story image references a page outside its menu");
      const dishes = Object.freeze(
        stop.itemIds.map((id) => {
          const dish = menu.dishes.find((item) => item.id === id);
          if (dish === undefined) throw new Error(`Story item is absent from its menu: ${id}`);
          return dish;
        }),
      );
      return Object.freeze({ ...stop, menu, dishes });
    }),
  );
}
export type StoryEntry = ReturnType<typeof resolveStory>[number];
