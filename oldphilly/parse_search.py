from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup, Tag

from .api_models import SearchApiResponse, warn_extras
from .config import DETAIL_URL_TEMPLATE

_YEAR_RE = re.compile(r"\b(?:circa\s+|c\.?\s*)?(\d{4})(?:\s*[-/]\s*(\d{4}))?\b", re.I)
_TYPED_DATE_RE = re.compile(r"^\s*(?:circa\s+|c\.?\s*)?(\d{4})(?:\s*[-/]\s*(\d{4}))?\s*$", re.I)
_FULL_DATE_RE = re.compile(r"^\s*\d{1,2}/\d{1,2}/(\d{4})\s*$")


@dataclass
class SearchResult:
    source_record_id: str
    detail_url: str
    title: str | None = None
    date_display: str | None = None
    circa_year: int | None = None
    year_start: int | None = None
    year_end: int | None = None
    location_text: str | None = None
    thumbnail_url: str | None = None
    raw_metadata: dict[str, str] = field(default_factory=dict)


@dataclass
class SearchParseResult:
    results: list[SearchResult]
    next_page_url: str | None = None


def parse_date(value: str | None) -> tuple[int | None, int | None, int | None]:
    if not value:
        return None, None, None
    match = _TYPED_DATE_RE.match(value)
    if match is None and (full_date := _FULL_DATE_RE.match(value)):
        return int(full_date.group(1)), None, None
    if not match:
        return None, None, None
    first, second = match.groups()
    if second:
        return None, int(first), int(second)
    return int(first), None, None


def _image_id_from_url(url: str) -> str | None:
    query = parse_qs(urlparse(url).query)
    for key, values in query.items():
        if key.lower() == "imageid" and values and values[0]:
            return values[0]
    return None


def _result_container(link: Tag) -> Tag:
    for parent in link.parents:
        if not isinstance(parent, Tag) or parent.name in {"body", "html"}:
            break
        classes = " ".join(parent.get("class", [])).lower()
        if parent.name in {"article", "li", "tr"} or any(
            token in classes for token in ("result", "record", "search-item")
        ):
            return parent
    return link


def _metadata_from_container(container: Tag) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for row in container.select("tr"):
        parts = row.find_all(["th", "td"])
        if len(parts) >= 2:
            metadata[parts[0].get_text(" ", strip=True).rstrip(":")] = parts[1].get_text(
                " ", strip=True
            )
    for element in container.select("[data-label]"):
        key = str(element.get("data-label", "")).strip().rstrip(":")
        if key:
            metadata[key] = element.get_text(" ", strip=True)
    return metadata


def parse_search(html: str, base_url: str) -> SearchParseResult:
    soup = BeautifulSoup(html, "html.parser")
    results: list[SearchResult] = []
    seen: set[str] = set()
    for link in soup.find_all("a", href=True):
        detail_url = urljoin(base_url, str(link["href"]))
        image_id = _image_id_from_url(detail_url)
        if image_id is None or image_id in seen:
            continue
        seen.add(image_id)
        container = _result_container(link)
        metadata = _metadata_from_container(container)
        text = container.get_text(" ", strip=True)
        date_display = next(
            (value for key, value in metadata.items() if "date" in key.lower()),
            None,
        )
        if date_display is None and (match := _YEAR_RE.search(text)):
            date_display = match.group(0)
        location = next(
            (
                value
                for key, value in metadata.items()
                if any(word in key.lower() for word in ("location", "address"))
            ),
            None,
        )
        location_node = container.select_one(".location, .address")
        if location is None and location_node is not None:
            location = location_node.get_text(" ", strip=True)
        image = container.find("img", src=True)
        thumbnail_url = urljoin(base_url, str(image["src"])) if image else None
        circa_year, year_start, year_end = parse_date(date_display)
        title = link.get_text(" ", strip=True) or None
        results.append(
            SearchResult(
                source_record_id=image_id,
                detail_url=detail_url,
                title=title,
                date_display=date_display,
                circa_year=circa_year,
                year_start=year_start,
                year_end=year_end,
                location_text=location,
                thumbnail_url=thumbnail_url,
                raw_metadata=metadata,
            )
        )
    next_link = soup.find("a", rel=lambda rel: rel and "next" in rel)
    if next_link is None:
        next_link = next(
            (
                link
                for link in soup.find_all("a", href=True)
                if link.get_text(" ", strip=True).lower() in {"next", "next >", ">"}
            ),
            None,
        )
    next_url = urljoin(base_url, str(next_link["href"])) if next_link else None
    return SearchParseResult(results=results, next_page_url=next_url)


def parse_search_json(
    payload: str, search_url: str, start: int = 0, limit: int = 24
) -> SearchParseResult:
    body = SearchApiResponse.model_validate_json(payload)
    results: list[SearchResult] = []
    for raw in body.images:
        image_id = str(raw.asset_id)
        warn_extras(raw)
        date_display = raw.date
        circa_year, year_start, year_end = parse_date(date_display)
        thumbnail = raw.url
        results.append(
            SearchResult(
                source_record_id=image_id,
                detail_url=DETAIL_URL_TEMPLATE.format(image_id=image_id),
                title=raw.name,
                date_display=date_display,
                circa_year=circa_year,
                year_start=year_start,
                year_end=year_end,
                location_text=raw.address,
                thumbnail_url=urljoin(search_url, thumbnail) if thumbnail else None,
                raw_metadata=raw.model_dump(by_alias=True),
            )
        )
    next_page_url = None
    total = body.total_images or 0
    if start + limit < total:
        parsed_url = urlparse(search_url)
        query = parse_qs(parsed_url.query)
        query["start"] = [str(start + limit)]
        query["limit"] = [str(limit)]
        flat_query = [(key, value) for key, values in query.items() for value in values]
        next_page_url = urlunparse(parsed_url._replace(query=urlencode(flat_query)))
    return SearchParseResult(results=results, next_page_url=next_page_url)
