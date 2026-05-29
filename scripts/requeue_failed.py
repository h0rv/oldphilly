from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlmodel import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from oldphilly.crawlers.phillyhistory.config import Settings  # noqa: E402
from oldphilly.crawlers.phillyhistory.maintenance import (  # noqa: E402
    requeue_failed_details,
    requeue_stale_fetching_details,
)
from oldphilly.db import init_db  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Requeue failed detail crawl rows.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument(
        "--error-contains",
        help="Only requeue failed detail rows whose last_error contains this substring.",
    )
    parser.add_argument(
        "--stale-fetching-minutes",
        type=int,
        help="Also requeue detail rows stuck in fetching older than this many minutes.",
    )
    args = parser.parse_args()

    engine = init_db(Settings(data_dir=args.data_dir))
    with Session(engine) as session:
        count = requeue_failed_details(session, args.error_contains)
        stale_count = (
            requeue_stale_fetching_details(session, args.stale_fetching_minutes)
            if args.stale_fetching_minutes is not None
            else 0
        )
        session.commit()
    print(f"Requeued {count} failed detail rows.")
    if args.stale_fetching_minutes is not None:
        print(f"Requeued {stale_count} stale fetching detail rows.")


if __name__ == "__main__":
    main()
