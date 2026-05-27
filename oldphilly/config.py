from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

BASE_URL = "https://www.phillyhistory.org/PhotoArchive/"
SEARCH_URL = f"{BASE_URL}Search.aspx"
SEARCH_DATA_URL = f"{BASE_URL}Thumbnails.ashx"
DETAIL_DATA_URL = f"{BASE_URL}Details.ashx"
DETAIL_URL_TEMPLATE = f"{BASE_URL}detail.aspx?ImageId={{image_id}}"
DEFAULT_SEARCH_PARAMS = {
    "type": "area",
    "minx": "-8395000",
    "miny": "4835000",
    "maxx": "-8340000",
    "maxy": "4885000",
    "limit": "24",
}
DEFAULT_SEARCH_URL = f"{SEARCH_URL}?{urlencode(DEFAULT_SEARCH_PARAMS)}"
ALLOWED_HOSTS = frozenset({"www.phillyhistory.org", "phillyhistory.org"})

REQUEST_DELAY_SECONDS = 1.5
REQUEST_JITTER_SECONDS = 0.75
TIMEOUT_SECONDS = 30.0
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 5.0
CONCURRENCY = 1
USER_AGENT = "oldphilly-metadata-crawler/0.1; civic archival metadata index; contact: local-dev"


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path("data")
    request_delay_seconds: float = REQUEST_DELAY_SECONDS
    request_jitter_seconds: float = REQUEST_JITTER_SECONDS
    timeout_seconds: float = TIMEOUT_SECONDS
    max_retries: int = MAX_RETRIES
    backoff_base_seconds: float = BACKOFF_BASE_SECONDS
    user_agent: str = USER_AGENT
    save_html: bool = False

    @property
    def db_path(self) -> Path:
        return self.data_dir / "oldphilly.sqlite"

    @property
    def raw_html_dir(self) -> Path:
        return self.data_dir / "raw_html"

    @property
    def export_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path}"

    def create_data_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.raw_html_dir.mkdir(parents=True, exist_ok=True)
        self.export_dir.mkdir(parents=True, exist_ok=True)
