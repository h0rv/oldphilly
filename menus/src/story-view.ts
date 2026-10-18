import { basePath } from "./base-path.ts";

for (const figure of document.querySelectorAll("[data-source-image]")) {
  const image = figure.querySelector("img");
  const message = figure.querySelector(".image-unavailable");
  if (!(image instanceof HTMLImageElement) || !(message instanceof HTMLElement))
    throw new Error("Source image markup is incomplete");
  const unavailable = (): void => {
    image.hidden = true;
    message.hidden = false;
  };
  image.addEventListener("error", unavailable);
  if (image.complete && image.naturalWidth === 0) unavailable();
}

// Preserve menu links from earlier previews after adding the chronological home.
const requested = new URLSearchParams(location.hash.slice(1)).get("menu");
if (requested !== null)
  location.replace(
    `${basePath(document.body.dataset["assetBase"])}map/#menu=${encodeURIComponent(requested)}`,
  );
