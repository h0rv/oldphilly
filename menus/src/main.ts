import L from "leaflet";
import { parseArchive } from "./model.ts";
import type { Menu, MenuArchive } from "./model.ts";
import { filterMenus, priceLabel } from "./filters.ts";
import type { Filters } from "./filters.ts";
import { basePath } from "./base-path.ts";

function element(id: string): HTMLElement {
  const result = document.getElementById(id);
  if (result === null) throw new Error(`Missing element: ${id}`);
  return result;
}
function input(id: string): HTMLInputElement {
  const value = element(id);
  if (!(value instanceof HTMLInputElement)) throw new Error(`Expected input: ${id}`);
  return value;
}
function select(id: string): HTMLSelectElement {
  const value = element(id);
  if (!(value instanceof HTMLSelectElement)) throw new Error(`Expected select: ${id}`);
  return value;
}
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.textContent = text;
  result.className = className;
  return result;
}
function link(text: string, url: string): HTMLAnchorElement {
  const result = node("a", text);
  result.href = url;
  return result;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const result = node("button", text);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}
function metadata(target: HTMLDListElement, label: string, value: string): void {
  target.append(node("dt", label), node("dd", value));
}
function addOptions(id: string, values: readonly string[]): void {
  for (const value of values) {
    const option = node("option", value);
    option.value = value;
    select(id).append(option);
  }
}
function readYear(id: string): number | null {
  const field = input(id);
  return field.value === "" || !field.validity.valid ? null : field.valueAsNumber;
}
function filters(): Filters {
  return {
    search: input("search").value,
    decade: select("decade").value,
    area: select("area").value,
    cuisine: select("cuisine").value,
    collection: select("collection").value,
    from: readYear("from"),
    to: readYear("to"),
    includeUndated: input("undated").checked,
  };
}

const filterPanel = element("filter-panel");
if (!(filterPanel instanceof HTMLDetailsElement)) throw new Error("Missing filter disclosure");
filterPanel.open = matchMedia("(min-width: 901px)").matches;

