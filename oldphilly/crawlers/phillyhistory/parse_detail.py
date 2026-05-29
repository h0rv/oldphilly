from __future__ import annotations

import re
from datetime import UTC, datetime
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup

from ...models import ImageAsset, SourceRecord
from .api_models import DetailApiResponse, warn_extras
from .config import DETAIL_URL_TEMPLATE
from .parse_search import parse_date

_KEY_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")
_HIRES_WMS_COMMON = (
    "SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=&STYLES=&FORMAT=image/jpeg&SRS=EPSG:4326"
)
_HIRES_EXTENT = "0,0,5900,5000"


def _normalize_key(key: str) -> str:
    return _KEY_NORMALIZE_RE.sub(" ", key.lower()).strip()


def _first(metadata: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = metadata.get(key)
        if value:
            return value
    return None


def _to_float(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
    return float(match.group(0)) if match else None


def _to_bool(value: str | None) -> bool | None:
    if not value:
        return None
    lowered = value.strip().lower()
    if lowered in {"yes", "true", "available", "digitized"}:
        return True
    if lowered in {"no", "false", "unavailable", "not digitized"}:
        return False
    return None


def _read_metadata(soup: BeautifulSoup) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for term in soup.find_all("dt"):
        value = term.find_next_sibling("dd")
        if value is not None:
            metadata[_normalize_key(term.get_text(" ", strip=True))] = value.get_text(
                " ", strip=True
            )
    for row in soup.find_all("tr"):
        cells = row.find_all(["th", "td"])
        if len(cells) >= 2:
            metadata[_normalize_key(cells[0].get_text(" ", strip=True))] = cells[1].get_text(
                " ", strip=True
            )
    for field in soup.select("[data-label]"):
        label = _normalize_key(str(field.get("data-label", "")))
        if label:
            metadata[label] = field.get_text(" ", strip=True)
    return metadata


def _get_image_id(url: str, metadata: dict[str, str], soup: BeautifulSoup) -> str:
    for key, values in parse_qs(urlparse(url).query).items():
        if key.lower() == "imageid" and values and values[0]:
            return values[0]
    value = _first(metadata, "image id", "imageid", "image number")
    if value and (match := re.search(r"\d+", value)):
        return match.group(0)
    hidden = soup.find("input", attrs={"name": re.compile("imageid", re.I)})
    if hidden and hidden.get("value"):
        return str(hidden["value"])
    raise ValueError("detail page has no ImageId")


def _asset_kind(tag: str, url: str, classes: str) -> str:
    path_leaf = urlparse(url).path.rsplit("/", 1)[-1]
    value = f"{path_leaf} {classes}".lower()
    if "thumb" in value:
        return "thumbnail"
    if any(word in value for word in ("preview", "medium", "display")):
        return "preview"
    if tag == "a" and any(word in value for word in ("image", "photo", ".jpg", ".jpeg", ".png")):
        return "full_candidate"
    return "unknown"


def _assets(soup: BeautifulSoup, url: str, image_id: str) -> list[ImageAsset]:
    assets: list[ImageAsset] = []
    seen: set[str] = set()
    for tag in soup.find_all(["img", "a"]):
        raw_url = tag.get("src") if tag.name == "img" else tag.get("href")
        if not raw_url:
            continue
        asset_url = urljoin(url, str(raw_url))
        classes = " ".join(tag.get("class", []))
        kind = _asset_kind(tag.name, asset_url, classes)
        if kind == "unknown":
            continue
        if asset_url in seen:
            continue
        seen.add(asset_url)
        assets.append(
            ImageAsset(
                source_record_id=image_id,
                asset_url=asset_url,
                asset_kind=kind,
                discovered_from_url=url,
                reuse_status=(
                    "likely_public_preview" if kind in {"thumbnail", "preview"} else "unknown"
                ),
            )
        )
    return assets


def parse_detail(html: str, url: str) -> tuple[SourceRecord, list[ImageAsset]]:
    soup = BeautifulSoup(html, "html.parser")
    metadata = _read_metadata(soup)
    image_id = _get_image_id(url, metadata, soup)
    assets = _assets(soup, url, image_id)
    asset_by_kind = {asset.asset_kind: asset.asset_url for asset in assets}
    title_node = soup.find("h1")
    date_display = _first(metadata, "date", "date depicted", "circa")
    circa_year, year_start, year_end = parse_date(date_display)
    now = datetime.now(UTC)
    canonical_url = DETAIL_URL_TEMPLATE.format(image_id=image_id)
    record = SourceRecord(
        source_record_id=image_id,
        canonical_url=canonical_url,
        detail_url=url,
        media_type=_first(metadata, "media type", "format"),
        title=_first(metadata, "title")
        or (title_node.get_text(" ", strip=True) if title_node else None),
        description=_first(metadata, "description"),
        notes=_first(metadata, "notes", "note"),
        photographer=_first(metadata, "photographer"),
        creator=_first(metadata, "creator", "author"),
        collection=_first(metadata, "collection"),
        record_group=_first(metadata, "record group"),
        negative_number=_first(metadata, "negative number", "negative no"),
        archive_id=_first(metadata, "archive id", "archive identifier"),
        date_display=date_display,
        circa_year=circa_year,
        year_start=year_start,
        year_end=year_end,
        address_text=_first(metadata, "address"),
        location_text=_first(metadata, "location"),
        neighborhood=_first(metadata, "neighborhood"),
        latitude=_to_float(_first(metadata, "latitude", "lat")),
        longitude=_to_float(_first(metadata, "longitude", "lon", "long")),
        state_plane_x=_to_float(_first(metadata, "state plane x", "x coordinate")),
        state_plane_y=_to_float(_first(metadata, "state plane y", "y coordinate")),
        has_digitized_media=_to_bool(_first(metadata, "digitized media", "media available")),
        thumbnail_url=asset_by_kind.get("thumbnail"),
        preview_url=asset_by_kind.get("preview"),
        image_url=asset_by_kind.get("full_candidate"),
        rights_text=_first(metadata, "rights", "rights statement"),
        citation_text=_first(metadata, "citation"),
        raw_metadata_json={
            "metadata": metadata,
            "image_urls": [asset.asset_url for asset in assets],
        },
        first_seen_at=now,
        last_seen_at=now,
        last_fetched_at=now,
    )
    return record, assets


def _parse_point(point: str | None) -> tuple[float | None, float | None]:
    if not point:
        return None, None
    parts = point.split(",", 1)
    if len(parts) != 2:
        return None, None
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        return None, None


def parse_detail_json(payload: str, detail_url: str) -> tuple[SourceRecord, list[ImageAsset]]:
    body = DetailApiResponse.model_validate_json(payload)
    if not body.assets:
        raise ValueError("detail metadata response has no asset")
    raw = body.assets[0]
    warn_extras(raw)
    image_id = str(raw.asset_id)
    date_display = (raw.date or "").split("*", 1)[-1] or None
    circa_year, year_start, year_end = parse_date(date_display)
    state_plane_x, state_plane_y = _parse_point(raw.point)
    assets: list[ImageAsset] = []
    image_url: str | None = None
    for media in raw.medialist:
        if media.media_id is None:
            continue
        asset_url = urljoin(detail_url, f"MediaStream.ashx?mediaId={media.media_id}")
        assets.append(
            ImageAsset(
                source_record_id=image_id,
                asset_url=asset_url,
                asset_kind="preview",
                discovered_from_url=detail_url,
                reuse_status="likely_public_preview",
            )
        )
        if media.media_has_hires is True:
            hires_url = urljoin(detail_url, "HiRes.ashx")
            full_extent_url = (
                f"{hires_url}?mediaID={media.media_id}&{_HIRES_WMS_COMMON}&"
                f"BBOX={_HIRES_EXTENT}&WIDTH=5900&HEIGHT=5000"
            )
            tile_template_url = (
                f"{hires_url}?mediaID={media.media_id}&{_HIRES_WMS_COMMON}&"
                "BBOX={bbox}&WIDTH=256&HEIGHT=256"
            )
            for candidate in (full_extent_url, tile_template_url):
                assets.append(
                    ImageAsset(
                        source_record_id=image_id,
                        asset_url=candidate,
                        asset_kind="full_candidate",
                        discovered_from_url=detail_url,
                        reuse_status="unknown",
                    )
                )
            if image_url is None:
                image_url = full_extent_url
    preview_url = assets[0].asset_url if assets else None
    now = datetime.now(UTC)
    record = SourceRecord(
        source_record_id=image_id,
        canonical_url=DETAIL_URL_TEMPLATE.format(image_id=image_id),
        detail_url=detail_url,
        title=raw.title,
        description=raw.desc,
        notes=raw.notes,
        collection=raw.coll,
        archive_id=raw.coll_id,
        date_display=date_display,
        circa_year=circa_year,
        year_start=year_start,
        year_end=year_end,
        address_text=raw.address,
        location_text=raw.address,
        latitude=raw.lat,
        longitude=raw.lon,
        state_plane_x=state_plane_x,
        state_plane_y=state_plane_y,
        has_digitized_media=bool(assets),
        preview_url=preview_url,
        image_url=image_url,
        raw_metadata_json={"metadata_api": raw.model_dump(by_alias=True)},
        first_seen_at=now,
        last_seen_at=now,
        last_fetched_at=now,
    )
    return record, assets
