function child<T extends Element>(
  root: Element,
  selector: string,
  type: { new (...args: never[]): T },
): T {
  const value = root.querySelector(selector);
  if (!(value instanceof type)) throw new Error(`Missing scan control: ${selector}`);
  return value;
}
for (const root of document.querySelectorAll("[data-scan-viewer]")) {
  const image = child(root, "[data-scan-image]", HTMLImageElement);
  const open = child(root, "[data-scan-open]", HTMLButtonElement);
  const error = child(root, "[data-scan-error]", HTMLParagraphElement);
  const selector = child(root, "[data-scan-page]", HTMLSelectElement);
  const record = child(root, "[data-scan-record]", HTMLAnchorElement);
  const dialog = child(root, "dialog", HTMLDialogElement);
  const full = child(root, "[data-scan-full]", HTMLImageElement);
  const fullError = child(root, "[data-full-error]", HTMLParagraphElement);
  const remember = root.getAttribute("data-remember-page") === "true";
  let scale = 1;
  image.addEventListener("error", () => {
    open.hidden = true;
    error.hidden = false;
  });
  image.addEventListener("load", () => {
    open.hidden = false;
    error.hidden = true;
  });
  full.addEventListener("error", () => {
    full.hidden = true;
    fullError.hidden = false;
  });
  full.addEventListener("load", () => {
    full.hidden = false;
    fullError.hidden = true;
  });
  if (image.complete && image.naturalWidth === 0) {
    open.hidden = true;
    error.hidden = false;
  }
  function show(updateUrl = true): void {
    const option = selector.selectedOptions[0];
    if (
      option === undefined ||
      option.dataset["preview"] === undefined ||
      option.dataset["full"] === undefined ||
      option.dataset["record"] === undefined
    )
      throw new Error("Scan page is incomplete");
    open.hidden = false;
    error.hidden = true;
    image.src = option.dataset["preview"];
    image.alt = `${root.getAttribute("data-menu-name") ?? "Menu"}, ${option.text}`;
    image.width = Number(option.dataset["width"]);
    image.height = Number(option.dataset["height"]);
    record.href = option.dataset["record"];
    for (const a of root.querySelectorAll("[data-scan-error] a, [data-full-error] a"))
      if (a instanceof HTMLAnchorElement) a.href = option.dataset["record"];
    for (const previous of root.querySelectorAll("[data-previous]"))
      if (previous instanceof HTMLButtonElement) previous.disabled = selector.selectedIndex === 0;
    for (const next of root.querySelectorAll("[data-next]"))
      if (next instanceof HTMLButtonElement)
        next.disabled = selector.selectedIndex === selector.options.length - 1;
    child(root, "[data-current-page]", HTMLSpanElement).textContent = option.text;
    scale = 1;
    full.style.width = "100%";
    full.alt = image.alt;
    if (dialog.open) {
      full.hidden = false;
      fullError.hidden = true;
      full.src = option.dataset["full"];
    }
    if (remember && updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("page", option.value);
      history.replaceState(null, "", url);
    }
  }
  selector.addEventListener("change", () => {
    show();
  });
  for (const previous of root.querySelectorAll("[data-previous]"))
    previous.addEventListener("click", () => {
      selector.selectedIndex -= 1;
      show();
    });
  for (const next of root.querySelectorAll("[data-next]"))
    next.addEventListener("click", () => {
      selector.selectedIndex += 1;
      show();
    });
  open.addEventListener("click", () => {
    const url = selector.selectedOptions[0]?.dataset["full"];
    if (url === undefined) throw new Error("Full scan URL is missing");
    scale = 1;
    full.style.width = "100%";
    full.hidden = false;
    fullError.hidden = true;
    full.src = url;
    full.alt = image.alt;
    dialog.showModal();
  });
  child(root, "[data-scan-close]", HTMLButtonElement).addEventListener("click", () => {
    dialog.close();
  });
  child(root, "[data-zoom-in]", HTMLButtonElement).addEventListener("click", () => {
    scale = Math.min(scale * 1.5, 5);
    full.style.width = `${String(scale * 100)}%`;
  });
  child(root, "[data-zoom-out]", HTMLButtonElement).addEventListener("click", () => {
    scale = Math.max(scale / 1.5, 1);
    full.style.width = `${String(scale * 100)}%`;
  });
  const requested = new URL(location.href).searchParams.get("page");
  if (
    remember &&
    requested !== null &&
    Array.from(selector.options).some((option) => option.value === requested)
  ) {
    selector.value = requested;
    show(false);
  }
}
