# Restaurant and scan reader follow-up

This branch follows the deployed PR #1. It is a new review, with no authorization to merge or deploy.

The default route browses restaurants/hotels, a date list leads to the exact source menu, and a dedicated reader centers the original scan. Page selection survives reload in `?page=`. Native dialog enlargement provides zoom, scrolling, page changes, Escape/Close and focus restoration. Search and the selected-menu anchor survive the return to the restaurant list. Same-name navigation groups retain separate branch/entity IDs and show each date’s own address.

The optional `/story/` route now contains only Bellevue-Stratford 1912, Kugler’s 1949 and Old Original Bookbinder’s 1957. Promotional language and unsupported historical interpretation have been removed. Dates/names and a pair of original dishes/prices accompany each artifact. Browse and map navigation remain available.

The map uses the normalized catalog: 33 records at eight representative building points, with unknown locations still available in the selector. It includes an inline source-hosted preview where cleared and links to the full reader. It retains original dishes/prices under a disclosure. All 15 CIA source addresses survive; 12 still lack supported geometry. Eight more NYPL records now retain historical street/corner text without invented geometry. See [enrichment evidence and limits](ENRICHMENT.md).

The runtime model and exact invariants are in [MODEL.md](../MODEL.md). Original source JSON/CSVs are unchanged. Seventeen reversed high/low source price pairs remain explicit conflicts. The public-domain metadata joins support 425 previews without copying image bytes; 27457 is now withheld for an image/identity conflict. Five machine-supported dates have unresolved visual review and visible warnings. CIA image rights and compound pages remain unresolved.

The separate CIA audit confirms 366 broad keyword objects, of which 30 explicitly name Philadelphia, 299 another city and 37 no city. Chain-wide branch mentions do not establish another Philadelphia-specific edition. Private research exports and full CIA transcripts remain outside the repository; only short public-domain NYPL date contexts are retained.

## Independent review

Luna reviewed the code and regenerated desktop/phone layout captures. Its date-order finding led to sorted year summaries and chronological dated lists. It accepted name-only browse grouping because entity IDs and per-menu locations remain separate. The phone layout has no horizontal overflow and uses finger-sized scan controls. An enlargement cue was added to the image. No additional flow blocker was found. This review does not establish visual quality or availability of the real scans.

For the data enrichment, a second bounded Luna review checked the committed evidence, generated catalog, image/page joins, unknown/disputed states and UI warnings. It found missing map warnings for machine dates and an incorrectly coupled venue/date review; both were corrected and rechecked, with no remaining blocker in that review. This was static evidence/code review, not scan visual inspection.

## Evidence limits

`review/before/` contains historical PR #1 outage captures. They are not current acceptance evidence. Local current reader tests use a conspicuous **TEST SCAN / Layout fixture only** image, and map/story tests explicitly abort image/tile requests. Current interaction captures belong in ignored `test-results/`, never in the public site.

Local direct NYPL image requests received HTTP 403 from the configured proxy. No alternate proxy or denied-route bypass was attempted. The separate PR-only `scan-preview` CI job succeeded with real preview/full-image decoding and desktop/mobile journey captures at run 39173781406. Screenshot visual inspection remains blocked by HTTP 403 on authorized artifact transfers. That job does not deploy.
