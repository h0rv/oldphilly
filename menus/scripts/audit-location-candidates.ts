import { readFile, writeFile } from "node:fs/promises";
import { parseArchive } from "../src/model.ts";
import type { Menu } from "../src/model.ts";

const archive = parseArchive(JSON.parse(await readFile("public/menus.json", "utf8")));
function cell(menu: Menu, key: string): string {
  const value = menu.catalog[key];
  return typeof value === "string" ? value : "";
}
const candidates = archive.menus.flatMap((menu) => {
  const address = cell(menu, menu.provider === "CIA" ? "addres" : "curated_address");
  if (address === "") return [];
  return [
    {
      menuId: menu.id,
      name: menu.name,
      date: menu.date,
      sourceAddress: address,
      sourceUrl: menu.url,
      reviewedVenue: cell(menu, "curated_venue"),
      printedEvidenceUrls: cell(menu, "image_evidence_urls")
        .split(" | ")
        .filter((url) => url !== ""),
      sourceAuditNote: cell(menu, "quality_notes"),
      decision: menu.location === null ? "unlocated" : "reviewed representative point",
      reason:
        menu.location?.basis ??
        (address.includes("outlet unresolved")
          ? "The exact chain outlet is unresolved; a city name does not support a pin."
          : "Historical address retained. A reviewed coordinate source for this exact venue/address is still needed; no current-name geocoding was performed."),
      location: menu.location,
    },
  ];
});
await writeFile(
  "snapshots/location-candidates.json",
  `${JSON.stringify(
    {
      reviewedAt: "2026-10-18",
      method:
        "Inventory existing CIA addres and NYPL curated_address fields. Candidate completeness is separate from coordinate verification and city coverage.",
      locatedRecords: archive.menus.filter((menu) => menu.location !== null).length,
      distinctPoints: new Set(
        archive.menus.flatMap((menu) =>
          menu.location === null
            ? []
            : [`${String(menu.location.lat)},${String(menu.location.lng)}`],
        ),
      ).size,
      candidates,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`${String(candidates.length)} existing-address records audited.\n`);
