import * as z from "zod/mini";
import type { MenuArchive } from "./model.ts";

const text = z.string().check(z.minLength(1));
const ids = z.readonly(z.array(text));
const url = z.url({ protocol: /^https?$/u });
const evidenceIds = z.readonly(z.array(text).check(z.minLength(1)));
export const reviewSchema = z.readonly(
  z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("not-reviewed"),
      reason: z.null(),
      citationIds: z.readonly(z.array(text).check(z.maxLength(0))),
    }),
    z.strictObject({ status: z.literal("verified"), reason: text, citationIds: evidenceIds }),
    z.strictObject({ status: z.literal("unresolved"), reason: text, citationIds: evidenceIds }),
    z.strictObject({
      status: z.literal("source-unavailable"),
      reason: text,
      citationIds: evidenceIds,
    }),
    z.strictObject({
      status: z.literal("conflict"),
      reason: text,
      citationIds: z.readonly(
        z.array(text).check(
          z.minLength(2),
          z.refine(
            (values) => new Set(values).size === values.length,
            "Conflict citations must be distinct",
          ),
        ),
      ),
    }),
  ]),
);
export type ReviewState = z.infer<typeof reviewSchema>;
export const citationSchema = z.readonly(
  z.strictObject({
    id: text,
    url,
    kind: z.enum(["catalog", "scan", "historical", "gazetteer", "dataset"]),
    label: text,
  }),
);
const dateCommon = {
  label: text,
  basis: text,
  review: reviewSchema,
  sourceValues: z.readonly(z.array(z.readonly(z.strictObject({ name: text, value: z.string() })))),
};
const year = z.int().check(z.minimum(1600), z.maximum(2100));
export const catalogDateSchema = z.readonly(
  z
    .discriminatedUnion("precision", [
      z.strictObject({
        ...dateCommon,
        precision: z.literal("unknown"),
        value: z.null(),
        year: z.null(),
      }),
      z.strictObject({
        ...dateCommon,
        precision: z.literal("year"),
        value: z.string().check(z.regex(/^\d{4}$/u)),
        year,
      }),
      z.strictObject({
        ...dateCommon,
        precision: z.literal("month"),
        value: z.string().check(z.regex(/^\d{4}-(0[1-9]|1[0-2])$/u)),
        year,
      }),
      z.strictObject({ ...dateCommon, precision: z.literal("day"), value: z.iso.date(), year }),
      z.strictObject({
        ...dateCommon,
        precision: z.literal("range"),
        start: z.iso.date(),
        end: z.iso.date(),
        year,
      }),
    ])
    .check(
      z.refine(
        (d) =>
          d.precision === "range"
            ? d.start <= d.end && Number(d.start.slice(0, 4)) === d.year
            : d.value === null || Number(d.value.slice(0, 4)) === d.year,
        "Dates must be ordered and agree with their year",
      ),
    ),
);

// Bounding boxes are [west, south, east, north]. An exact point has a degenerate
// point envelope; a block must have evidenced, nonzero extent.
const bbox = z
  .readonly(
    z.tuple([
      z.number().check(z.minimum(-75.3), z.maximum(-74.95)),
      z.number().check(z.minimum(39.86), z.maximum(40.14)),
      z.number().check(z.minimum(-75.3), z.maximum(-74.95)),
      z.number().check(z.minimum(39.86), z.maximum(40.14)),
    ]),
  )
  .check(z.refine((b) => b[0] <= b[2] && b[1] <= b[3], "Reversed bounding box"));
