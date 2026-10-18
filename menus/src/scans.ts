import * as z from "zod/mini";

const url = z.url({ protocol: /^https$/u });
export const scanPageSchema = z.readonly(
  z.strictObject({
    menuId: z.string(),
    pageId: z.string(),
    imageId: z.string(),
    previewUrl: url,
    fullUrl: url,
    width: z.int().check(z.positive()),
    height: z.int().check(z.positive()),
    credit: z.string(),
    recordUrl: url,
    evidence: url,
  }),
);
export const scansSchema = z.readonly(
  z.strictObject({
    schemaVersion: z.literal(1),
    source: z.readonly(z.strictObject({ repo: url, commit: z.string(), description: z.string() })),
    pages: z.readonly(z.array(scanPageSchema)),
  }),
);
export type ScanPage = z.infer<typeof scanPageSchema>;
