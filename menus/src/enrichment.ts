import * as z from "zod/mini";
import { locationSchema } from "./model.ts";
const citation = z.readonly(
  z.strictObject({
    url: z.url({ protocol: /^https?$/u }),
    kind: z.enum(["catalog", "scan", "historical", "gazetteer", "dataset"]),
    label: z.string().check(z.minLength(1)),
  }),
);
const citations = z.readonly(z.array(citation));
export const enrichmentSchema = z.readonly(
  z.strictObject({
    reviewedAt: z.iso.date(),
    method: z.string(),
    points: z.readonly(
      z.array(
        z.readonly(
          z.strictObject({
            menuId: z.string(),
            location: locationSchema,
            metadataTitle: z.string(),
            citations,
          }),
        ),
      ),
    ),
    dateReadings: z.readonly(
      z.array(
        z.readonly(
          z.strictObject({
            menuId: z.string(),
            date: z.readonly(
              z.discriminatedUnion("precision", [
                z.strictObject({ precision: z.literal("day"), value: z.iso.date() }),
                z.strictObject({
                  precision: z.literal("range"),
                  start: z.iso.date(),
                  end: z.iso.date(),
                }),
              ]),
            ),
            basis: z.string(),
            pageId: z.string(),
            imageId: z.string(),
            imageSha256: z.string().check(z.regex(/^[a-f0-9]{64}$/u)),
            engine: z.string(),
            context: z.string(),
            citations,
          }),
        ),
      ),
    ),
    addresses: z.readonly(
      z.array(
        z.readonly(
          z.strictObject({
            menuId: z.string(),
            address: z.string(),
            assessment: z.string(),
            basis: z.string(),
            citations,
          }),
        ),
      ),
    ),
    dateConflicts: z.readonly(
      z.array(
        z.readonly(
          z.strictObject({
            menuId: z.string(),
            label: z.string(),
            reason: z.string(),
            metadataDates: z.readonly(z.array(z.string())),
            metadataTitle: z.string(),
            pageId: z.string(),
            imageId: z.string(),
            imageSha256: z.string().check(z.regex(/^[a-f0-9]{64}$/u)),
            withholdPreview: z.boolean(),
            citations,
          }),
        ),
      ),
    ),
  }),
);
