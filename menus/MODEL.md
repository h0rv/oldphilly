# Runtime data model

The source-record schema is [`src/model.ts`](src/model.ts). The normalized catalog schema is [`src/catalog-model.ts`](src/catalog-model.ts). Both use strict Zod objects, infer readonly TypeScript types and parse incoming JSON. Application pages read the generated catalog. The map combines catalog names, date labels and reviewed points with the original dishes and prices.

`public/menus.json` remains the complete source receipt: 102 records, original titles, provider/collection IDs and URLs, original catalog values, rights, source snapshots, 435 display pages and 3,469 dish occurrences. This layer is deliberately unchanged.

`public/catalog.json` has `schemaVersion: 2` and these collections:

| Entity   | Actual fields                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------- |
| Citation | `id, url, kind, label`                                                                              |
| Venue    | `id, name, kind, branch, review`                                                                    |
| Menu     | `id, venueId, sourceRecordId, name, date, location, pageIds, sourceCitationId, review, priceReview` |
| Page     | `id, menuId, sourcePageId, label, image, review`                                                    |
| Image    | `imageId, previewUrl, fullUrl, width, height, credit, recordUrl, evidence`                          |

Dates discriminate on `precision`: `unknown` has null value/year; `year`, `month` and `day` have appropriately shaped values and a matching year; `range` has ordered ISO start/end and its start year. Every date retains `label, basis, sourceValues, review`. Catalog timestamps are not automatically treated as printed dates.

Locations discriminate on `precision`: `unknown` has no geometry; `neighborhood` names an area without a point; `block` has a nonzero bounding box; `exact` has a point within its bounding box and a neighborhood. All retain `address, basis, review`; located forms require evidence citations and a verified location review. A building point is a representative locator, not a surveyed entrance. Bounds are `[west, south, east, north]` within the Philadelphia study area.

Review is a discriminated union:

```ts
{status: "not-reviewed", reason: null, citationIds: []}
{status: "verified" | "unresolved" | "source-unavailable", reason: string, citationIds: [id, ...]}
{status: "conflict", reason: string, citationIds: [id, differentId, ...]}
```

Reviews apply separately to venue identity, menu/date, location, page and price consistency. Verified identity does not establish coordinates or scan inspection. Page inspection remains `source-unavailable` where the scan could not be read, even if public-domain metadata establishes preview rights. `priceReview: verified` means numeric source consistency, not an audit against the printed scan.

The schemas reject duplicate identities, orphan references, unresolved citations, duplicate or cross-owned pages, invalid dates, reversed geometry, unevidenced points and out-of-area coordinates. Source validation requires every original menu and page, original title/source URL/date values and nonnegative prices. The 17 NYPL price pairs whose high price is below their primary price remain unchanged under an explicit conflict review.

`build-scans.ts` joins original page/image IDs to the pinned NYPL public-domain release. `build-catalog.ts` applies the documented source review annotations and validates joins. New unannotated source records enter as `not-reviewed`; annotation code is not required to retain them. Build regeneration uses only committed data.

A shared exact reviewed name is used to group navigation, without merging venue IDs. The dated list shows each menu’s own branch/address; the unresolved 1953/1957 Bookbinder’s records do not inherit the later CIA 125 Walnut address.

## Remaining gaps

- There are 60 candidate venue entities, not 60 proven distinct restaurant businesses. Cross-source deduplication and continuity are unresolved.
- No restaurant operating periods or move history are modeled. Source-specific branch uncertainty stays explicit.
- The current records use unknown or building-point geometry. Block/neighborhood variants are validated but have no reviewed examples yet, and the current map renders building points only.
- CIA compound-page enumeration and image rights have not been established. No CIA preview or full transcript is released.
- Real NYPL scan availability and visual quality require the separate remote-image CI job plus human screenshot review. Local fixture tests prove interactions only.
- Dishes/prices remain in the source layer rather than normalized as additional catalog entities. No inflation conversion is offered.
