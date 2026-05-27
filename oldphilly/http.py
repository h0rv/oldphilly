from __future__ import annotations

import hashlib
import random
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from .config import ALLOWED_HOSTS, Settings

TRANSIENT_STATUSES = frozenset({429, 500, 502, 503, 504})
STOP_STATUSES = frozenset({403, 429, 503})


@dataclass(frozen=True)
class FetchResult:
    url: str
    status_code: int
    content_type: str | None
    content_length: int | None
    sha256: str
    text: str


class CrawlStop(RuntimeError):
    pass


class FetchError(RuntimeError):
    pass


class PoliteHttpClient:
    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        self.settings = settings
        self.client = client or httpx.Client(
            timeout=settings.timeout_seconds,
            headers={"User-Agent": settings.user_agent},
            follow_redirects=True,
        )
        self._owns_client = client is None
        self._last_request_at: float | None = None
        self._bad_status_counts: dict[int, int] = {}

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def __enter__(self) -> PoliteHttpClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def _validate_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise ValueError(f"URL is not an allowed public PhillyHistory URL: {url}")

    def _delay(self) -> None:
        if self._last_request_at is None:
            return
        delay = self.settings.request_delay_seconds + random.uniform(
            0, self.settings.request_jitter_seconds
        )
        remaining = delay - (time.monotonic() - self._last_request_at)
        if remaining > 0:
            time.sleep(remaining)

    def _request(self, method: str, url: str, data: dict[str, str] | None = None) -> FetchResult:
        self._validate_url(url)
        last_error: Exception | None = None
        for attempt in range(self.settings.max_retries):
            self._delay()
            try:
                response = self.client.request(method, url, data=data)
                self._last_request_at = time.monotonic()
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                self._last_request_at = time.monotonic()
                last_error = exc
                if attempt + 1 < self.settings.max_retries:
                    time.sleep(self.settings.backoff_base_seconds * (2**attempt))
                    continue
                raise FetchError(f"{type(exc).__name__}: {exc}") from exc
            body = response.content
            text = response.text
            lowered = text[:10000].lower()
            if "captcha" in lowered or (
                "login" in lowered and ("password" in lowered or "sign in" in lowered)
            ):
                raise CrawlStop(f"blocked by challenge or login page at {url}")
            if response.status_code in STOP_STATUSES:
                count = self._bad_status_counts.get(response.status_code, 0) + 1
                self._bad_status_counts[response.status_code] = count
                if count >= 2:
                    raise CrawlStop(f"repeated HTTP {response.status_code} responses")
            if (
                response.status_code in TRANSIENT_STATUSES
                and attempt + 1 < self.settings.max_retries
            ):
                time.sleep(self.settings.backoff_base_seconds * (2**attempt))
                continue
            length_header = response.headers.get("content-length")
            length = int(length_header) if length_header and length_header.isdigit() else len(body)
            return FetchResult(
                url=str(response.url),
                status_code=response.status_code,
                content_type=response.headers.get("content-type"),
                content_length=length,
                sha256=hashlib.sha256(body).hexdigest(),
                text=text,
            )
        raise FetchError(f"request failed: {last_error}")

    def get(self, url: str) -> FetchResult:
        return self._request("GET", url)

    def post(self, url: str, data: dict[str, str]) -> FetchResult:
        return self._request("POST", url, data)
