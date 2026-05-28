from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlmodel import Session, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from oldphilly.config import DEFAULT_SEARCH_URL, Settings  # noqa: E402
from oldphilly.crawler import Crawler  # noqa: E402
from oldphilly.db import init_db  # noqa: E402
from oldphilly.models import SourceRecord  # noqa: E402

SQLITE_SIDE_SUFFIXES = ("", "-shm", "-wal")


def _positive(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("limit must be greater than zero")
    return parsed


def _non_negative_float(value: str) -> float:
    parsed = float(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("value must be zero or greater")
    return parsed


def _confirm(message: str, assume_yes: bool) -> None:
    if assume_yes:
        return
    if not sys.stdin.isatty():
        raise SystemExit(f"{message}\nRefusing to continue without an interactive confirmation.")
    answer = input(f"{message}\nType 'yes' to continue: ")
    if answer != "yes":
        raise SystemExit("Cancelled.")


def _remove_sqlite_database(db_path: Path) -> None:
    for suffix in SQLITE_SIDE_SUFFIXES:
        db_path.with_name(f"{db_path.name}{suffix}").unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl public PhillyHistory metadata pages.")
    parser.add_argument(
        "--mode",
        required=True,
        choices=[
            "init",
            "one-detail",
            "one-search",
            "sample",
            "search",
            "details",
            "details-all",
            "full",
        ],
    )
    parser.add_argument("--image-id")
    parser.add_argument("--max-search-pages", type=_positive)
    parser.add_argument("--max-details", type=_positive)
    parser.add_argument(
        "--seed-url",
        help="Documented PhillyHistory Search.aspx URL for a bounded one-search or sample run.",
    )
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--save-html", action="store_true")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip interactive confirmations for explicit maintenance actions.",
    )
    parser.add_argument(
        "--reinit",
        action="store_true",
        help="With --mode init, delete the existing SQLite database before creating tables.",
    )
    parser.add_argument(
        "--request-delay",
        type=_non_negative_float,
        help="Seconds to wait between HTTP requests before jitter is added.",
    )
    parser.add_argument(
        "--request-jitter",
        type=_non_negative_float,
        help="Maximum random seconds added to each request delay.",
    )
    parser.add_argument(
        "--backoff-base",
        type=_non_negative_float,
        help="Base seconds for exponential retry backoff after transient failures.",
    )
    parser.add_argument(
        "--concurrency",
        type=_positive,
        help="Maximum concurrent detail pages to fetch. Search pagination stays sequential.",
    )
    args = parser.parse_args()
    settings = Settings(
        data_dir=args.data_dir,
        save_html=args.save_html,
        request_delay_seconds=(
            args.request_delay if args.request_delay is not None else Settings.request_delay_seconds
        ),
        request_jitter_seconds=(
            args.request_jitter
            if args.request_jitter is not None
            else Settings.request_jitter_seconds
        ),
        backoff_base_seconds=(
            args.backoff_base if args.backoff_base is not None else Settings.backoff_base_seconds
        ),
        concurrency=args.concurrency if args.concurrency is not None else Settings.concurrency,
    )

    if args.mode == "init":
        if args.reinit:
            _confirm(
                f"This will delete and recreate the SQLite database at {settings.db_path}.",
                args.yes,
            )
            _remove_sqlite_database(settings.db_path)
        elif settings.db_path.exists():
            _confirm(
                f"SQLite database already exists at {settings.db_path}. "
                "Init will preserve existing rows and only create missing tables.",
                args.yes,
            )
        init_db(settings)
        print(f"Initialized SQLite metadata index: {settings.db_path}")
        return
    if args.reinit:
        parser.error("--reinit is only valid with --mode init")
    if args.mode == "one-detail" and not args.image_id:
        parser.error("--mode one-detail requires --image-id")
    if args.mode == "sample" and (args.max_search_pages is None or args.max_details is None):
        parser.error("--mode sample requires --max-search-pages and --max-details")
    if args.mode == "details" and args.max_details is None:
        parser.error("--mode details requires --max-details")
    if args.seed_url and args.mode not in {"one-search", "sample", "search", "full"}:
        parser.error("--seed-url is only valid with --mode one-search, sample, search, or full")
    seed_url = args.seed_url or DEFAULT_SEARCH_URL

    with Crawler(settings) as crawler:
        if args.mode == "one-detail":
            summary = crawler.one_detail(args.image_id)
            with Session(crawler.engine) as session:
                record = session.exec(
                    select(SourceRecord).where(SourceRecord.source_record_id == args.image_id)
                ).first()
        elif args.mode == "one-search":
            summary = crawler.one_search(seed_url)
        elif args.mode == "sample":
            summary = crawler.sample(args.max_search_pages, args.max_details, seed_url)
        elif args.mode == "search":
            summary = crawler.search(seed_url)
        elif args.mode == "details":
            summary = crawler.details(args.max_details)
        elif args.mode == "details-all":
            summary = crawler.details_all()
        else:
            summary = crawler.full(seed_url)
    output = summary.as_dict()
    if args.mode == "one-detail" and record is not None:
        output["record"] = record.model_dump(mode="json")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
