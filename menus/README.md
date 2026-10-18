# Old Philly Menus

A static Astro/TypeScript app for finding a restaurant, choosing a dated menu and reading its scan. The restaurant list, map and three-menu selection are separate routes. The scan reader supports page changes and enlargement; source records without cleared previews keep their library links. Unknown dates and locations remain available.

**Old Philly Menus** lives in `menus/` inside [h0rv/oldphilly](https://github.com/h0rv/oldphilly). Its canonical destination is **https://oldphilly.org/menus/**. The existing photo site remains at `/`; its crawler, data generator, scripts and styling are unchanged. [Migration provenance](MIGRATION.md) identifies the rights-safe starting tree. [Publication status](review/PUBLICATION.md) records hosting and review boundaries.

## Run

Node 24.19+ and Python 3 for the combined preview; exact npm versions and lockfile are checked in. From this directory:

```sh
npm ci --ignore-scripts
ASTRO_TELEMETRY_DISABLED=1 npm run check
ASTRO_TELEMETRY_DISABLED=1 npm run dev
# http://127.0.0.1:4321/menus/ — restaurants
# http://127.0.0.1:4321/menus/story/ — three menus
# http://127.0.0.1:4321/menus/map/ — map
```

To build and preview the photo and menu routes on one origin:

```sh
ASTRO_TELEMETRY_DISABLED=1 npm run build:site
python3 -m http.server 8080 --bind 127.0.0.1 --directory ../site
# http://127.0.0.1:8080/menus/
```

`build:site` builds static `dist/`, then replaces only generated `../site/menus/`. Photo data remains owned by the existing Python generator. Generate it from an existing local crawl with `just build-site-data` at the repository root, or use the existing CI's public Parquet input. No database is needed by the menu app or deployed static site.

After `build:site`, run `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`; omit `CHROMIUM_PATH` for an installed Playwright browser. The browser suite owns a fresh Python static server for the composed `site/` directory. Photo regression checks use the repository's existing source fixture and actual pinned CDN-package bytes, without changing production HTML. They do not substitute map-library stubs or invented photographs.

## Complete supplied data

The [CIA coverage audit](snapshots/cia-coverage-audit.json) distinguishes 366 broad keyword objects from the 30 explicitly cataloged in Philadelphia. Another 299 name another city and 37 omit a city. Chain menus mentioning Philadelphia branches do not establish a Philadelphia-specific edition. The 30 retained records have 15 street-address fields and 16 dates (12 full dates, four years).

| Provider | Source records | Dated | Undated | Display pages | Structured item occurrences |
| -------- | -------------: | ----: | ------: | ------------: | --------------------------: |
| NYPL     |             72 |    72 |       0 |           431 |                       3,469 |
| CIA      |             30 |    16 |      14 |             4 |                           0 |
| Combined |            102 |    88 |      14 |           435 |                       3,469 |

NYPL has **432 original source pages**. The unrelated Rosoff New York advertisement, page **58186** on menu **29916**, has no items and is excluded only from display. It remains in the exact source CSV and is identified in the menu's notes. **1,488** occurrences have a primary price; **189** have a high-price value. Missing prices and currency remain missing; zero and ranges stay distinct. No inflation conversion is supplied without a verified CPI series.

All four selected NYPL CSVs are retained unchanged in [snapshots/nypl-selected](snapshots/nypl-selected/). Receiver reconstruction verified all **36 JSON parts**, serialized part hashes, CSV segment hashes, original source hashes, **519,007 bytes** and **6,507 rows**. Every source ID is unique and every menu/page/dish join resolves. Tests compare all 3,469 exported items with their source names, IDs and low/high prices, and every Menu.csv catalog field. [Receipt](snapshots/nypl-receipt.json), [original source facts](snapshots/nypl-inputs.json), [transfer manifest](snapshots/nypl-transfer-manifest.json), [Library index](snapshots/nypl-transfer-index.json). This is the complete supplied selection, not the full NYPL corpus.

CIA's [released factual metadata](snapshots/cia-metadata.json) contains all 30 records and every original field except four full Transcript values, which are omitted because the source rights statement establishes no reuse license. The exact 70,874-byte original remains private in the earlier research checkout; it is not part of this monorepo. The release derivative is 56,824 bytes with SHA-256 38932b1b208c375a14f32f0dbf43b6ee2cd26173e3a91c8957d00b34441b9315. Four single-page source IDs/links remain; 26 compound parents have no child-page payload in this input. [Rights audit](review/RIGHTS.md), [machine-readable audit](snapshots/cia-rights-audit.json). Run node scripts/build-dataset.ts to reproduce the combined output offline with source hashes checked first.

Inherited printed-date audits determine exact precision where supplied. Other NYPL timestamps display a year unless machine-supported date evidence is retained with explicit unresolved visual review. Menu 33270 displays inherited **January 2, 1915**, flags the original **1915-01-01** conflict and preserves both. Menu 27457 now has a disputed date and withheld preview. Scans 49164 and 60473 have unrecorded page numbers; no number is assigned. Snapshot timestamps distinguish Library artifact creation from unknown original provider retrieval. [New evidence, machine-date candidates and limits](review/ENRICHMENT.md).

**Source conflict:** menu 24827's bulk catalog names Philadelphia's Continental Hotel, but the current NYPL record for page 38725 / image 476920 names St. Nicholas Hotel with an uncertain New York location. A visible warning flags the discrepancy. Original rows and links remain; that image is withheld from the story.

These selected collections provide uneven city coverage. Source records have not been deduplicated across libraries.

## Story and map

[Story curation](snapshots/story.json) references exact menu/page/item IDs. Validation rejects missing, undated, out-of-order or disputed source material. The three stops describe recorded dishes and nominal prices; they make no citywide cultural or economic inference. Ordinary HTML anchors work without JavaScript. Earlier home-page menu hashes redirect to their exact map record.

Thirty-three records have reviewed locations at eight representative building points. The new evidence adds eight Bellevue-Stratford records, two Bourse records and one Masonic Temple record to the prior 22 locations. Eight more NYPL records retain historic textual addresses/corners without invented geometry. Each match retains source-specific identity and coordinate evidence. Earlier Bellevue venues, sponsoring clubs and unresolved outlets receive no guessed pins. Old Original Bookbinder’s at 125 Walnut remains separate from Bookbinders at 215 South 15th. [Runtime model and gaps](MODEL.md), [catalog](public/catalog.json), [new evidence](snapshots/venue-evidence.json).

Leaflet uses EPSG:3857 and [OpenStreetMap Standard tiles](https://operations.osmfoundation.org/policies/tiles/) with visible contributor attribution. This is a no-key, best-effort service for modest interactive use. The browser handles normal caching/referrers; no proxy, bulk download, prefetch or tile archive is implemented. Automated browser tests abort all tile requests to respect the provider's prohibition on headless rendering traffic. Pins, filters and menu reading remain usable during a tile outage.

Licensed Abaca Labs / OpenDataPhilly reference polygons remain in snapshots for point-in-polygon checks. They are not loaded or drawn in the browser. [Geometry provenance](snapshots/basemap-provenance.json), [CC BY 4.0 license](snapshots/basemap-license.txt). Reference neighborhoods are not historical venue boundaries.

## Images and release limits

The [pinned NYPL public-domain metadata release](snapshots/nypl-public-domain.json) matches 429 of the 432 original page image IDs. Excluding the advertisement, two disputed Continental/St. Nicholas pages and the 27457 source-image conflict gives **425 source-hosted previews**. The three selected artifacts are Bellevue-Stratford (1912), Kugler’s (1949) and Old Original Bookbinder’s (1957). Each preview retains its full-image URL, dimensions, NYPL credit, item record and exact public-domain evidence line. No image bytes are copied into this repository or hosted by this app.

Local image requests received HTTP 403 from the configured proxy. Local browser tests explicitly abort those requests or use a visible **TEST SCAN** interaction fixture. Neither proves real artifact rendering. The separate `scan-preview` CI job successfully decoded actual previews/full images and captured desktop/mobile journey screenshots at run 39173781406. Authorized artifact transfers returned HTTP 403; actual screenshot visual review remains pending, with no denied transfer retries.

[MODEL.md](MODEL.md) describes the actual runtime schemas, their invariants and remaining gaps. `menus.json` is the immutable source-record layer; `catalog.json` separates reviewed venues, source-linked menus, pages and evidence. The map uses the catalog’s 33 located records at eight representative building points. All 15 CIA street-address fields remain available, including the 12 records still lacking supported geometry. No neighborhood centroid pins are used.

CIA source rights remain **Copyright Not Evaluated**. Release output therefore omits full CIA transcripts and images, retaining factual metadata and source links. Import and release-schema checks prevent text leaking through page or raw catalog fields. The private originals are retained for research, outside this monorepo and its history. Other inspiration images and OldPhilly photos are not embedded without adequate rights.

Executor limitations remain explicit: NYPL/CIA bulk download routes and the OSM tile route returned proxy CONNECT 403. The official NYPL image-download endpoint also returned HTTP 403; the supported Library image download helper failed before transfer with a network error. No denied endpoint is bypassed. Browser evidence shows honest image/tile failure states, rather than substituted geography or fabricated menu artwork. Successful live image/tile rendering still needs a human preview with network access.

## Hosting and checks

`astro.config.ts` defaults to `ASTRO_SITE=https://oldphilly.org` and `ASTRO_BASE_PATH=/menus/`. Canonicals, assets, data, navigation and deep links use that path. `build:site` deliberately fixes the production destination when composing `site/`. A nested `menus/404.html` supplies menu-specific failure copy without replacing the root site's fallback behavior.

The root [shared build action](../.github/actions/build-site/action.yml) runs the existing Python checks, frozen dependency installs, strict menu checks, the existing full photo-data build, menu composition and desktop/mobile browser checks. [PR CI](../.github/workflows/check.yml) does not deploy. The existing [Cloudflare deployment](../.github/workflows/deploy.yml) uses that same action before publishing `site/` with its existing project, branch and secrets. No new hosting service or account resource is introduced. Do not merge or deploy this PR before preview review. [Validation](review/VALIDATION.md) separates local fixture checks from the full photo-data CI build.

Astro **7.4.0** emits static output without an adapter, React, backend or database. [Checking boundaries](review/ASTRO-CHECKS.md) documents native stable **TypeScript 7.0.2** plus the official Astro checker's supported **TypeScript 6.0.3** API. The official [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and npm metadata establish stable Go-based compiler status.

Pinned Oxfmt **0.73.0**, Oxlint **1.88.0** and oxlint-tsgolint **7.0.2004** enforce formatting and strict type-aware lint/checks. Astro templates and configuration receive explicit checks, and Oxfmt's Astro support is enabled. Native application checks retain skipLibCheck: false. No unsafe casts, any or blanket suppressions are used. Zod-first schemas infer readonly types and parse source boundaries, applying the requested [modern Python skill](https://github.com/h0rv/agent-skills/blob/abb546e49c2068b55d4b0b925066dd73a0ab88ac/modern-python/SKILL.md) in TypeScript.

Leaflet 1.9.4 is the small stable map library; Simple.css 2.3.7 supplies the classless base under an original cream, mustard, tomato and teal theme. System typography avoids font downloads. The home pre-renders its content; browser TypeScript handles only image failure/old links, while the map loads its own interaction script.
