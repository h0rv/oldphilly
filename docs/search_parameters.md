# Public Search Parameter Reference

This crawler seeds the documented public `Search.aspx` page and reads the public result payload
loaded by that page. The following controls were observed in the public advanced-search UI on
May 27, 2026. They are recorded as reference values; vocabularies may change on the upstream
site.

Official reference: [PhillyHistory Link Standards](https://www.phillyhistory.org/PhotoArchive/StaticContent.aspx?page=Link+Standards).

## Parameters

| UI control | URL/query representation |
| --- | --- |
| Address, intersection, or place name | `type=address&address=...` |
| Keyword | `keywords=...` |
| Area viewport | `type=area&minx=...&miny=...&maxx=...&maxy=...` |
| Collections | `collections=...` |
| From Year / To Year | `fromDate=YYYY&toDate=YYYY` |
| Include records without digitized media | `withoutMedia=true` |
| Include records without a location | `withoutLocation=true` (documented public link parameter) |
| Page control | `start=<offset>&limit=12|16|20|24` |

The UI's internal result request also exposes `withoutLoc` and `onlyWithoutLoc`; these internal
names are not substitutes for the documented public link parameter without further validation.

## Observed Topics

`Aerial View`, `Architecture`, `Art`, `Boat`, `Bridge`, `Car`, `Cemetery`, `Church`,
`Construction`, `Delaware River`, `Dignitaries`, `Entertainers`, `Health`, `Horse`, `Hospital`,
`Infrastructure`, `Monument`, `Mummers`, `Panorama`, `Parade`, `Park`, `People`, `Railroad`,
`Recreation`, `Restaurant`, `Schuylkill River`, `Sign`, `Store`, `Theatre`, `Transportation`,
`Wagon`.

The site states that topics are a new feature and not all records have assigned topics.

## Observed Series

`Billboards`, `Centennial Exhibition 1876`, `Dignitaries and Entertainers`,
`Featured Photos from the Sesquicentennial`, `Historic Houses in Fairmount Park`,
`Historical Images of Philadelphia`, `Philadelphia Piers`, `Statues by the Calder Artists`,
`Winter Scenes`.

## Observed Collections

`DOR Archives`, `DOR Archives - Manuscript Plans and Maps`, `DOR Archives - Sesquicentennial`,
`DOR Property Maps`, `Free Library - Centennial Exhibition`, `Free Library - Historic Maps`,
`Free Library - Historical Images of Philadelphia`, `Library Company of Philadelphia`,
`Office of the City Representative`, `Phila. Water Dept. Photographs`.

## Usage

The default crawler seed is a bounded Philadelphia-area URL using `limit=24`. A specific
documented search URL can be supplied for bounded runs:

```bash
uv run python scripts/crawl.py --mode one-search \
  --seed-url 'https://www.phillyhistory.org/PhotoArchive/Search.aspx?type=area&minx=-8395000&miny=4835000&maxx=-8340000&maxy=4885000&collections=DOR+Archives&limit=24'
```

Use `--max-search-pages` and `--max-details` with `sample`; filter vocabularies do not remove the
crawler's mandatory crawl bounds.

## Public Image URI Metadata

Detail metadata lists ordinary public display images as `MediaStream.ashx?mediaId=...`. These
responses are generally preview-sized images.

When a detail media entry exposes `mediaHasHires=true`, the public page's viewer uses
`HiRes.ashx` as a WMS image service with a `5900 x 5000` extent and `256 x 256` tiles. The
crawler stores two `full_candidate` URI records for that condition:

- A full-extent WMS `GetMap` candidate URI.
- A `BBOX={bbox}` 256-pixel tile URI template for downstream viewers.

These are URI metadata only. The crawler does not request, download, stitch, or mirror the
high-resolution image tiles.

### Licensing Constraint

The public site states that many images may be available as high-resolution digital files through
its photo licensing request workflow. It describes indicative charges of `$50 - $100` per image
for commercial/for-profit use, `$10 - $15` per image for non-profit use, and variable pricing for
government use. Availability is subject to review by the PhillyHistory team.

That licensing workflow is not an image API and is outside crawler scope. Unless a public
metadata response explicitly exposes `mediaHasHires=true` and a usable public `HiRes.ashx`
viewer URI, this crawler cannot obtain or claim access to a full-resolution/licensed original.
