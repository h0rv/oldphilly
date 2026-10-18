import L from "leaflet";
import { parseArchive } from "./model.ts";
import type { MenuArchive } from "./model.ts";
import { filterMenus, priceLabel } from "./filters.ts";
import type { Filters } from "./filters.ts";
import { parseCatalog } from "./catalog-model.ts";
import type { Catalog } from "./catalog-model.ts";
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

function initialize(archive: MenuArchive, catalog: Catalog): void {
  const assetBase = basePath(document.body.dataset["assetBase"]);
  const menus = archive.menus.map((menu) => {
    const normalized = catalog.menus.find((item) => item.id === menu.id);
    const venue = catalog.venues.find((item) => item.id === normalized?.venueId);
    const location = normalized?.location;
    return {
      ...menu,
      name: venue?.name ?? menu.name,
      date: normalized?.date ?? menu.date,
      location:
        location?.precision === "exact"
          ? {
              lat: location.lat,
              lng: location.lng,
              area: location.area,
              address: location.address ?? menu.name,
              basis: location.basis,
              evidence:
                catalog.citations.find(
                  (citation) => citation.id === location.evidenceCitationIds[0],
                )?.url ?? menu.url,
            }
          : null,
    };
  });
  type MapMenu = (typeof menus)[number];
  const searchText = new Map(
    archive.menus.map((menu) => [
      menu.id,
      `${menu.name} ${catalog.menus.find((item) => item.id === menu.id)?.location.address ?? ""}`,
    ]),
  );
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
  let shown = [...menus];
  let selected: MapMenu | null = null;
  let tileErrors = 0;
  let loadedTiles = 0;
  const decades = [
    ...new Set(
      menus.flatMap((menu) =>
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
      ...new Set(menus.flatMap((menu) => (menu.location === null ? [] : [menu.location.area]))),
    ].toSorted(),
  );
  addOptions("cuisine", [...new Set(menus.flatMap((menu) => [...menu.cuisines]))].toSorted());
  addOptions("collection", [...new Set(menus.map((menu) => menu.provider))].toSorted());
  const located = menus.flatMap((menu) =>
    menu.location === null ? [] : [L.latLng(menu.location.lat, menu.location.lng)],
  );
  if (located.length > 0)
    map.fitBounds(L.latLngBounds(located), { padding: [35, 35], maxZoom: 14, animate: false });

  function mapStatus(): void {
    const messages: string[] = [];
    if (tileErrors > 0)
      messages.push(
        loadedTiles === 0 ? "Street map unavailable." : "Some map tiles are unavailable.",
      );
    if (!shown.some((menu) => menu.location !== null))
      messages.push("No mapped menus in these results.");
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
    const groups = new Map<string, MapMenu[]>();
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

  function showMenu(menu: MapMenu, focus: boolean): void {
    selected = menu;
    select("menu-picker").value = "";
    const content = element("menu-content");
    const title = node("h2", menu.name);
    title.tabIndex = -1;
    const byline = node("div", "", "menu-byline");
    byline.append(
      node("span", menu.date.label),
      link("Open menu", `${assetBase}menu/${menu.id}/`),
      link(`${menu.provider} record`, menu.url),
    );
    content.replaceChildren(title, byline);
    const previewPage = catalog.pages.find(
      (item) => item.menuId === menu.id && item.image !== null,
    );
    if (previewPage?.image !== null && previewPage?.image !== undefined) {
      const preview = link("", `${assetBase}menu/${menu.id}/`);
      preview.className = "map-scan";
      preview.setAttribute("aria-label", `Open ${menu.name} scan`);
      const image = node("img");
      image.src = previewPage.image.previewUrl;
      image.alt = `${menu.name} scan`;
      image.width = previewPage.image.width;
      image.height = previewPage.image.height;
      const failed = node("p", "Image unavailable.", "map-image-error");
      failed.hidden = true;
      image.addEventListener("error", () => {
        preview.hidden = true;
        failed.hidden = false;
      });
      preview.append(image);
      content.append(preview, failed);
    }
    const transcription = node("details", "", "dish-details");
    transcription.append(node("summary", "Transcribed dishes and prices"));
    const dateReview = catalog.menus.find((item) => item.id === menu.id)?.date.review;
    if (
      dateReview?.status === "conflict" ||
      (dateReview?.status === "unresolved" && menu.date.precision !== "unknown")
    )
      content.append(node("p", dateReview.reason, "source-caution"));
    if (menu.scanNote !== null) content.append(node("p", menu.scanNote, "source-caution"));
    if (catalog.menus.find((item) => item.id === menu.id)?.priceReview.status === "conflict")
      transcription.append(
        node(
          "p",
          "Some source price ranges conflict. Original values are retained.",
          "source-caution",
        ),
      );
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
        transcription.append(tabs);
      }
      transcription.append(transcript);
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
      transcription.append(table);
    }
    if (menu.dishes.length > 0 || transcriptPages.length > 0) content.append(transcription);
    const details = node("details", "", "source-details");
    details.append(
      node("summary", "Source"),
      link(`${menu.provider} record ${menu.recordId}`, menu.url),
    );
    const fields = node("dl");
    const normalized = catalog.menus.find((item) => item.id === menu.id);
    metadata(fields, "Address", normalized?.location.address ?? "Unrecorded");
    metadata(
      fields,
      "Location",
      normalized?.location.precision === "exact"
        ? normalized.location.basis
        : (normalized?.location.review.reason ?? menu.locationNote),
    );
    metadata(fields, "Rights", menu.rights);
    details.append(
      fields,
      link("Catalog and review evidence", `${assetBase}catalog.json`),
      document.createTextNode(" · "),
      link("Original source fields", `${assetBase}menus.json`),
    );
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
    shown = filterMenus(menus, state, searchText);
    const picker = select("menu-picker");
    const prompt = node("option", "Choose another menu");
    prompt.value = "";
    picker.replaceChildren(prompt);
    picker.disabled = shown.length === 0;
    element("result-status").textContent = `${String(shown.length)} menus`;
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
          catalog.pages.some((page) => page.menuId === menu.id && page.image !== null),
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
            ? "Start year is after end year."
            : "No menus match.",
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
  selected = menus.find((menu) => menu.id === requested) ?? null;
  render();
}

async function start(): Promise<void> {
  const assetBase = basePath(document.body.dataset["assetBase"]);
  const responses = await Promise.all([
    fetch(`${assetBase}menus.json`),
    fetch(`${assetBase}catalog.json`),
  ]);
  const [response, catalogResponse] = responses;
  if (!response.ok || !catalogResponse.ok) throw new Error("Menu data unavailable");
  const value: unknown = await response.json();
  const catalogValue: unknown = await catalogResponse.json();
  initialize(parseArchive(value), parseCatalog(catalogValue));
}
start().catch((error: unknown) => {
  element("menu-content").replaceChildren(
    node("p", error instanceof Error ? error.message : "Menu data unavailable", "empty"),
  );
  element("menu-content").setAttribute("role", "alert");
  select("menu-picker").replaceChildren(node("option", "Menus unavailable"));
});
