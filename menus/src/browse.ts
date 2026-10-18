const search = document.getElementById("restaurant-search");
if (search instanceof HTMLInputElement) {
  const url = new URL(location.href);
  search.value = url.searchParams.get("q") ?? "";
  const update = (): void => {
    const query = search.value.trim().toLowerCase();
    let count = 0;
    for (const card of document.querySelectorAll("[data-restaurant]")) {
      if (!(card instanceof HTMLElement)) continue;
      card.hidden = !(card.dataset["search"] ?? "").includes(query);
      if (!card.hasAttribute("hidden")) count += 1;
    }
    const other = document.querySelector(".other-menus");
    if (other instanceof HTMLElement)
      other.hidden = !Array.from(other.querySelectorAll("[data-restaurant]")).some(
        (card) => card instanceof HTMLElement && !card.hasAttribute("hidden"),
      );
    const status = document.getElementById("browse-count");
    if (status !== null) status.textContent = `${String(count)} results`;
    const empty = document.getElementById("browse-empty");
    if (empty instanceof HTMLElement) empty.hidden = count !== 0;
    url.searchParams.delete("q");
    if (query !== "") url.searchParams.set("q", search.value.trim());
    history.replaceState(null, "", url);
    for (const a of document.querySelectorAll("[data-context-link]")) {
      if (!(a instanceof HTMLAnchorElement)) continue;
      const target = new URL(a.href);
      target.searchParams.delete("q");
      if (query !== "") target.searchParams.set("q", search.value.trim());
      a.href = target.href;
    }
  };
  search.addEventListener("input", update);
  update();
  const target = location.hash === "" ? null : document.getElementById(location.hash.slice(1));
  target?.scrollIntoView({ block: "center" });
}
const query = new URL(location.href).searchParams.get("q");
if (query !== null)
  for (const a of document.querySelectorAll("[data-context-link]")) {
    if (a instanceof HTMLAnchorElement) {
      const target = new URL(a.href);
      target.searchParams.set("q", query);
      a.href = target.href;
    }
  }
