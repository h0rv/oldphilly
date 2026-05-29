from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, select

from ...models import CrawlQueue, utc_now


def requeue_failed_details(session: Session, error_contains: str | None = None) -> int:
    query = select(CrawlQueue).where(
        CrawlQueue.url_type == "detail",
        CrawlQueue.status == "failed",
    )
    if error_contains:
        query = query.where(CrawlQueue.last_error.contains(error_contains))  # type: ignore[union-attr]
    rows = session.exec(query).all()
    now = utc_now()
    for row in rows:
        row.status = "pending"
        row.attempts = 0
        row.next_attempt_at = None
        row.last_error = None
        row.updated_at = now
        session.add(row)
    return len(rows)


def requeue_stale_fetching_details(session: Session, older_than_minutes: int = 30) -> int:
    cutoff = utc_now() - timedelta(minutes=older_than_minutes)
    rows = session.exec(
        select(CrawlQueue).where(
            CrawlQueue.url_type == "detail",
            CrawlQueue.status == "fetching",
            CrawlQueue.updated_at < cutoff,
        )
    ).all()
    now = utc_now()
    for row in rows:
        row.status = "pending"
        row.next_attempt_at = None
        row.last_error = None
        row.updated_at = now
        session.add(row)
    return len(rows)
