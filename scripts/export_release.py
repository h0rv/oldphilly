from __future__ import annotations

import argparse
import gzip
import json
import shutil
import sqlite3
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq

TABLES = ("source_records", "image_assets", "crawl_queue", "crawl_runs")


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _json_safe(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def export_table(con: sqlite3.Connection, table_name: str, output_path: Path) -> int:
    cursor = con.execute(f"select * from {_quote_identifier(table_name)}")
    columns = [column[0] for column in cursor.description]
    rows = cursor.fetchall()
    payload = {column: [] for column in columns}
    for row in rows:
        for column, value in zip(columns, row, strict=True):
            payload[column].append(_json_safe(value))
    pq.write_table(pa.Table.from_pydict(payload), output_path, compression="zstd")
    return len(rows)


def write_dataset_card(output_dir: Path, counts: dict[str, int]) -> None:
    card = f"""---
license: other
task_categories:
- tabular-classification
language:
- en
pretty_name: Old Philly public metadata crawl
tags:
- archives
- philadelphia
- civic-data
- metadata
- sqlite
- parquet
---

# Old Philly Public Metadata Crawl

This dataset is a public metadata crawl of PhillyHistory.org records exposed through the
public search/detail surfaces as of May 29, 2026.

It contains metadata and public URI references only. It does **not** include mirrored image
binaries, high-resolution licensed originals, or bypassed/restricted media.

## Files

- `source_records.parquet`: normalized public source records.
- `image_assets.parquet`: public preview/thumbnail URI metadata.
- `crawl_queue.parquet`: crawl queue terminal state for auditability.
- `crawl_runs.parquet`: crawl run history.
- `oldphilly.sqlite.gz`: compressed SQLite snapshot containing the same local crawl database.

## Counts

```json
{json.dumps(counts, indent=2)}
```

## Image And Licensing Notes

Public image references are PhillyHistory URLs such as `MediaStream.ashx?mediaId=...`.
These are typically preview-sized display images. PhillyHistory describes high-resolution
digital files as available through a separate licensing request workflow; those licensed
originals are not included here.

## Provenance

Source: https://www.phillyhistory.org/PhotoArchive/

Crawler repository: this dataset was produced by the `oldphilly` metadata crawler.
"""
    (output_dir / "README.md").write_text(card, encoding="utf-8")


def snapshot_sqlite(db_path: Path, output_dir: Path) -> Path:
    snapshot_path = output_dir / "oldphilly.sqlite"
    compressed_path = output_dir / "oldphilly.sqlite.gz"
    snapshot_path.unlink(missing_ok=True)
    compressed_path.unlink(missing_ok=True)
    with sqlite3.connect(db_path) as source:
        source.execute(f"vacuum main into {str(snapshot_path)!r}")
    with snapshot_path.open("rb") as raw, gzip.open(compressed_path, "wb", compresslevel=9) as gz:
        shutil.copyfileobj(raw, gz)
    snapshot_path.unlink()
    return compressed_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Hugging Face release artifacts.")
    parser.add_argument("--db-path", type=Path, default=Path("data/oldphilly.sqlite"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/releases"))
    parser.add_argument("--skip-sqlite", action="store_true")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    with sqlite3.connect(f"file:{args.db_path}?mode=ro", uri=True) as con:
        for table_name in TABLES:
            counts[table_name] = export_table(
                con,
                table_name,
                args.output_dir / f"{table_name}.parquet",
            )
    if not args.skip_sqlite:
        compressed = snapshot_sqlite(args.db_path, args.output_dir)
        counts["oldphilly.sqlite.gz_bytes"] = compressed.stat().st_size
    write_dataset_card(args.output_dir, counts)
    print(json.dumps({"output_dir": str(args.output_dir), "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
