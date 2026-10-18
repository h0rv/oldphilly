# Historical location and date evidence

This follow-up reviewed the 30 released CIA parent records and the 72 selected NYPL identities in bounded independent passes. It does not establish complete Philadelphia coverage, cross-source deduplication or restaurant continuity. Original `menus.json` and the four NYPL CSVs are unchanged. Regeneration reads the committed, schema-validated [evidence](../snapshots/venue-evidence.json).

## Location gains

Eleven additional source-specific matches bring the catalog from 22 to **33 located records at eight representative building points**: eight Bellevue-Stratford records (14406, 21050, 21582, 22759, 22780, 23128, 23277, 26300), two Philadelphia Bourse records (21701, 22519), and Masonic Temple record 25999. Capture-matched NYPL titles name the event venue; historical building sources and pinned gazetteer revisions support the point. A point locates the building, not a dining room or surveyed entrance.

Eight additional NYPL records retain corroborated historical addresses/corners as text: Majestic 21962/24054, Horticultural Hall 22295/22779, Stenton 23209, Metropole 23436 and Walton 24606/25775. All 15 CIA structured addresses were reviewed; six have additional historical corroboration. Street text alone does not establish geometry. **69 records remain unlocated; no block boxes or neighborhood centroids were invented.**

Union League geometry remains unresolved because the accessible gazetteer coordinates disagree substantially. Sponsor-only Union League and Masonic records do not inherit a venue's street address. Widener/Kugler, Hotel Sylvania, branchless Horn & Hardart and early Bookbinder records retain their separate source-specific limits.

## Machine-supported date candidates

The optional research workflow uses the existing runner and its distribution Tesseract engine on already-cleared, source-hosted NYPL images. Each retained reading records source page/image IDs, image SHA-256, engine, short date context and run citation. Image bytes are deleted; there is no OCR service or added application dependency. Independent Luna comparison checks unchanged CSVs, capture-matched metadata, sponsor and calendar weekday. **No new reading has been visually verified.** These five normalized dates explicitly retain `review.status: unresolved` and a visible warning:

| NYPL record | Normalized date | Evidence limit |
| --- | --- | --- |
| 21050 | 1907-01-16 | OCR day/weekday, CSV and catalog year agree |
| 21582 | 1907-01-17 | OCR day/weekday, CSV and catalog year agree |
| 22759 | 1906-01-17 | OCR day/weekday, CSV and catalog year agree |
| 23128 | 1906-01-20 | OCR Saturday, CSV and catalog year agree |
| 26300 | 1906-10-08–1906-10-09 | OCR month/days plus CSV luncheon/banquet notes; year from catalog, not ambiguous OCR Roman numeral |

The source's single October 8 date remains in `sourceValues`. Other sampled cover/back pages yielded no defensible event date; library accession ranges are not event dates. One independent request returned 404 (image 473846); it was recorded, not retried. Research provenance: [first run](https://github.com/h0rv/oldphilly/actions/runs/39174635257) (stopped at that missing page) and [second run](https://github.com/h0rv/oldphilly/actions/runs/39174949361) (different records, completed).

CIA descriptions mention March 1977 for Garden 20281 and October 1972 for Stratford Garden 16789. These remain description-level review candidates, with catalog precision unchanged. Numeric cover notes on 19539 and 12064 remain ambiguous. The 14 undated CIA records stay undated. Four full transcripts are omitted from the rights-safe release; the original parent export is not present in this workspace, so those texts could not be checked. The official singleitem JSON route was previously reported inaccessible by the web tool (no HTTP status exposed); it was not retried for the omitted records. No private transcript or full CIA OCR text is published.

## Conflicts and acceptance limits

NYPL 27457's CSV date is 1930-11-03; its capture-matched catalog says 1910 and 1910-12-16. Machine OCR reads a Pennsylvania Railroad heading, conflicting with the Kindergarten Club sponsor/catalog title. Its date is **disputed**, both source dates survive, and its preview is withheld from the reader, map, catalog and scan export. It is excluded from the 1930 decade filter and retained with unknown/disputed dates. This leaves **425 cleared preview associations**. The prior 24827 identity conflict and Rosoff advertisement exclusion remain intact.

The normalized date inventory is 33 day, 53 year, one range and 15 unknown/disputed. Review status separates 81 inherited/catalog checks, five machine-supported readings awaiting visual review, 14 undated records, and two date conflicts. The immutable source receipt still has 88 dated and 14 undated records; normalized uncertainty does not rewrite it.

Actual source-image CI decoding and desktop/mobile journey capture succeeded before this enrichment at [run 39173781406](https://github.com/h0rv/oldphilly/actions/runs/39173781406). The saved artifacts remain in that run. Authorized artifact transfers returned HTTP 403, including the small mobile-only archive; no transfer was retried or bypassed. Local fixture screenshots prove layout and interaction only. Actual scan identity, print readability and screenshot visual approval remain open. No merge or deployment is authorized.
