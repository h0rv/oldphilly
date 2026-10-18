import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as z from "zod/mini";
import { parseArchive, locationSchema } from "../src/model.ts";
import type { MenuArchive, Menu } from "../src/model.ts";
import { scansSchema } from "../src/scans.ts";
import {
  parseCatalog,
  validateCatalogSources,
  catalogDateSchema,
  catalogLocationSchema,
  reviewSchema,
} from "../src/catalog-model.ts";
import type {
  Catalog,
  CatalogVenue,
  CatalogMenu,
  CatalogPage,
  Citation,
  ReviewState,
  CatalogDate,
  CatalogLocation,
} from "../src/catalog-model.ts";

// Reviewed factual annotations distilled from the three 2026-10-18 corpus reviews.
// These committed decisions make regeneration independent of temporary research files.
// Each annotation names its source, venue identity, dating precision and evidence.
const decisionSchema = z.object({
  sourceId: z.string(),
  venueId: z.optional(z.string()),
  venueName: z.nullable(z.string()),
  kind: z.enum(["restaurant", "hotel", "club", "event", "unknown"]),
  branch: z.nullable(z.string()),
  reason: z.string(),
  urls: z.array(z.url()),
  dateValue: z.nullable(z.string()),
  precision: z.nullable(z.enum(["day", "month", "year", "range", "unknown"])),
  status: z.enum(["not-reviewed", "verified", "unresolved", "conflict"]),
});
const decisions = z.array(decisionSchema).parse([
  {
    sourceId: "cia-10021",
    venueName: "Kelly's",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/10021"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-11700",
    venueName: "Kelly's",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/11700"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-12064",
    venueName: "Ye Olde Cheshire Cheese",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/12064"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-12094",
    venueName: "Old Original Bookbinder's",
    kind: "restaurant",
    branch: "125 Walnut Street",
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: [
      "https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/12094",
      "https://www.wikidata.org/w/index.php?title=Q7084674&oldid=1867758754",
    ],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-12273",
    venueName: "Ristorante da Gaetano",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/12273"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-13733",
    venueName: "La Panetiere",
    kind: "restaurant",
    branch: "1602 Locust Street",
    reason:
      "The separately dated 1972 La Panetiere record cia-19539 has no address and is not evidence that this undated record belongs at 1602 Locust on a particular date.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/13733"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-13777",
    venueName: "La Panetiere",
    kind: "restaurant",
    branch: "1602 Locust Street",
    reason:
      "The separately dated 1972 La Panetiere record cia-19539 has no address and is not evidence that this undated record belongs at 1602 Locust on a particular date.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/13777"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-14244",
    venueName: "Deja Vu",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/14244"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-16186",
    venueName: "O'Brien's",
    kind: "restaurant",
    branch: "Bellevue-Stratford Hotel",
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/16186"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-16789",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/16789"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-17072",
    venueName: "Bookbinders Sea Food House",
    kind: "restaurant",
    branch: "215 South 15th Street",
    reason:
      "Catalog entries give 215 South 15th Street. Distinct from cia-8063 and cia-12094, which identify Old Original Bookbinder’s at 125 Walnut Street.",
    urls: [
      "https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/17072",
      "https://hiddencityphila.org/2015/01/rebooting-bookies-garces-group-awakens-the-spirit-of-an-old-original-legend/",
    ],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-17581",
    venueName: "Bookbinders Sea Food House",
    kind: "restaurant",
    branch: "215 South 15th Street",
    reason:
      "Catalog entries give 215 South 15th Street. Distinct from cia-8063 and cia-12094, which identify Old Original Bookbinder’s at 125 Walnut Street.",
    urls: [
      "https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/17581",
      "https://hiddencityphila.org/2015/01/rebooting-bookies-garces-group-awakens-the-spirit-of-an-old-original-legend/",
    ],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-17865",
    venueName: "Middle East Restaurant",
    kind: "restaurant",
    branch: null,
    reason:
      "Undated record; later reported Chestnut Street location does not date this menu or establish continuous occupancy at 935 Ellsworth.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/17865"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-18438",
    venueName: "Stratford Gardens",
    kind: "restaurant",
    branch: "Bellevue-Stratford Hotel",
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/18438"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-19268",
    venueName: "Palm Restaurant",
    kind: "restaurant",
    branch: "Bellevue-Stratford Hotel · 200 South Broad",
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/19268"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-19539",
    venueId: "venue-la-panetiere-exact-branch-unresolved",
    venueName: "La Panetiere",
    kind: "restaurant",
    branch: null,
    reason:
      "Separate La Panetiere record dated 1972 has no street address; do not attach to the 1602 Locust Street records by name alone.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/19539"],
    dateValue: null,
    precision: null,
    status: "unresolved",
  },
  {
    sourceId: "cia-20281",
    venueName: "Garden",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/20281"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-20356",
    venueName: "Shoyer's",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/20356"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-21038",
    venueName: "Pub Tiki",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/21038"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-230",
    venueName: "Academy of Music Ballroom",
    kind: "event",
    branch: null,
    reason:
      "Catalog title and description identify the Ballroom as the event venue; Culinary Institute of America and Societe Culinaire are organizations/sponsors, not the dining venue.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/230"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-2535",
    venueName: "Hotel Sylvania",
    kind: "hotel",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/2535"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-2537",
    venueName: "Hotel Sylvania",
    kind: "hotel",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/2537"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-2548",
    venueName: "Hotel Sylvania",
    kind: "hotel",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/2548"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-4425",
    venueName: "Cafe L'Aiglon",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/4425"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-6425",
    venueName: "Benjamin Franklin Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/6425"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-7530",
    venueName: "Cafe Lafitte",
    kind: "restaurant",
    branch: null,
    reason:
      "Catalog address reads “1302-04 Drury Lane”; prior historical report reads “1302 Drury Street.” Venue/address form unresolved.",
    urls: [
      "https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/7530",
      "https://pchrlgbt.wordpress.com/wp-content/uploads/2017/01/coalition-on-lesbian-gay-bar-policies-report-1986-1.pdf",
    ],
    dateValue: null,
    precision: null,
    status: "unresolved",
  },
  {
    sourceId: "cia-8063",
    venueName: "Old Original Bookbinder's",
    kind: "restaurant",
    branch: "125 Walnut Street",
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: [
      "https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/8063",
      "https://www.wikidata.org/w/index.php?title=Q7084674&oldid=1867758754",
    ],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-8074",
    venueName: "Fisher's Seafood Restaurant",
    kind: "restaurant",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/8074"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "cia-8285",
    venueName: "Whitman's",
    kind: "restaurant",
    branch: null,
    reason:
      "Catalog calls Whitman’s a restaurant at 1626 Chestnut; Philadelphia building inventory calls the location Whitman & Son Retail Store. Exact venue relationship unresolved.",
    urls: [
      "https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/8285",
      "https://www.philadelphiabuildings.org/pab/app/view_street.cfm/22820?PJ_GRID_BlockNumber=16",
    ],
    dateValue: null,
    precision: null,
    status: "unresolved",
  },
  {
    sourceId: "cia-8701",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "CIA factual parent metadata identifies this venue; scan pixels and printed details were not reviewed.",
    urls: ["https://cdm16940.contentdm.oclc.org/digital/collection/p16940coll1/id/8701"],
    dateValue: null,
    precision: null,
    status: "verified",
  },
  {
    sourceId: "nypl-13759",
    venueName: "Savoy Hotel",
    kind: "hotel",
    branch: null,
    reason: "NYPL title says menu held by Savoy Hotel; catalog location only Philadelphia.",
    urls: ["http://digitalcollections.nypl.org/items/e3f7e830-c539-012f-6f38-58d385a7bc34"],
    dateValue: "1900",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-14050",
    venueName: "Bellevue Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "The NYPL catalog explicitly places the dinner at Bellevue Hotel; keep the historical name as cataloged, separate from Bellevue-Stratford.",
    urls: ["http://digitalcollections.nypl.org/items/04ed8ee0-c53e-012f-de3c-58d385a7bc34"],
    dateValue: "1901",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-14110",
    venueName: null,
    kind: "unknown",
    branch: null,
    reason:
      "Catalog says held by Union League but gives city as location; the club identity and historic Broad Street building support this candidate venue.",
    urls: [
      "http://digitalcollections.nypl.org/items/18355650-c53e-012f-f446-58d385a7bc34",
      "https://www.unionleague.org/history",
    ],
    dateValue: "1901",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-14406",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason: "Catalog explicitly names hotel as event location.",
    urls: [
      "http://digitalcollections.nypl.org/items/214edf70-c542-012f-9bd2-58d385a7bc34",
      "https://en.wikipedia.org/wiki/The_Bellevue-Stratford_Hotel",
    ],
    dateValue: "1907",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-21050",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason: "Catalog explicitly names hotel as event location.",
    urls: [
      "http://digitalcollections.nypl.org/items/cf1dbfd0-c540-012f-38d9-58d385a7bc34",
      "https://en.wikipedia.org/wiki/The_Bellevue-Stratford_Hotel",
    ],
    dateValue: "1907",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-21244",
    venueName: null,
    kind: "unknown",
    branch: null,
    reason: "Sponsor and city only; catalog does not identify event venue.",
    urls: ["http://digitalcollections.nypl.org/items/6753e2d0-c530-012f-9b8a-58d385a7bc34"],
    dateValue: "1887",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-21577",
    venueName: null,
    kind: "unknown",
    branch: null,
    reason:
      "Catalog says held by Union League but [at] Philadelphia and no distinct location; a Union League dining room or club venue is plausible but unconfirmed.",
    urls: [
      "http://digitalcollections.nypl.org/items/f906eba0-c531-012f-3945-58d385a7bc34",
      "https://www.unionleague.org/history",
    ],
    dateValue: "1895",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-21582",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason: "Catalog explicitly names hotel as event location.",
    urls: [
      "http://digitalcollections.nypl.org/items/d52abe80-c540-012f-f0c0-58d385a7bc34",
      "https://en.wikipedia.org/wiki/The_Bellevue-Stratford_Hotel",
    ],
    dateValue: "1907",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-21701",
    venueName: "Philadelphia Bourse",
    kind: "event",
    branch: null,
    reason: "Catalog explicitly names Philadelphia Bourse as location.",
    urls: [
      "http://digitalcollections.nypl.org/items/22b16a70-c532-012f-de25-58d385a7bc34",
      "https://www.ocfrealty.com/naked-philly/uncategorized/history-buff-the-philadelphia-bourse/",
    ],
    dateValue: "1895",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-21754",
    venueName: "Union League of Philadelphia",
    kind: "club",
    branch: null,
    reason: "Catalog explicitly names Union League as location.",
    urls: [
      "http://digitalcollections.nypl.org/items/970690e0-c533-012f-051e-58d385a7bc34",
      "https://www.unionleague.org/history",
    ],
    dateValue: "1899",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-21869",
    venueName: "Union League of Philadelphia",
    kind: "club",
    branch: null,
    reason: "Catalog explicitly names Union League as location.",
    urls: [
      "http://digitalcollections.nypl.org/items/022267b0-c542-012f-37cd-58d385a7bc34",
      "https://www.unionleague.org/history",
    ],
    dateValue: "1907",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-21962",
    venueName: "Majestic Hotel (Philadelphia)",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog explicitly names Majestic Hotel; historic place listing supplies street address.",
    urls: [
      "http://digitalcollections.nypl.org/items/cf21ec10-c541-012f-35dc-58d385a7bc34",
      "https://www.philadelphiabuildings.org/pab/app/pj_display.cfm/83274",
    ],
    dateValue: "1907",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22008",
    venueName: "Bellevue Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog title says at The Bellevue, distinct exact historic building match not established by catalog alone; retain as its own canonical venue pending review.",
    urls: ["http://digitalcollections.nypl.org/items/65bae5e0-c533-012f-4bb2-58d385a7bc34"],
    dateValue: "1898",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22280",
    venueName: "Colonnade Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog says held by Colonnade Hotel at Philadelphia; no street address supported by reviewed sources.",
    urls: ["http://digitalcollections.nypl.org/items/2e8f4ed0-c530-012f-1bea-58d385a7bc34"],
    dateValue: "1882",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22295",
    venueName: "Horticultural Hall",
    kind: "event",
    branch: null,
    reason:
      "Catalog explicitly names Horticultural Hall; Philadelphia Architects and Buildings identifies the demolished hall at this address.",
    urls: [
      "http://digitalcollections.nypl.org/items/f2466aa0-c532-012f-f1be-58d385a7bc34",
      "https://www.philadelphiabuildings.org/pab/app/ho_display_map.cfm/162644",
    ],
    dateValue: "1897",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22396",
    venueName: "Masonic Temple (Philadelphia)",
    kind: "event",
    branch: null,
    reason:
      "Catalog says held by Masonic Temple; Library of Congress HABS record names the temple at 1 North Broad Street.",
    urls: [
      "http://digitalcollections.nypl.org/items/9fe6ede0-c530-012f-35c6-58d385a7bc34",
      "https://www.loc.gov/resource/hhh.pa1064.sheet/",
    ],
    dateValue: "1889",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22416",
    venueName: null,
    kind: "unknown",
    branch: null,
    reason: "Sponsor and city only; catalog does not identify event venue.",
    urls: ["http://digitalcollections.nypl.org/items/a23cc080-c531-012f-dc08-58d385a7bc34"],
    dateValue: "1893",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-22467",
    venueName: null,
    kind: "unknown",
    branch: null,
    reason: "Sponsor and city only; catalog does not identify event venue.",
    urls: ["http://digitalcollections.nypl.org/items/4ac77bf0-c53f-012f-d329-58d385a7bc34"],
    dateValue: "1906",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-22519",
    venueName: "Philadelphia Bourse",
    kind: "event",
    branch: null,
    reason: "Catalog explicitly names Bourse as location.",
    urls: [
      "http://digitalcollections.nypl.org/items/8b79ec20-c532-012f-f4d0-58d385a7bc34",
      "https://www.ocfrealty.com/naked-philly/uncategorized/history-buff-the-philadelphia-bourse/",
    ],
    dateValue: "1897",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22577",
    venueName: "Bingham House",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog explicitly says held by Bingham House; location field is Philadelphia only; no address supported by reviewed sources.",
    urls: ["http://digitalcollections.nypl.org/items/db9506e0-c533-012f-b90a-58d385a7bc34"],
    dateValue: "1899",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22759",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason: "Catalog explicitly names hotel as event location.",
    urls: [
      "http://digitalcollections.nypl.org/items/303d0a60-c53f-012f-4b64-58d385a7bc34",
      "https://en.wikipedia.org/wiki/The_Bellevue-Stratford_Hotel",
    ],
    dateValue: "1906",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22779",
    venueName: "Horticultural Hall",
    kind: "event",
    branch: null,
    reason:
      "Catalog explicitly names Horticultural Hall; Philadelphia Architects and Buildings identifies the demolished hall at this address.",
    urls: [
      "http://digitalcollections.nypl.org/items/195b3130-c542-012f-1e97-58d385a7bc34",
      "https://www.philadelphiabuildings.org/pab/app/ho_display_map.cfm/162644",
    ],
    dateValue: "1907",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22780",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason: "Catalog explicitly names hotel as event location.",
    urls: [
      "http://digitalcollections.nypl.org/items/84ae0a50-c540-012f-00a3-58d385a7bc34",
      "https://en.wikipedia.org/wiki/The_Bellevue-Stratford_Hotel",
    ],
    dateValue: "1906",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22882",
    venueName: "Continental Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog identifies The Continental and NYPL genre as hotel; historical Philadelphia Encyclopedia places the Continental on Chestnut Street but does not establish a block here.",
    urls: ["http://digitalcollections.nypl.org/items/b2a74c10-c531-012f-4f77-58d385a7bc34"],
    dateValue: "1894",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-22976",
    venueName: "Dutch Room, Majestic Grotto (as cataloged)",
    kind: "restaurant",
    branch: null,
    reason:
      "Catalog gives the location as “The Dutch Room of the Majestic Grotto”; preserve this wording and do not merge with Majestic Hotel absent source-specific corroboration.",
    urls: ["http://digitalcollections.nypl.org/items/51bcb8f0-c540-012f-28c3-58d385a7bc34"],
    dateValue: "1906",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23128",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason: "Catalog explicitly names hotel as event location.",
    urls: [
      "http://digitalcollections.nypl.org/items/39a17030-c53f-012f-b845-58d385a7bc34",
      "https://en.wikipedia.org/wiki/The_Bellevue-Stratford_Hotel",
    ],
    dateValue: "1906",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23209",
    venueName: "Hotel Stenton",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog explicitly names Hotel Stenton as location; address research delegated elsewhere; no address added in this review.",
    urls: ["http://digitalcollections.nypl.org/items/44de7c60-c532-012f-d23b-58d385a7bc34"],
    dateValue: "1896",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23277",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason: "Catalog explicitly names hotel as event location.",
    urls: [
      "http://digitalcollections.nypl.org/items/a164f5b0-c53e-012f-764d-58d385a7bc34",
      "https://en.wikipedia.org/wiki/The_Bellevue-Stratford_Hotel",
    ],
    dateValue: "1905",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23323",
    venueName: "Hotel Walton",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog says held by Hotel Walton; historical city history identifies the hotel at this corner.",
    urls: [
      "http://digitalcollections.nypl.org/items/4faf8bb0-c532-012f-cfb4-58d385a7bc34",
      "https://blog.phillyhistory.org/index.php/2009/02/staying-in-philadelphia-the-hotel-stenton-and-hotel-walton/",
    ],
    dateValue: "1896",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23436",
    venueName: "Hotel Metropole",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog explicitly names Hotel Metropole; PhillyHistory says Hotel Walton incorporated the earlier Metropole on the same site.",
    urls: [
      "http://digitalcollections.nypl.org/items/e03affc0-c531-012f-c779-58d385a7bc34",
      "https://blog.phillyhistory.org/index.php/2009/02/staying-in-philadelphia-the-hotel-stenton-and-hotel-walton/",
    ],
    dateValue: "1895",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23473",
    venueName: "Hotel Walton",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog says held by Hotel Walton; historical city history identifies the hotel at this corner.",
    urls: [
      "http://digitalcollections.nypl.org/items/4ed74d10-c532-012f-aa34-58d385a7bc34",
      "https://blog.phillyhistory.org/index.php/2009/02/staying-in-philadelphia-the-hotel-stenton-and-hotel-walton/",
    ],
    dateValue: "1896",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23612",
    venueName: "Stratford Hotel (as cataloged)",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog explicitly names Stratford Hotel, but it is not safe to normalize to Bellevue-Stratford solely from shared word “Stratford”.",
    urls: ["http://digitalcollections.nypl.org/items/aa33edf0-c535-012f-90e6-58d385a7bc34"],
    dateValue: "1900",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23721",
    venueName: "Pen and Pencil Club",
    kind: "club",
    branch: null,
    reason:
      "Catalog explicitly names Pen and Pencil Club as location; no address supported by reviewed sources.",
    urls: ["http://digitalcollections.nypl.org/items/d2419660-c53f-012f-1eb5-58d385a7bc34"],
    dateValue: "1906",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23775",
    venueName: "Bellevue Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog says at The Bellevue; preserve separate from Bellevue-Stratford until the historic name/location match is independently established.",
    urls: ["http://digitalcollections.nypl.org/items/092c3fc0-c533-012f-caeb-58d385a7bc34"],
    dateValue: "1898",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-23995",
    venueName: "Hotel Walton",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog says held by Hotel Walton; historical city history identifies the hotel at this corner.",
    urls: [
      "http://digitalcollections.nypl.org/items/4f4ea950-c532-012f-5fae-58d385a7bc34",
      "https://blog.phillyhistory.org/index.php/2009/02/staying-in-philadelphia-the-hotel-stenton-and-hotel-walton/",
    ],
    dateValue: "1896",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-24054",
    venueName: "Majestic Hotel (Philadelphia)",
    kind: "hotel",
    branch: null,
    reason:
      "Catalog explicitly names Hotel Majestic; Philadelphia Architects and Buildings listing identifies Majestic Hotel at this address.",
    urls: [
      "http://digitalcollections.nypl.org/items/f7af73a0-c541-012f-f4b5-58d385a7bc34",
      "https://www.philadelphiabuildings.org/pab/app/pj_display.cfm/83274",
    ],
    dateValue: "1907",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-24074",
    venueName: null,
    kind: "unknown",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/401e3e80-c53e-012f-b3a8-58d385a7bc34",
      "https://menus.nypl.org/menus/24074",
    ],
    dateValue: "1905",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-24475",
    venueName: "Hotel Rodman",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/df0e44a0-c53e-012f-a57b-58d385a7bc34",
      "https://menus.nypl.org/menus/24475",
    ],
    dateValue: "1905",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-24606",
    venueName: "Hotel Walton",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/4e63a960-c532-012f-08bd-58d385a7bc34",
      "https://menus.nypl.org/menus/24606",
    ],
    dateValue: "1896",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-24819",
    venueName: "Hotel Edouard",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/298ddfd0-c53e-012f-7e38-58d385a7bc34",
      "https://menus.nypl.org/menus/24819",
    ],
    dateValue: "1905",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-24827",
    venueName: null,
    kind: "unknown",
    branch: null,
    reason:
      "CSV calls this Continental Hotel, Philadelphia; capture-matched NYPL metadata calls it St. Nicholas Hotel, New York. Venue and city conflict remains unresolved.",
    urls: [
      "http://digitalcollections.nypl.org/items/f5193530-c52f-012f-4a60-58d385a7bc34",
      "https://menus.nypl.org/menus/24827",
    ],
    dateValue: "1862",
    precision: "year",
    status: "conflict",
  },
  {
    sourceId: "nypl-25348",
    venueName: "Cedar Park Driving Club",
    kind: "club",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/496870d0-c540-012f-c45c-58d385a7bc34",
      "https://menus.nypl.org/menus/25348",
    ],
    dateValue: "1906",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-25574",
    venueName: "Bohemia Hall",
    kind: "event",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/ca585b70-c53f-012f-f080-58d385a7bc34",
      "https://menus.nypl.org/menus/25574",
    ],
    dateValue: "1906",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-25708",
    venueName: "Bingham House",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/81d86bd0-c533-012f-b23c-58d385a7bc34",
      "https://menus.nypl.org/menus/25708",
    ],
    dateValue: "1898",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-25775",
    venueName: "Hotel Walton",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/66ac2ae0-c532-012f-f202-58d385a7bc34",
      "https://menus.nypl.org/menus/25775",
    ],
    dateValue: "1896",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-25857",
    venueName: "Union League of Philadelphia",
    kind: "club",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/c9a5beb0-c531-012f-1127-58d385a7bc34",
      "https://menus.nypl.org/menus/25857",
    ],
    dateValue: "1894",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-25999",
    venueName: "Masonic Temple (Philadelphia)",
    kind: "event",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/82262a90-c532-012f-5f0a-58d385a7bc34",
      "https://menus.nypl.org/menus/25999",
    ],
    dateValue: "1897",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-26051",
    venueName: "Auberge Lafayette",
    kind: "restaurant",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/6af49a90-c533-012f-f9e3-58d385a7bc34",
      "https://menus.nypl.org/menus/26051",
    ],
    dateValue: "1898",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-26300",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/2bc31410-c540-012f-7199-58d385a7bc34",
      "https://menus.nypl.org/menus/26300",
    ],
    dateValue: "1906",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-27260",
    venueName: "Warwick Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "https://menus.nypl.org/menus/27260",
      "https://menus.nypl.org/menus/27260",
      "https://images.nypl.org/index.php?id=2057289&t=w",
      "https://images.nypl.org/index.php?id=3883380&t=w",
      "https://www.pacodeandbulletin.gov/secure/pabulletin/data/vol38/38-23/38_23_p2.pdf.",
    ],
    dateValue: "1959-05-12",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-27457",
    venueName: null,
    kind: "unknown",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/e1d627b0-c543-012f-5b82-58d385a7bc34",
      "https://menus.nypl.org/menus/27457",
    ],
    dateValue: "1930",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-28620",
    venueId: "venue-old-original-bookbinders-exact-branch-unresolved",
    venueName: "Old Original Bookbinder's",
    kind: "restaurant",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field. Exact branch address remains unresolved; keep this identity separate from address-matched venues.",
    urls: [
      "http://digitalcollections.nypl.org/items/3f92fd50-c551-012f-25cb-58d385a7bc34",
      "https://menus.nypl.org/menus/28620",
    ],
    dateValue: "1957",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-29428",
    venueId: "venue-old-original-bookbinders-exact-branch-unresolved",
    venueName: "Old Original Bookbinder's",
    kind: "restaurant",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field. Exact branch address remains unresolved; keep this identity separate from address-matched venues.",
    urls: [
      "http://digitalcollections.nypl.org/items/6951d030-c550-012f-dd50-58d385a7bc34",
      "https://menus.nypl.org/menus/29428",
    ],
    dateValue: "1953",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-29916",
    venueName: "Kugler's Chestnut Street Restaurant",
    kind: "restaurant",
    branch: "Widener Building",
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/f7807230-c54f-012f-a777-58d385a7bc34",
      "https://menus.nypl.org/menus/29916",
      "https://menus.nypl.org/menus/29916",
      "https://ecommons.cornell.edu/bitstream/1813/27575/1/053_14.pdf.",
    ],
    dateValue: "1949-02-01",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-29996",
    venueName: "Benjamin Franklin Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/d1c45b20-c54f-012f-09ce-58d385a7bc34",
      "https://menus.nypl.org/menus/29996",
      "https://menus.nypl.org/menus/29996",
      "https://www.ccpconline.com/contact-us.",
    ],
    dateValue: "1948-01-26",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-30086",
    venueId: "venue-bookbinders-sea-food-house-exact-branch-unresolved",
    venueName: "Bookbinders Sea Food House",
    kind: "restaurant",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field. Exact branch address remains unresolved; keep this identity separate from address-matched venues.",
    urls: [
      "http://digitalcollections.nypl.org/items/323a5560-c54f-012f-156a-58d385a7bc34",
      "https://menus.nypl.org/menus/30086",
    ],
    dateValue: "1943",
    precision: "year",
    status: "unresolved",
  },
  {
    sourceId: "nypl-30411",
    venueId: "venue-horn-hardart-exact-branch-unresolved",
    venueName: "Horn & Hardart",
    kind: "restaurant",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field. Exact branch address remains unresolved; keep this identity separate from address-matched venues.",
    urls: [
      "http://digitalcollections.nypl.org/items/cad1c7c0-c54e-012f-5464-58d385a7bc34",
      "https://menus.nypl.org/menus/30411",
      "https://menus.nypl.org/menus/30411",
    ],
    dateValue: "1940-08-03",
    precision: "day",
    status: "unresolved",
  },
  {
    sourceId: "nypl-30431",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/d3379c00-c54e-012f-007f-58d385a7bc34",
      "https://menus.nypl.org/menus/30431",
      "https://menus.nypl.org/menus/30431",
    ],
    dateValue: "1940-09-28",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-30462",
    venueName: "Kugler's Marine Grill",
    kind: "restaurant",
    branch: "Fifteenth Street above Chestnut",
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/e3e4bf70-c54e-012f-9eea-58d385a7bc34",
      "https://menus.nypl.org/menus/30462",
      "https://menus.nypl.org/menus/30462",
      "https://www.phideltathetaarchive.com/wp-content/uploads/2012/04/1939-40_vol64_no1-5.pdf",
      "https://ecommons.cornell.edu/bitstream/1813/27450/1/047_09.pdf.",
    ],
    dateValue: "1941-01-07",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-30472",
    venueName: "2601 Parkway Restaurant",
    kind: "restaurant",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/e93a9720-c54e-012f-f9fd-58d385a7bc34",
      "https://menus.nypl.org/menus/30472",
      "https://menus.nypl.org/menus/30472",
      "https://www.deltasigmapi.org/docs/default-source/DELTASIG-Magazine/1940s/1947-deltasig-vol-37-no-1-november.pdf?sfvrsn=b995699b_2;",
      "https://www.2601parkway.com/history/.",
      "https://triobyob.com/2020/.",
    ],
    dateValue: "1941-02-23",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-30777",
    venueName: "Benjamin Franklin Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/f8c79f80-c54c-012f-6297-58d385a7bc34",
      "https://menus.nypl.org/menus/30777",
      "https://menus.nypl.org/menus/30777",
    ],
    dateValue: "1934-01-19",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-32047",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/ad0d45e0-c54a-012f-0299-58d385a7bc34",
      "https://menus.nypl.org/menus/32047",
      "https://menus.nypl.org/menus/32047",
    ],
    dateValue: "1919-09-26",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-32212",
    venueName: "Hotel Adelphia",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/8f060350-c547-012f-bc1b-58d385a7bc34",
      "https://menus.nypl.org/menus/32212",
      "https://menus.nypl.org/menus/32212",
      "https://www.philadelphiabuildings.org/pab/app/ar_display_projects.cfm/22266",
      "https://www.philadelphiabuildings.org/pab/app/pj_display_citations_holdings.cfm/69318.",
    ],
    dateValue: "1916-08-17",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-33270",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Original NYPL date 1915-01-01 conflicts with inherited printed-date audit 1915-01-02; scan pixels were unavailable in this review.",
    urls: [
      "http://digitalcollections.nypl.org/items/cc6b0980-c546-012f-10b1-58d385a7bc34",
      "https://menus.nypl.org/menus/33270",
      "https://menus.nypl.org/menus/33270",
    ],
    dateValue: "1915-01-02",
    precision: "day",
    status: "conflict",
  },
  {
    sourceId: "nypl-33548",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/b2627f00-c544-012f-614e-58d385a7bc34",
      "https://menus.nypl.org/menus/33548",
      "https://menus.nypl.org/menus/33548",
    ],
    dateValue: "1914-01-02",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-33662",
    venueName: "Hotel Adelphia",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/ed7242e0-c544-012f-0226-58d385a7bc34",
      "https://menus.nypl.org/menus/33662",
      "https://menus.nypl.org/menus/33662",
    ],
    dateValue: "1914",
    precision: "year",
    status: "verified",
  },
  {
    sourceId: "nypl-33793",
    venueName: "Hotel Adelphia",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/310813f0-c545-012f-9386-58d385a7bc34",
      "https://menus.nypl.org/menus/33793",
      "https://menus.nypl.org/menus/33793",
    ],
    dateValue: "1914-02-18",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-33796",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/33304e40-c545-012f-acfd-58d385a7bc34",
      "https://menus.nypl.org/menus/33796",
      "https://menus.nypl.org/menus/33796",
    ],
    dateValue: "1914-02-18",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-33815",
    venueName: "Hotel Adelphia",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/3ea16120-c545-012f-204b-58d385a7bc34",
      "https://menus.nypl.org/menus/33815",
      "https://menus.nypl.org/menus/33815",
    ],
    dateValue: "1914-02-21",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-33972",
    venueName: "Hotel Adelphia",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/16f17db0-c546-012f-4aa2-58d385a7bc34",
      "https://menus.nypl.org/menus/33972",
      "https://menus.nypl.org/menus/33972",
    ],
    dateValue: "1914-07-04",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-34327",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/ae4d66f0-c546-012f-9684-58d385a7bc34",
      "https://menus.nypl.org/menus/34327",
      "https://menus.nypl.org/menus/34327",
    ],
    dateValue: "1914-11-30",
    precision: "day",
    status: "verified",
  },
  {
    sourceId: "nypl-34841",
    venueName: "Bellevue-Stratford Hotel",
    kind: "hotel",
    branch: null,
    reason:
      "Preserve NYPL source title/call number and distinguish the item holder/sponsor from the place named after “at” in the official catalog title and the NYPL CSV place field.",
    urls: [
      "http://digitalcollections.nypl.org/items/e04943d0-d2cb-0130-d46f-58d385a7bbd0",
      "https://menus.nypl.org/menus/34841",
    ],
    dateValue: "1912",
    precision: "year",
    status: "verified",
  },
]);
const additionalLocations = z
  .array(z.object({ menuIds: z.array(z.string()), location: locationSchema }))
  .parse([
    {
      menuIds: ["nypl-32212", "nypl-33662", "nypl-33793", "nypl-33815", "nypl-33972"],
      location: {
        lat: 39.95090833333334,
        lng: -75.16145,
        area: "Washington Square West",
        address: "1229–1237 Chestnut Street · Hotel Adelphia",
        basis:
          "The supplied printed-menu audits identify Hotel Adelphia in Philadelphia for these five records, dated 1914–1916; the existing curated address is 1229–1237 Chestnut Street, corroborated by Philadelphia Architects and Buildings record 69318. Wikidata Q136716538 identifies Hotel Adelphia as an alias of Adelphia House and supplies P625 as a representative building point. Dates retain their reviewed precision; nypl-33662 remains year-only.",
        evidence: "https://www.wikidata.org/w/index.php?title=Q136716538&oldid=2426513603",
      },
    },
    {
      menuIds: ["nypl-30472"],
      location: {
        lat: 39.96891388888889,
        lng: -75.18075,
        area: "Fairmount",
        address: "2601 Pennsylvania Avenue · 2601 Parkway",
        basis:
          "The supplied printed-menu audit identifies 2601 Parkway Restaurant and February 23, 1941; the existing curated address is 2601 Pennsylvania Avenue. The building association history places the building between 26th and 27th Streets and describes a restaurant at opening. Wikidata Q136716424 supplies a representative building point. This does not identify the 1941 operator as the present restaurant tenant.",
        evidence: "https://www.wikidata.org/w/index.php?title=Q136716424&oldid=2426492725",
      },
    },
  ]);