const locationCommon = { address: z.nullable(text), basis: text, review: reviewSchema };
export const catalogLocationSchema = z.readonly(
  z
    .discriminatedUnion("precision", [
      z.strictObject({ ...locationCommon, precision: z.literal("unknown") }),
      z.strictObject({
        ...locationCommon,
        precision: z.literal("neighborhood"),
        area: text,
        evidenceCitationIds: ids,
      }),
      z.strictObject({
        ...locationCommon,
        precision: z.literal("block"),
        bbox,
        evidenceCitationIds: ids,
      }),
      z.strictObject({
        ...locationCommon,
        precision: z.literal("exact"),
        lat: z.number().check(z.minimum(39.86), z.maximum(40.14)),
        lng: z.number().check(z.minimum(-75.3), z.maximum(-74.95)),
        area: text,
        bbox,
        evidenceCitationIds: ids,
      }),
    ])
    .check(
      z.refine((l) => {
        if (l.precision === "unknown") return true;
        if (l.evidenceCitationIds.length === 0 || l.review.status !== "verified") return false;
        if (l.precision === "block") return l.bbox[0] < l.bbox[2] && l.bbox[1] < l.bbox[3];
        return (
          l.precision !== "exact" ||
          (l.lng >= l.bbox[0] && l.lng <= l.bbox[2] && l.lat >= l.bbox[1] && l.lat <= l.bbox[3])
        );
      }, "Located geometry requires verified evidence and valid extent"),
    ),
);
export const venueSchema = z.readonly(
  z.strictObject({
    id: z.string().check(z.regex(/^venue-[a-z0-9-]+$/u)),
    name: text,
    kind: z.enum(["restaurant", "hotel", "club", "event", "unknown"]),
    branch: z.nullable(text),
    review: reviewSchema,
  }),
);
export const catalogImageSchema = z.readonly(
  z.strictObject({
    imageId: text,
    previewUrl: url,
    fullUrl: url,
    width: z.int().check(z.positive()),
    height: z.int().check(z.positive()),
    credit: text,
    recordUrl: url,
    evidence: url,
  }),
);
export const catalogPageSchema = z.readonly(
  z.strictObject({
    id: text,
    menuId: text,
    sourcePageId: text,
    label: text,
    image: z.nullable(catalogImageSchema),
    review: reviewSchema,
  }),
);
export const catalogMenuSchema = z.readonly(
  z.strictObject({
    id: text,
    venueId: text,
    sourceRecordId: text,
    name: text,
    date: catalogDateSchema,
    location: catalogLocationSchema,
    pageIds: ids,
    sourceCitationId: text,
    review: reviewSchema,
    priceReview: reviewSchema,
  }),
);
function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
export const catalogSchema = z.readonly(
  z
    .strictObject({
      schemaVersion: z.literal(2),
      citations: z.readonly(z.array(citationSchema)),
      venues: z.readonly(z.array(venueSchema)),
      menus: z.readonly(z.array(catalogMenuSchema)),
      pages: z.readonly(z.array(catalogPageSchema)),
    })
    .check(
      z.refine((c) => {
        if (
          ![c.citations, c.venues, c.menus, c.pages].every((items) =>
            unique(items.map((i) => i.id)),
          ) ||
          !unique(c.menus.map((m) => m.sourceRecordId))
        )
          return false;
        const citations = new Set(c.citations.map((i) => i.id));
        const venues = new Set(c.venues.map((v) => v.id));
        const pages = new Map(c.pages.map((p) => [p.id, p]));
        const menus = new Set(c.menus.map((m) => m.id));
        const reviews = [
          ...c.venues.map((v) => v.review),
          ...c.pages.map((p) => p.review),
          ...c.menus.flatMap((m) => [m.review, m.date.review, m.location.review, m.priceReview]),
        ];
        if (
          !reviews.every(
            (r) => unique(r.citationIds) && r.citationIds.every((id) => citations.has(id)),
          )
        )
          return false;
        if (
          !c.menus.every(
            (m) =>
              venues.has(m.venueId) &&
              citations.has(m.sourceCitationId) &&
              unique(m.pageIds) &&
              m.pageIds.every((id) => pages.get(id)?.menuId === m.id) &&
              (m.location.precision === "unknown" ||
                m.location.evidenceCitationIds.every((id) => citations.has(id))),
          )
        )
          return false;
        return c.pages.every(
          (p) =>
            menus.has(p.menuId) && c.menus.filter((m) => m.pageIds.includes(p.id)).length === 1,
        );
      }, "Catalog has duplicate identities, missing citations, or invalid page/venue ownership"),
    ),
);
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogVenue = z.infer<typeof venueSchema>;
export type CatalogMenu = z.infer<typeof catalogMenuSchema>;
export type CatalogPage = z.infer<typeof catalogPageSchema>;
export type CatalogLocation = z.infer<typeof catalogLocationSchema>;
export type CatalogDate = z.infer<typeof catalogDateSchema>;
export type CatalogImage = z.infer<typeof catalogImageSchema>;
export type Citation = z.infer<typeof citationSchema>;
export function parseCatalog(value: unknown): Catalog {
  return catalogSchema.parse(value);
}

export function validateCatalogSources(catalog: Catalog, archive: MenuArchive): Catalog {
  const source = new Map(archive.menus.map((m) => [m.id, m]));
  const citations = new Map(catalog.citations.map((c) => [c.id, c]));
  if (catalog.menus.length !== source.size)
    throw new Error("Catalog must retain every source record");
  for (const menu of catalog.menus) {
    const record = source.get(menu.sourceRecordId);
    if (record === undefined || menu.id !== record.id)
      throw new Error(`Missing source record: ${menu.id}`);
    if (menu.name !== record.name || citations.get(menu.sourceCitationId)?.url !== record.url)
      throw new Error(`Changed source identity: ${menu.id}`);
    if (
      !menu.date.sourceValues.some(
        (v) => v.name === "catalog date" && v.value === record.date.catalogValue,
      ) ||
      !menu.date.sourceValues.some(
        (v) => v.name === "source archive date" && v.value === (record.date.value ?? ""),
      )
    )
      throw new Error(`Missing original date values: ${menu.id}`);
    const pages = catalog.pages.filter((p) => p.menuId === menu.id);
    if (
      pages.length !== record.pages.length ||
      !pages.every(
        (p) =>
          record.pages.some((original) => original.id === p.sourcePageId) &&
          p.id === `${record.provider.toLowerCase()}-${p.sourcePageId}`,
      )
    )
      throw new Error(`Source page mismatch: ${menu.id}`);
    if (
      record.dishes.some(
        (d) => (d.price !== null && d.price < 0) || (d.priceHigh !== null && d.priceHigh < 0),
      )
    )
      throw new Error(`Negative source price: ${menu.id}`);
    const reversedPrices = record.dishes.some(
      (d) => d.price !== null && d.priceHigh !== null && d.priceHigh < d.price,
    );
    if (reversedPrices && menu.priceReview.status !== "conflict")
      throw new Error(`Unreviewed source price order: ${menu.id}`);
  }
  return catalog;
}
