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


def _positive(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("limit must be greater than zero")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl public PhillyHistory metadata pages.")
    parser.add_argument(
        "--mode", required=True, choices=["init", "one-detail", "one-search", "sample", "details"]
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
    args = parser.parse_args()
    settings = Settings(data_dir=args.data_dir, save_html=args.save_html)

    if args.mode == "init":
        init_db(settings)
        print(f"Initialized SQLite metadata index: {settings.db_path}")
        return
    if args.mode == "one-detail" and not args.image_id:
        parser.error("--mode one-detail requires --image-id")
    if args.mode == "sample" and (args.max_search_pages is None or args.max_details is None):
        parser.error("--mode sample requires --max-search-pages and --max-details")
    if args.mode == "details" and args.max_details is None:
        parser.error("--mode details requires --max-details")
    if args.seed_url and args.mode not in {"one-search", "sample"}:
        parser.error("--seed-url is only valid with --mode one-search or --mode sample")
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
        else:
            summary = crawler.details(args.max_details)
    output = summary.as_dict()
    if args.mode == "one-detail" and record is not None:
        output["record"] = record.model_dump(mode="json")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
