> Historical PR #1 record. The reader follow-up is documented in [READER.md](READER.md); these earlier screenshots and UI findings are not acceptance evidence for it.

# Independent Luna review

The user-requested independent Luna agent reviewed source provenance, historical venue/address annotations, strict-check boundaries and desktop/mobile captures. The earlier follow-up covered the rights-safe 553b7738 source release; the OldPhilly monorepo integration follow-up is now complete. The reviewer made no edits and did not compete with active builds or browser servers.

**Final source/assets finding: no remaining implementation or rights issue in the reviewed release representation.** The reviewer confirmed that all six regenerated screenshots contain no old CIA transcript content: the map shows NYPL Warwick items/prices, the detail view shows Middle East catalog/rights metadata, and the home has the three NYPL story stops. Both current public/menus.json and rebuilt dist/menus.json have 102 records and zero nonempty CIA page/catalog transcript fields. The metadata derivative, import redaction and rejecting release-schema guards are present.

The earlier audit identified two real release blockers: stale map captures showing the old CIA transcript, and a stale dist that still contained those fields. Both were regenerated from the scrubbed data before final review. Private research originals remain under ignored raw/rights; older development history and older private review bundles must not be published. OldPhilly imports only that clean source tree as files; private development history remains outside the monorepo.

## Source and location evidence

Luna independently recomputed all four original NYPL CSV hashes, byte lengths, row counts and unique IDs: 519,007 bytes; 72 menus; 432 source pages; 3,469 occurrences; 2,534 dishes; zero orphan references; 1,488 primary prices; 189 high-price values. Original NYPL catalog fields, conservative date precision, corrected menu 33270, unnumbered scans and source-only retention of the zero-item Rosoff ad were checked. The complete combined selection remains 102 source records, 88 dated and 14 undated, without verified cross-library deduplication or balanced city coverage.

The review previously identified the real association conflict for NYPL menu 24827 / page 38725 / image 476920: the bulk catalog names Philadelphia's Continental Hotel, while the current image record names St. Nicholas Hotel with an uncertain New York location. The app retains and flags the source conflict and withholds that image from the story. The actual story image 4046889 matches menu 33548 / page 70276 and its official 1914 Bellevue record and item-specific U.S. public-domain statement.

The final four point groups contain **16 records: 11 at the Bellevue building, two at Old Original Bookbinder's, one Warwick and two Benjamin Franklin Hotel menus**. New menu-ID/address/venue/date/QID/DMS tests are present, as are licensed polygon containment checks. Palm's exact 200 South Broad address shares only the representative building point and its date remains unknown. Adelphia, the unresolved Horn & Hardart outlet and Bookbinders at 215 South 15th remain unpinned. Earlier Bellevue venues are not assigned the post-1904 hotel point. [Location review](LOCATIONS.md).

The current Q7716429 coordinates were independently rechecked during the earlier audit. Q7084674 could not be fetched then; its retained pinned coordinates were not independently reread, while its source address and Old City polygon match were checked. The two newly added QIDs and published DMS values are explicitly recorded and tested. All points represent buildings, not individual dining-room footprints.

## UI, checks and publication

The final map fit uses all reviewed points and viewport dimensions. Browser assertions check all four 36px targets inside bounds without pairwise overlap, while retaining independent Web Mercator spacing, zoom scaling and pan checks. Source names/dates appear once, keyboard selection focuses the actual heading, mobile remains readable, and ordinary home anchors work without JavaScript. BASE_URL and legacy menu hashes preserve project navigation.

The reviewed tooling includes stable native TypeScript 7, explicit Astro template checks using the supported TypeScript 6 API, strict type-aware Oxlint and Oxfmt including Astro. [Checking boundaries](ASTRO-CHECKS.md) records the scoped upstream declaration exception. The implementation agent ran the checks; its execution results are separate evidence from independent review and are recorded in [VALIDATION.md](VALIDATION.md).

The current name is **Old Philly Menus**, canonical **https://oldphilly.org/menus/** in the existing h0rv/oldphilly repository. The earlier standalone publication plan is superseded. Current integration/CI and hosting evidence is in [PUBLICATION.md](PUBLICATION.md); no merge, deployment or DNS change is authorized by this contribution.

CIA CNE provides no reuse license, so the release retains factual metadata/source links and omits full transcripts/images; no unresolved CIA-text republication decision blocks this representation. No scan/photo bytes are copied or rehosted. The source-hosted NYPL image has its matched item-specific rights evidence. Automated OSM requests remain blocked under provider policy. A human live-image/tile preview remains outstanding and is not established by outage tests.

## OldPhilly monorepo follow-up

Luna independently reviewed the shared composite action, PR/deploy workflows, TypeScript composition script, Astro config/layout, built assets/canonicals, photo fixture/browser tests, root navigation diff and all six current screenshots. **No substantive integration blocker was found.** Composition fixes the production origin/base and replaces only site/menus/. PR checks have no deploy step; the existing deployment retains its project, branch and secrets. The root HTML diff adds only the menu link, while photo runtime/styling/About and data-generator bytes remain unchanged.

The current public dataset contains all 102 records and all 30 CIA rows with zero nonempty CIA transcripts. No private parent export/raw files are tracked in menus/. The clean source tree was copied without research history. Story/map canonicals, emitted assets, menu JSON and navigation are scoped to /menus/. Current captures show the stated external-image/tile fallbacks and Old Philly Menus branding.

The reviewer distinguished two limits from blockers: local Python serving checks the 404 file/noindex and missing-path status, rather than Cloudflare's custom 404 response body; the documented nearest-404 placement is correct. Local Hugging Face input HTTP 403 leaves the full photo-data build for CI. A live external-media preview and production approval remain outstanding. No deployment or DNS changes were made.
