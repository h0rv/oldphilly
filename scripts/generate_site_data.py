#!/usr/bin/env python3
"""Generate static site data files.

Outputs:
  site/markers.json        - [[lat, lon, [ids], [years]], ...] grouped by location
  site/chunks/{n}.json     - per-chunk detail records, loaded on click

Sources (mutually exclusive):
  default                  - reads from data/oldphilly.sqlite
  --from-hf <path>         - reads from a downloaded source_records.parquet
"""

import argparse
import json
import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

from pydantic import BaseModel

DB_PATH = Path(__file__).parent.parent / "data" / "oldphilly.sqlite"
OUT_DIR = Path(__file__).parent.parent / "site"
CHUNKS_DIR = OUT_DIR / "chunks"

# --- Tuning knobs ---
CHUNK_SIZE = 500          # records per chunk JSON file
COORD_PRECISION = 3       # decimal places for lat/lon grouping
                          # 4 ≈ 11m (address-level), 3 ≈ 110m (block-level), 2 ≈ 1.1km


class SiteRecord(BaseModel):
    id: str
    title: str | None = None
    description: str | None = None
    date: str | None = None
    address: str | None = None
    neighborhood: str | None = None
    photographer: str | None = None
    collection: str | None = None
    record_group: str | None = None
    notes: str | None = None
    rights: str | None = None
    thumb: str
    preview: str
    url: str


def rows_from_sqlite() -> Iterator[dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT source_record_id, latitude, longitude, circa_year,
               title, description, date_display, address_text, neighborhood,
               photographer, creator, collection, record_group, notes, rights_text,
               thumbnail_url, preview_url, canonical_url
        FROM source_records
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND thumbnail_url IS NOT NULL AND thumbnail_url != ''
        ORDER BY source_record_id
    """)
    for row in cur:
        yield dict(row)
    conn.close()


def rows_from_parquet(path: str) -> Iterator[dict]:
    import polars as pl

    df = (
        pl.read_parquet(path)
        .filter(
            pl.col("latitude").is_not_null()
            & pl.col("longitude").is_not_null()
            & pl.col("thumbnail_url").is_not_null()
            & (pl.col("thumbnail_url") != "")
        )
        .sort("source_record_id")
        .select(
            [
                "source_record_id",
                "latitude",
                "longitude",
                "circa_year",
                "title",
                "description",
                "date_display",
                "address_text",
                "neighborhood",
                "photographer",
                "creator",
                "collection",
                "record_group",
                "notes",
                "rights_text",
                "thumbnail_url",
                "preview_url",
                "canonical_url",
            ]
        )
    )
    yield from df.iter_rows(named=True)


def build_record(row: dict) -> SiteRecord:
    return SiteRecord(
        id=row["source_record_id"],
        title=row["title"] or None,
        description=row["description"] or None,
        date=row["date_display"] or None,
        address=row["address_text"] or None,
        neighborhood=row["neighborhood"] or None,
        photographer=row["photographer"] or row["creator"] or None,
        collection=row["collection"] or None,
        record_group=row["record_group"] or None,
        notes=row["notes"] or None,
        rights=row["rights_text"] or None,
        thumb=row["thumbnail_url"],
        preview=row["preview_url"] or row["thumbnail_url"],
        url=row["canonical_url"],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-hf", metavar="PARQUET", help="path to source_records.parquet")
    args = parser.parse_args()

    CHUNKS_DIR.mkdir(parents=True, exist_ok=True)

    source = rows_from_parquet(args.from_hf) if args.from_hf else rows_from_sqlite()

    # (lat_r, lon_r) → ([ids...], [years...])
    # Round to 3 decimal places (~110m, block level) to merge same-block addresses.
    loc_map: dict[tuple[float, float], tuple[list, list]] = {}
    chunks: dict[int, dict] = {}
    count = 0

    for row in source:
        rid = row["source_record_id"]
        lat_r = round(float(row["latitude"]), COORD_PRECISION)
        lon_r = round(float(row["longitude"]), COORD_PRECISION)
        year = int(row["circa_year"]) if row["circa_year"] else 0

        key = (lat_r, lon_r)
        if key not in loc_map:
            loc_map[key] = ([], [])
        loc_map[key][0].append(rid)
        loc_map[key][1].append(year)

        record = build_record(row)
        chunk_id = int(rid) // CHUNK_SIZE
        chunks.setdefault(chunk_id, {})[rid] = json.loads(record.model_dump_json(exclude_none=True))
        count += 1

    markers = [[lat, lon, ids, years] for (lat, lon), (ids, years) in loc_map.items()]

    print(f"Exporting {count:,} records → {len(markers):,} locations...")

    (OUT_DIR / "markers.json").write_text(json.dumps(markers, separators=(",", ":")))

    for chunk_id, records in chunks.items():
        dest = CHUNKS_DIR / f"{chunk_id}.json"
        tmp = dest.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(records, separators=(",", ":")))
        os.replace(tmp, dest)

    print(f"Wrote {OUT_DIR / 'markers.json'} ({len(markers):,} locations)")
    print(f"Wrote {len(chunks):,} chunk files to {CHUNKS_DIR}/ ({CHUNK_SIZE} records/chunk)")


if __name__ == "__main__":
    main()
