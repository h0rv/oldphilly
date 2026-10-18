import type { Catalog, CatalogMenu, CatalogVenue } from "./catalog-model.ts";

export function sortMenus(menus: readonly CatalogMenu[]): CatalogMenu[] {
  return menus.toSorted(
    (a, b) =>
      (a.date.year ?? 9999) - (b.date.year ?? 9999) ||
      (a.date.precision === "range" ? a.date.start : (a.date.value ?? "9999")).localeCompare(
        b.date.precision === "range" ? b.date.start : (b.date.value ?? "9999"),
      ),
  );
}
// A name is a browsing aid. Venue IDs and per-menu locations remain separate.
export function venueGroups(catalog: Catalog): readonly {
  readonly venue: CatalogVenue;
  readonly venueIds: readonly string[];
  readonly menus: readonly CatalogMenu[];
}[] {
  const groups = new Map<string, CatalogVenue[]>();
  for (const venue of catalog.venues.toSorted((a, b) => a.id.localeCompare(b.id))) {
    const key = venue.kind === "unknown" ? venue.id : `${venue.kind}:${venue.name}`;
    const group = groups.get(key) ?? [];
    group.push(venue);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((venues) => {
      const venue = venues[0];
      if (venue === undefined) throw new Error("Empty venue group");
      const venueIds = venues.map((item) => item.id);
      return {
        venue,
        venueIds,
        menus: sortMenus(catalog.menus.filter((menu) => venueIds.includes(menu.venueId))),
      };
    })
    .toSorted((a, b) => a.venue.name.localeCompare(b.venue.name));
}
export function dateSummary(menus: readonly CatalogMenu[]): string {
  const years = [
    ...new Set(menus.flatMap((menu) => (menu.date.year === null ? [] : [menu.date.year]))),
  ].toSorted((a, b) => a - b);
  const first = years[0],
    last = years.at(-1);
  const dated =
    first === undefined ? "" : first === last ? String(first) : `${String(first)}–${String(last)}`;
  return [dated, menus.some((menu) => menu.date.year === null) ? "Undated" : ""]
    .filter((text) => text !== "")
    .join(" · ");
}
