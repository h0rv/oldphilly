import * as z from "zod/mini";
const point = z.tuple([z.number(), z.number()]);
export const basemapSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: z.object({ name: z.string() }),
      geometry: z.object({
        type: z.literal("MultiPolygon"),
        coordinates: z.array(z.array(z.array(point))),
      }),
    }),
  ),
});
export type Neighborhood = z.infer<typeof basemapSchema>["features"][number];
