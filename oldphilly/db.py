from __future__ import annotations

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, select

from .config import Settings
from .models import CrawlQueue, ImageAsset, SourceRecord, utc_now

_ASSET_KIND_PRIORITY = {"unknown": 0, "thumbnail": 1, "preview": 2, "full_candidate": 3}


def build_engine(settings: Settings):
    settings.create_data_dirs()
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

    return engine


def init_db(settings: Settings):
    engine = build_engine(settings)
    SQLModel.metadata.create_all(engine)
    return engine


def upsert_source_record(session: Session, incoming: SourceRecord) -> tuple[SourceRecord, bool]:
    existing = session.exec(
        select(SourceRecord).where(
            SourceRecord.source == incoming.source,
            SourceRecord.source_record_id == incoming.source_record_id,
        )
    ).first()
    now = utc_now()
    if existing is None:
        incoming.first_seen_at = now
        incoming.last_seen_at = now
        session.add(incoming)
        session.flush()
        return incoming, True
    preserved = {"id", "first_seen_at"}
    for field, value in incoming.model_dump(exclude=preserved).items():
        setattr(existing, field, value)
    existing.last_seen_at = now
    session.add(existing)
    session.flush()
    return existing, False


def upsert_asset(session: Session, incoming: ImageAsset) -> tuple[ImageAsset, bool]:
    existing = session.exec(
        select(ImageAsset).where(
            ImageAsset.source == incoming.source,
            ImageAsset.source_record_id == incoming.source_record_id,
            ImageAsset.asset_url == incoming.asset_url,
        )
    ).first()
    now = utc_now()
    if existing is None:
        incoming.first_seen_at = now
        incoming.last_seen_at = now
        session.add(incoming)
        session.flush()
        return incoming, True
    preserved = {"id", "first_seen_at"}
    existing_kind = existing.asset_kind
    for field, value in incoming.model_dump(exclude=preserved).items():
        setattr(existing, field, value)
    if _ASSET_KIND_PRIORITY[existing_kind] > _ASSET_KIND_PRIORITY[incoming.asset_kind]:
        existing.asset_kind = existing_kind
    existing.last_seen_at = now
    session.add(existing)
    session.flush()
    return existing, False


def enqueue_url(
    session: Session,
    url: str,
    url_type: str,
    source_record_id: str | None = None,
    priority: int = 100,
    max_attempts: int = 3,
) -> tuple[CrawlQueue, bool]:
    existing = session.exec(select(CrawlQueue).where(CrawlQueue.url == url)).first()
    if existing is not None:
        return existing, False
    queue = CrawlQueue(
        url=url,
        url_type=url_type,
        source_record_id=source_record_id,
        priority=priority,
        max_attempts=max_attempts,
    )
    session.add(queue)
    session.flush()
    return queue, True
