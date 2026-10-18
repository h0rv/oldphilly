> Historical PR #1 record. The reader follow-up is documented in [READER.md](READER.md); these earlier screenshots and UI findings are not acceptance evidence for it.

# Receiver and source status

The complete supplied selection is imported: **72 NYPL + 30 CIA = 102 source records**, **88 dated / 14 undated**, **435 display pages**, **3,469 item occurrences**, **1,488 priced rows** and **189 high-price rows**. Source records are not cross-library deduplicated. No complete or balanced city-coverage claim is made.

## NYPL receiver verification

Library index libfile_80083c4a24588191918dcce1297f5260 identified manifest libfile_d1d05fd5ccb8819182bd186203b098cd and 36 JSON parts: Menu 2, MenuPage 3, MenuItem 18, Dish 13. Every supported text read completed with has_more=false. Part reads contained 11 lines each; the manifest contained 514 lines, all below the 1000-line cap.

The reader restored only a final JSON newline when needed to match the exact declared byte length and SHA-256. Every serialized-part hash, unchanged CSV segment hash, complete CSV hash/byte count, row count and header schema passed receiving-side reconstruction. **519,007 original CSV bytes and 6,507 rows** were preserved.

| Table | Original bytes | Parsed rows | Unique IDs |
| --- | ---: | ---: | ---: |
| Menu | 32,235 | 72 | 72 |
| MenuPage | 31,133 | 432 | 432 |
| MenuItem | 309,062 | 3,469 | 3,469 |
| Dish | 146,577 | 2,534 | 2,534 |

Independent parsing and the Luna audit found **zero orphan menu/page/dish references**. Row-by-row tests compare every exported occurrence, source name, low/high price and Menu.csv catalog field. The [receiver receipt](../snapshots/nypl-receipt.json), [original facts](../snapshots/nypl-inputs.json), [transfer manifest](../snapshots/nypl-transfer-manifest.json) and [index](../snapshots/nypl-transfer-index.json) preserve exact hashes and Library identities. Four source CSVs are retained unchanged in snapshots/nypl-selected.

Unknown page numbers on IDs **49164** and **60473** remain unknown. Rosoff advertisement page **58186** on menu **29916** is retained in source bytes and excluded only from display, after confirming it has zero transcribed items; all 431 other pages and all 3,469 occurrences remain. Page links display in recorded numeric order, with unnumbered scans retained.

Parent enrichment preserves original dates and distinguishes print-audited dates, analytical cuisine labels and source-quality notes. Menu 33270 retains catalog 1915-01-01 and displays printed 1915-01-02. Faint scan 33662 remains catalog-year only. Snapshot metadata identifies the hash as the transfer manifest's SHA-256, not the full bulk archive's, and labels Library artifact creation time separately from unknown provider retrieval.

## CIA

The exact 70,874-byte, 1,622-line parent export remains private under ignored raw/rights in the earlier private research checkout (outside this monorepo) and matches SHA-256 3abe44636acac88ecccd8d04f6570c952e53829eafd496c9c008c8508322aafb. All 30 source rights statements are Copyright Not Evaluated. The released 56,824-byte factual metadata derivative clears only the four nonempty Transcript values (records 2535, 2537, 2548 and 18438); every other key/value remains exact. Its SHA-256 is 38932b1b208c375a14f32f0dbf43b6ee2cd26173e3a91c8957d00b34441b9315. All 30 records and four single-page IDs/links remain; no full CIA transcript enters public output. The 26 compound parents have no child payload here. [Rights decision](RIGHTS.md), [audit](../snapshots/cia-rights-audit.json).

## Audited uncertainty and rights

NYPL menu 24827's bulk catalog names Philadelphia's Continental Hotel, but page 38725 / image 476920 resolves to an [official item record](https://old-digitalcollections.nypl.org/items/510d47db-1a2d-a3d9-e040-e00a18064a99) naming St. Nicholas Hotel with an uncertain New York location. The UI flags this source conflict and retains original rows and links; the disputed image is not a story asset.

The 1914 Bellevue image 4046889 matches menu 33548 / page 70276 and has an [NYPL public-domain statement for U.S. law](https://old-digitalcollections.nypl.org/items/c2e99748-bc89-4d90-e040-e00a18061570). It is referenced directly from its source, with credit and a rights link. No scan/photo is copied or publicly rehosted. Other images are not assumed cleared.

Seven CIA and nine NYPL records use four representative building points. [Location review](LOCATIONS.md) documents the four newly located records, source-specific historical addresses, NPS corroboration and pinned CC0 gazetteer coordinates. All 33 records with supplied address fields are inventoried separately; unverified candidates remain unlocated. Location whitelists, exact-coordinate tests and licensed polygon checks preserve the venue distinction. Sponsors, unresolved chain outlets and earlier Bellevue venues receive no invented pin.

## Access limitations

The initial bulk archive/API and tile routes returned curl CONNECT tunnel failure / HTTP 403 in this executor. The full selection subsequently arrived through complete authorized Library text reads; truncated CSV previews were never treated as full inputs.

The official image download endpoint https://iiif-prod.nypl.org/index.php?id=4046889&t=q returned HTTP 403. A current supported Library image download helper failed at hosted-app tool discovery with a network error before transferring bytes. These failures do not establish upstream library authentication requirements. No denied endpoint or transfer is bypassed.

Browser tests block source-image and OSM tile requests, display honest failure states, and preserve working source links, pins, filters and menu text. A human live-image/tile preview with network access remains outstanding. No public deployment or account change has occurred.