const decisionById = new Map(decisions.map((row) => [row.sourceId, row]));
const pointById = new Map(
  additionalLocations.flatMap((group) => group.menuIds.map((id) => [id, group.location])),
);
function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replaceAll(/[’']/gu, "")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}
function reviewed(
  status: ReviewState["status"],
  reason: string,
  citationIds: readonly string[],
): ReviewState {
  return reviewSchema.parse(
    status === "not-reviewed"
      ? { status, reason: null, citationIds: [] }
      : { status, reason, citationIds: [...new Set(citationIds)] },
  );
}
function normalizedDate(
  source: Menu,
  value: string | null,
  precision: string | null,
  citationIds: readonly string[],
  unreviewed: boolean,
): CatalogDate {
  const original = source.date;
  const sourceValues = [
    { name: "catalog date", value: original.catalogValue },
    { name: "source archive date", value: original.value ?? "" },
  ];
  const status = unreviewed
    ? "not-reviewed"
    : source.id === "nypl-33270"
      ? "conflict"
      : original.precision === "unknown"
        ? "unresolved"
        : "verified";
  const basis =
    unreviewed || source.provider === "CIA"
      ? original.basis
      : precision === "year"
        ? "Catalog year retained; the more precise snapshot date has not been verified from scan pixels."
        : "Inherited printed-date audit retained; scan pixels were unavailable in the current review.";
  const review = reviewed(
    status,
    source.id === "nypl-33270"
      ? "Original catalog date January 1 conflicts with the inherited printed-date reading January 2; both values remain in sourceValues."
      : basis,
    citationIds,
  );
  if (precision === "year" && value !== null)
    return catalogDateSchema.parse({
      precision: "year",
      value,
      year: Number(value),
      label: value,
      basis,
      sourceValues,
      review,
    });
  return catalogDateSchema.parse({
    precision: original.precision,
    value: original.value,
    year: original.year,
    label: original.label,
    sourceValues,
    review,
    basis,
  });
}
export function buildCatalog(archive: MenuArchive, scansValue: unknown): Catalog {
  const scans = scansSchema.parse(scansValue);
  const scanByPage = new Map(scans.pages.map((p) => [`${p.menuId}:${p.pageId}`, p]));
  if (scanByPage.size !== scans.pages.length) throw new Error("Duplicate scan page ownership");
  for (const scan of scans.pages) {
    const menu = archive.menus.find((m) => m.id === scan.menuId);
    if (menu === undefined || !menu.pages.some((page) => page.id === scan.pageId))
      throw new Error(`Orphan scan: ${scan.pageId}`);
    if (scan.menuId === "nypl-24827" || scan.pageId === "58186")
      throw new Error("Disputed scan must remain source-only");
  }
  const citations: Citation[] = [];
  const citationByUrl = new Map<string, string>();
  function cite(url: string, kind: Citation["kind"], label: string): string {
    const existing = citationByUrl.get(url);
    if (existing !== undefined) return existing;
    const id = `citation-${citations.length + 1}`;
    citations.push({ id, url, kind, label });
    citationByUrl.set(url, id);
    return id;
  }
  const menus: CatalogMenu[] = [],
    pages: CatalogPage[] = [];
  const venues = new Map<string, CatalogVenue>();
  for (const source of archive.menus) {
    const candidateName = source.catalog["curated_venue"] ?? source.catalog["restau"];
    const decision =
      decisionById.get(source.id) ??
      decisionSchema.parse({
        sourceId: source.id,
        venueName:
          typeof candidateName === "string" && candidateName.length > 0
            ? candidateName
            : source.name,
        kind: "unknown",
        branch: null,
        reason: "New source record awaits venue review.",
        urls: [],
        dateValue: null,
        precision: null,
        status: "not-reviewed",
      });
    const { venueName, kind, branch, reason, urls, dateValue, precision, status } = decision;
    const sourceCitationId = cite(
      source.url,
      "catalog",
      `${source.provider} record ${source.recordId}`,
    );
    const citationIds = [
      ...new Set([
        sourceCitationId,
        ...urls.map((u) =>
          cite(
            u,
            /(?:menus\.nypl\.org|digitalcollections\.nypl\.org|contentdm\.oclc\.org)/u.test(u)
              ? "catalog"
              : "historical",
            `${source.provider} venue/date evidence`,
          ),
        ),
      ]),
    ];
    const venueId =
      decision.venueId ??
      (venueName === null || status === "not-reviewed"
        ? `venue-unresolved-${source.id}`
        : `venue-${slug(venueName + (branch === null ? "" : ` ${branch}`))}`);
    const review = reviewed(status, reason, citationIds);
    const prior = venues.get(venueId);
    venues.set(venueId, {
      id: venueId,
      name: venueName ?? source.name,
      kind,
      branch,
      review:
        prior === undefined
          ? review
          : reviewed(
              prior.review.status === "unresolved" || status === "unresolved"
                ? "unresolved"
                : "verified",
              decision.venueId === undefined
                ? "Venue identity is grouped from reviewed catalog metadata; individual menu reviews retain source-specific limitations."
                : "Exact branch address remains unresolved. These records are kept separate from address-matched venues.",
              [...prior.review.citationIds, ...citationIds],
            ),
    });
    const point = source.location ?? pointById.get(source.id);
    let location: CatalogLocation;
    if (point !== undefined && status !== "conflict") {
      const evidence = cite(
        point.evidence,
        "gazetteer",
        "Reviewed representative building coordinate",
      );
      location = catalogLocationSchema.parse({
        precision: "exact",
        lat: point.lat,
        lng: point.lng,
        area: point.area,
        address: point.address,
        bbox: [point.lng, point.lat, point.lng, point.lat],
        basis: `${point.basis} This is a representative building locator, not a rooftop survey or an individual dining room.`,
        evidenceCitationIds: [evidence],
        review: reviewed("verified", point.basis, [...citationIds, evidence]),
      });
    } else {
      const address = source.catalog["curated_address"] ?? source.catalog["addres"];
      location = {
        precision: "unknown",
        address: typeof address === "string" && address.length > 0 ? address : null,
        basis:
          status === "conflict"
            ? "Conflicting source identity; no geometry assigned."
            : source.locationNote,
        review: reviewed(
          status === "conflict" ? "conflict" : "unresolved",
          "Historical metadata retained; no reviewed geometry for this source-specific branch.",
          citationIds,
        ),
      };
    }
    const pageIds: string[] = [];
    for (const page of source.pages) {
      const id = `${source.provider.toLowerCase()}-${page.id}`;
      pageIds.push(id);
      const scan = scanByPage.get(`${source.id}:${page.id}`);
      const pageCitation = cite(page.url, "catalog", `${source.provider} page ${page.id}`);
      const image =
        scan === undefined
          ? null
          : {
              imageId: scan.imageId,
              previewUrl: scan.previewUrl,
              fullUrl: scan.fullUrl,
              width: scan.width,
              height: scan.height,
              credit: scan.credit,
              recordUrl: scan.recordUrl,
              evidence: scan.evidence,
            };
      const evidenceIds =
        image === null
          ? [pageCitation, ...citationIds]
          : [
              pageCitation,
              cite(image.evidence, "dataset", "Official NYPL public-domain metadata capture match"),
            ];
      const conflict = source.id === "nypl-24827" || page.id === "58186";
      pages.push({
        id,
        menuId: source.id,
        sourcePageId: page.id,
        label: page.label,
        image,
        review: reviewed(
          conflict ? "conflict" : "source-unavailable",
          conflict
            ? page.id === "58186"
              ? "Attached page is a Rosoff’s New York advertisement; retained as a source-only artifact page."
              : "Capture-matched catalog identity conflicts with the selected Philadelphia record; preview withheld."
            : image === null
              ? "No source-specific public-domain image match; scan pixels were not reviewed."
              : "Official NYPL public-domain metadata matches this capture. Image host returned HTTP 403 during research; scan pixels and printed contents were not reviewed.",
          evidenceIds,
        ),
      });
    }
    const reversedPrices = source.dishes.filter(
      (d) => d.price !== null && d.priceHigh !== null && d.priceHigh < d.price,
    );
    const priceReview = reviewed(
      reversedPrices.length > 0 ? "conflict" : "verified",
      reversedPrices.length > 0
        ? `${reversedPrices.length} source items have a second price below the first. Original prices are retained; their units or range interpretation require review. Item IDs: ${reversedPrices.map((d) => d.id).join(", ")}.`
        : "Retained source prices are nonnegative, and every populated second price is at least the first.",
      citationIds,
    );
    menus.push({
      id: source.id,
      sourceRecordId: source.id,
      name: source.name,
      venueId,
      date: normalizedDate(source, dateValue, precision, citationIds, status === "not-reviewed"),
      location,
      pageIds,
      sourceCitationId,
      review,
      priceReview,
    });
  }
  return validateCatalogSources(
    parseCatalog({
      schemaVersion: 2,
      citations,
      venues: [...venues.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
      menus,
      pages,
    }),
    archive,
  );
}
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archive = parseArchive(
    JSON.parse(await readFile(new URL("../public/menus.json", import.meta.url), "utf8")),
  );
  const scans: unknown = JSON.parse(
    await readFile(new URL("../public/scans.json", import.meta.url), "utf8"),
  );
  const catalog = buildCatalog(archive, scans);
  await writeFile(
    new URL("../public/catalog.json", import.meta.url),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
  console.log(
    `Catalog: ${catalog.venues.length} venues, ${catalog.menus.length} menus, ${catalog.pages.length} pages, ${catalog.pages.filter((p) => p.image !== null).length} image matches`,
  );
}
