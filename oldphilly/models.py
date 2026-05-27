from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, Column, Index, UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class SourceRecord(SQLModel, table=True):
    __tablename__ = "source_records"
    __table_args__ = (
        UniqueConstraint("source", "source_record_id", name="uq_source_records_source_id"),
        Index("idx_source_records_source_record_id", "source", "source_record_id"),
        Index("idx_source_records_year", "circa_year", "year_start", "year_end"),
        Index("idx_source_records_location", "latitude", "longitude"),
    )

    id: int | None = Field(default=None, primary_key=True)
    source: str = "phillyhistory"
    source_record_id: str
    canonical_url: str
    detail_url: str
    search_result_url: str | None = None
    media_type: str | None = None
    title: str | None = None
    description: str | None = None
    notes: str | None = None
    photographer: str | None = None
    creator: str | None = None
    collection: str | None = None
    record_group: str | None = None
    negative_number: str | None = None
    archive_id: str | None = None
    date_display: str | None = None
    circa_year: int | None = None
    year_start: int | None = None
    year_end: int | None = None
    address_text: str | None = None
    location_text: str | None = None
    neighborhood: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    state_plane_x: float | None = None
    state_plane_y: float | None = None
    has_digitized_media: bool | None = None
    thumbnail_url: str | None = None
    preview_url: str | None = None
    image_url: str | None = None
    rights_text: str | None = None
    citation_text: str | None = None
    raw_metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    raw_html_sha256: str | None = None
    first_seen_at: datetime = Field(default_factory=utc_now)
    last_seen_at: datetime = Field(default_factory=utc_now)
    last_fetched_at: datetime | None = None


class ImageAsset(SQLModel, table=True):
    __tablename__ = "image_assets"
    __table_args__ = (
        UniqueConstraint("source", "source_record_id", "asset_url", name="uq_image_assets_url"),
        CheckConstraint(
            "asset_kind IN ('thumbnail', 'preview', 'full_candidate', 'unknown')",
            name="ck_image_assets_kind",
        ),
        CheckConstraint(
            "reuse_status IN ('unknown', 'likely_public_preview', 'requires_permission', 'avoid')",
            name="ck_image_assets_reuse_status",
        ),
        Index("idx_image_assets_record", "source", "source_record_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    source: str = "phillyhistory"
    source_record_id: str
    asset_url: str
    asset_kind: str
    discovered_from_url: str | None = None
    http_status: int | None = None
    content_type: str | None = None
    content_length: int | None = None
    sha256: str | None = None
    width: int | None = None
    height: int | None = None
    appears_watermarked: bool | None = None
    reuse_status: str = "unknown"
    local_path: str | None = None
    r2_key: str | None = None
    first_seen_at: datetime = Field(default_factory=utc_now)
    last_seen_at: datetime = Field(default_factory=utc_now)


class CrawlQueue(SQLModel, table=True):
    __tablename__ = "crawl_queue"
    __table_args__ = (
        UniqueConstraint("url", name="uq_crawl_queue_url"),
        CheckConstraint(
            "url_type IN ('search', 'detail', 'image_probe')", name="ck_crawl_queue_url_type"
        ),
        CheckConstraint(
            "status IN ('pending', 'fetching', 'fetched', 'parsed', 'skipped', 'retry', 'failed')",
            name="ck_crawl_queue_status",
        ),
        Index("idx_crawl_queue_status", "status", "priority", "next_attempt_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    url: str
    url_type: str
    source_record_id: str | None = None
    status: str = "pending"
    priority: int = 100
    attempts: int = 0
    max_attempts: int = 3
    next_attempt_at: datetime | None = None
    last_attempt_at: datetime | None = None
    last_http_status: int | None = None
    last_error: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CrawlPage(SQLModel, table=True):
    __tablename__ = "crawl_pages"
    __table_args__ = (
        CheckConstraint(
            "url_type IN ('search', 'detail', 'image_probe')", name="ck_crawl_pages_url_type"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    url: str
    url_type: str
    http_status: int | None = None
    content_type: str | None = None
    content_length: int | None = None
    sha256: str | None = None
    fetched_at: datetime = Field(default_factory=utc_now)
    raw_html_path: str | None = None


class CrawlRun(SQLModel, table=True):
    __tablename__ = "crawl_runs"

    id: int | None = Field(default=None, primary_key=True)
    started_at: datetime = Field(default_factory=utc_now)
    finished_at: datetime | None = None
    mode: str
    seed: str | None = None
    records_discovered: int = 0
    records_inserted: int = 0
    records_updated: int = 0
    pages_fetched: int = 0
    errors: int = 0
    stopped_reason: str | None = None
