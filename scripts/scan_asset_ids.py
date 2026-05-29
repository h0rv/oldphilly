from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from sqlmodel import Session, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from oldphilly.crawlers.phillyhistory.config import (  # noqa: E402
    DETAIL_DATA_URL,
    DETAIL_URL_TEMPLATE,
    Settings,
)
from oldphilly.db import enqueue_url, init_db  # noqa: E402
from oldphilly.models import CrawlQueue  # noqa: E402


@dataclass(frozen=True)
class ProbeResult:
    asset_id: int
    exists: bool
    error: str | None = None


def _positive(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return parsed


def _probe_asset_id(asset_id: int, timeout: float) -> ProbeResult:
    data = urllib.parse.urlencode({"assetId": str(asset_id)}).encode()
    request = urllib.request.Request(
        DETAIL_DATA_URL,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "oldphilly-metadata-crawler/0.1 public-asset-id-scan",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = response.read().decode("utf-8", errors="replace")
        payload = json.loads(text)
    except Exception as exc:
        return ProbeResult(asset_id=asset_id, exists=False, error=type(exc).__name__)
    return ProbeResult(asset_id=asset_id, exists=bool(payload.get("assets")))


def _existing_detail_ids(session: Session, start: int, end: int) -> set[int]:
    rows = session.exec(
        select(CrawlQueue.source_record_id).where(
            CrawlQueue.url_type == "detail",
            CrawlQueue.source_record_id.is_not(None),  # type: ignore[union-attr]
        )
    ).all()
    existing: set[int] = set()
    for row in rows:
        if row is None:
            continue
        try:
            asset_id = int(row)
        except ValueError:
            continue
        if start <= asset_id <= end:
            existing.add(asset_id)
    return existing


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Probe public PhillyHistory asset IDs and enqueue missing detail rows."
    )
    parser.add_argument("--from-id", type=_positive, default=1)
    parser.add_argument("--to-id", type=_positive, default=165000)
    parser.add_argument("--concurrency", type=_positive, default=16)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    args = parser.parse_args()
    if args.to_id < args.from_id:
        parser.error("--to-id must be greater than or equal to --from-id")

    engine = init_db(Settings(data_dir=args.data_dir))
    with Session(engine) as session:
        existing = _existing_detail_ids(session, args.from_id, args.to_id)
    candidates = [
        asset_id for asset_id in range(args.from_id, args.to_id + 1) if asset_id not in existing
    ]

    probed = 0
    found = 0
    errors = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {
            executor.submit(_probe_asset_id, asset_id, args.timeout): asset_id
            for asset_id in candidates
        }
        with Session(engine) as session:
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                probed += 1
                if result.error:
                    errors += 1
                if result.exists:
                    detail_url = DETAIL_URL_TEMPLATE.format(image_id=result.asset_id)
                    _, created = enqueue_url(
                        session,
                        detail_url,
                        "detail",
                        source_record_id=str(result.asset_id),
                    )
                    if created:
                        found += 1
                if probed % 1000 == 0:
                    session.commit()
                    print(
                        f"probed={probed} found={found} errors={errors} "
                        f"remaining={len(candidates) - probed}",
                        flush=True,
                    )
            session.commit()

    print(
        json.dumps(
            {
                "range": [args.from_id, args.to_id],
                "already_queued": len(existing),
                "probed": probed,
                "queued": found,
                "non_json_or_errors": errors,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