function initialize(archive: MenuArchive): void {
  const map = L.map("map", {
    scrollWheelZoom: false,
    crs: L.CRS.EPSG3857,
    zoomAnimation: false,
    fadeAnimation: false,
    minZoom: 11,
    maxZoom: 19,
    attributionControl: true,
  }).setView([39.95, -75.158], 13);
  map.attributionControl.setPrefix(link("Leaflet", "https://leafletjs.com").outerHTML);
  const pins = L.layerGroup().addTo(map);
  let shown = [...archive.menus];
  let selected: Menu | null = null;
  let tileErrors = 0;
  let loadedTiles = 0;
  const decades = [
    ...new Set(
      archive.menus.flatMap((menu) =>
        menu.date.year === null ? [] : [Math.floor(menu.date.year / 10) * 10],
      ),
    ),
  ].toSorted((a, b) => a - b);
  for (const decade of decades) {
    const option = node("option", `${String(decade)}s`);
    option.value = String(decade);
    select("decade").append(option);
  }
  addOptions(
    "area",
    [
      ...new Set(
        archive.menus.flatMap((menu) => (menu.location === null ? [] : [menu.location.area])),
      ),
    ].toSorted(),
  );
  addOptions(
    "cuisine",
    [...new Set(archive.menus.flatMap((menu) => [...menu.cuisines]))].toSorted(),
  );
  addOptions("collection", [...new Set(archive.menus.map((menu) => menu.provider))].toSorted());
  const located = archive.menus.flatMap((menu) =>
    menu.location === null ? [] : [L.latLng(menu.location.lat, menu.location.lng)],
  );
  if (located.length > 0)
    map.fitBounds(L.latLngBounds(located), { padding: [35, 35], maxZoom: 14, animate: false });

  function mapStatus(): void {
    const messages: string[] = [];
    if (tileErrors > 0)
      messages.push(
        loadedTiles === 0
          ? "Street tiles unavailable. Menu pins remain selectable."
          : "Some street tiles are unavailable.",
      );
    if (!shown.some((menu) => menu.location !== null))
      messages.push("No verified locations among these menus.");
    element("map-status").textContent = messages.join(" ");
  }
  // Browser-managed caching and referrers are required by the tile provider.
  // Do not add prefetching, offline downloads, a proxy, or automated tile rendering.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  })
    .on("loading", () => {
      tileErrors = 0;
      loadedTiles = 0;
    })
    .on("tileload", () => {
      loadedTiles += 1;
    })
    .on("tileerror", () => {
      tileErrors += 1;
    })
    .on("load", mapStatus)
    .addTo(map);

  function renderPins(): void {
    pins.clearLayers();
    mapStatus();
    const groups = new Map<string, Menu[]>();
    for (const menu of shown) {
      if (menu.location === null) continue;
      const key = `${String(menu.location.lat)},${String(menu.location.lng)}`;
      const group = groups.get(key) ?? [];
      group.push(menu);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const menu =
        group.find((item) => item.pages.some((page) => page.transcript !== "")) ?? group[0];
      if (menu === undefined || menu.location === null) continue;
      const active = group.some((item) => item.id === selected?.id);
      const label = `${menu.location.address} · ${String(group.length)} menu${group.length === 1 ? "" : "s"}`;
      const icon = L.divIcon({
        html: node("span", group.length > 1 ? String(group.length) : "•"),
        className: `menu-pin${active ? " selected" : ""}`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const marker = L.marker([menu.location.lat, menu.location.lng], {
        icon,
        keyboard: true,
      }).addTo(pins);
      marker.getElement()?.setAttribute("aria-label", label);
      marker.getElement()?.setAttribute("aria-pressed", String(active));
      marker.getElement()?.setAttribute("data-menu-ids", group.map((item) => item.id).join(" "));
      marker.getElement()?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          showMenu(menu, true);
        }
      });
      marker.on("click", () => {
        showMenu(menu, true);
      });
    }
  }

  function showMenu(menu: Menu, focus: boolean): void {
    selected = menu;
    select("menu-picker").value = "";
    const content = element("menu-content");
    const title = node("h2", menu.name);
    title.tabIndex = -1;
    const byline = node("div", "", "menu-byline");
    byline.append(
      node("span", menu.date.label),
      node("span", menu.provider),
      link(
        menu.scanNote === null ? "Original scan" : "Catalog scans",
        menu.pages[0]?.url ?? menu.url,
      ),
    );
    content.replaceChildren(title, byline);
    if (menu.scanNote !== null) content.append(node("p", menu.scanNote, "source-caution"));
    const transcriptPages = menu.pages.filter((page) => page.transcript !== "");
    if (transcriptPages.length > 0) {
      const transcript = node("p", transcriptPages[0]?.transcript ?? "", "transcript");
      if (transcriptPages.length > 1) {
        const tabs = node("div", "", "page-tabs");
        for (const page of transcriptPages)
          tabs.append(
            button(page.label, () => {
              transcript.textContent = page.transcript;
            }),
          );
        content.append(tabs);
      }
      content.append(transcript);
    } else if (menu.dishes.length > 0) {
      const table = node("table", "", "dishes");
      const header = node("thead");
      const headings = node("tr");
      headings.append(node("th", "Transcribed item"), node("th", "Original price"));
      header.append(headings);
      table.append(header);
      const body = node("tbody");
      for (const dish of menu.dishes) {
        const row = node("tr");
        const name = node("td", dish.name);
        const page = menu.pages.find((item) => item.id === dish.pageId);
        if (page !== undefined) {
          const source = link("source", page.url);
          source.className = "page-link";
          name.append(source);
        }
        row.append(name, node("td", priceLabel(dish.price, dish.priceHigh, menu.currency)));
        body.append(row);
      }
      table.append(body);
      content.append(table);
    } else content.append(node("p", "Read this menu at the holding library.", "empty"));
    const details = node("details", "", "source-details");
    details.append(node("summary", "Source & details"));
    details.append(link("Library record", menu.url));
    const metadataList = node("dl");
    metadata(metadataList, "Collection", menu.collection);
    metadata(metadataList, "Record", menu.recordId);
    metadata(metadataList, "Date", `${menu.date.basis} · precision: ${menu.date.precision}`);
    metadata(metadataList, "Original catalog date", menu.date.catalogValue || "Unrecorded");
    metadata(
      metadataList,
      "Location",
      menu.location === null
        ? menu.locationNote
        : `${menu.location.address}. ${menu.location.basis}`,
    );
    if (menu.location !== null) details.append(link("Location evidence", menu.location.evidence));
    metadata(metadataList, "Cuisine", menu.cuisineBasis);
    metadata(metadataList, "Rights", menu.rights);
    const snapshot = archive.snapshots.find((item) => item.id === menu.snapshotId);
    if (snapshot !== undefined) {
      metadata(metadataList, "Snapshot", `${snapshot.id} · ${snapshot.retrievedAt}`);
      metadata(metadataList, "SHA-256", snapshot.sha256);
      metadata(metadataList, "Provenance", snapshot.description);
    }
    details.append(metadataList);
    for (const note of menu.notes) details.append(node("p", note));
    if (menu.pages.length > 1) {
      const pages = node("p");
      for (const page of menu.pages) {
        pages.append(link(page.label, page.url), document.createTextNode(" "));
      }
      details.append(pages);
    }
    const catalog = node("details");
    catalog.append(node("summary", "Catalog fields"));
    const fields = node("dl");
    for (const [key, value] of Object.entries(menu.catalog))
      metadata(fields, key, typeof value === "string" ? value : JSON.stringify(value));
    catalog.append(fields);
    details.append(catalog);
    content.append(details);
    history.replaceState(null, "", `#menu=${encodeURIComponent(menu.id)}`);
    renderPins();
    if (focus) {
      title.focus({ preventScroll: true });
      if (matchMedia("(max-width: 680px)").matches)
        element("menu-panel").scrollIntoView({ block: "start" });
    }
  }

  function render(): void {
    const state = filters();
    shown = filterMenus(archive.menus, state);
    const picker = select("menu-picker");
    const prompt = node("option", "Choose another menu");
    prompt.value = "";
    picker.replaceChildren(prompt);
    picker.disabled = shown.length === 0;
    element("result-status").textContent =
      `${String(shown.length)} menus match. Unlocated menus remain available here.`;
    for (const menu of shown) {
      const option = node("option", `${menu.name} · ${menu.date.label}`);
      option.value = menu.id;
      option.dataset["menu"] = menu.id;
      picker.append(option);
    }
    const next =
      shown.find((menu) => menu.id === selected?.id) ??
      shown.find(
        (menu) =>
          menu.location !== null &&
          (menu.dishes.length > 0 || menu.pages.some((page) => page.transcript !== "")),
      ) ??
      shown.find(
        (menu) => menu.dishes.length > 0 || menu.pages.some((page) => page.transcript !== ""),
      ) ??
      shown[0];
    if (next !== undefined) showMenu(next, false);
    else {
      selected = null;
      const empty = node("div", "", "empty");
      empty.append(
        node(
          "p",
          state.from !== null && state.to !== null && state.from > state.to
            ? "Start year comes after end year."
            : "No menus match these filters.",
        ),
        button("Reset filters", reset),
      );
      element("menu-content").replaceChildren(empty);
      renderPins();
    }
  }
  function reset(): void {
    input("search").value = "";
    for (const id of ["decade", "area", "cuisine", "collection"]) select(id).value = "all";
    input("from").value = "";
    input("to").value = "";
    input("undated").checked = true;
    render();
  }
  element("filters").addEventListener("submit", (event) => {
    event.preventDefault();
  });
  element("filters").addEventListener("input", render);
  element("filters").addEventListener("reset", (event) => {
    event.preventDefault();
    reset();
  });
  pickerListener();
  function pickerListener(): void {
    select("menu-picker").addEventListener("change", () => {
      const menu = shown.find((item) => item.id === select("menu-picker").value);
      if (menu !== undefined) showMenu(menu, true);
    });
  }
  const requested = new URLSearchParams(location.hash.slice(1)).get("menu");
  selected = archive.menus.find((menu) => menu.id === requested) ?? null;
  render();
}

async function start(): Promise<void> {
  const assetBase = basePath(document.body.dataset["assetBase"]);
  const response = await fetch(`${assetBase}menus.json`);
  if (!response.ok) throw new Error(`Menu data unavailable (HTTP ${String(response.status)})`);
  const value: unknown = await response.json();
  initialize(parseArchive(value));
}
start().catch((error: unknown) => {
  element("menu-content").replaceChildren(
    node("p", error instanceof Error ? error.message : "Menu data unavailable", "empty"),
  );
  element("menu-content").setAttribute("role", "alert");
  select("menu-picker").replaceChildren(node("option", "Menus unavailable"));
});
