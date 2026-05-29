from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import func
from sqlmodel import Session, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from oldphilly.crawlers.phillyhistory.config import Settings  # noqa: E402
from oldphilly.db import init_db  # noqa: E402
from oldphilly.models import CrawlPage, CrawlQueue, CrawlRun, ImageAsset, SourceRecord  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Show local crawl index status.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    args = parser.parse_args()
    engine = init_db(Settings(data_dir=args.data_dir))
    with Session(engine) as session:
        queues = session.exec(
            select(CrawlQueue.status, func.count(CrawlQueue.id)).group_by(CrawlQueue.status)
        ).all()
        last_run = session.exec(select(CrawlRun).order_by(CrawlRun.started_at.desc())).first()
        errors = session.exec(
            select(CrawlQueue)
            .where(CrawlQueue.last_error.is_not(None))  # type: ignore[union-attr]
            .order_by(CrawlQueue.updated_at.desc())
            .limit(5)
        ).all()
        payload = {
            "record_count": session.exec(select(func.count(SourceRecord.id))).one(),
            "image_asset_count": session.exec(select(func.count(ImageAsset.id))).one(),
            "queue_by_status": {status: count for status, count in queues},
            "page_count": session.exec(select(func.count(CrawlPage.id))).one(),
            "last_run": last_run.model_dump(mode="json") if last_run else None,
            "recent_errors": [
                {"url": entry.url, "status": entry.status, "error": entry.last_error}
                for entry in errors
            ],
        }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
