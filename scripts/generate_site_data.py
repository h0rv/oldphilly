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
import math
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
MERGE_RADIUS_M = 80       # photos within this many meters of a cluster merge
                          # into it (distance-based, grid-orientation-agnostic).
                          # Larger = fewer, coarser dots; smaller = denser.
PHILLY_LAT = 39.95        # reference latitude for the meters↔degrees conversion
M_PER_DEG_LAT = 111_320.0


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


class Cluster:
    __slots__ = ("ids", "years", "lat_sum", "lon_sum", "n")

    def __init__(self, rid: str, year: int, lat: float, lon: float):
        self.ids = [rid]
        self.years = [year]
        self.lat_sum = lat
        self.lon_sum = lon
        self.n = 1

    @property
    def lat(self) -> float:
        return self.lat_sum / self.n

    @property
    def lon(self) -> float:
        return self.lon_sum / self.n

    def add(self, rid: str, year: int, lat: float, lon: float) -> None:
        self.ids.append(rid)
        self.years.append(year)
        self.lat_sum += lat
        self.lon_sum += lon
        self.n += 1


def cluster_points(points: list[tuple[str, float, float, int]]) -> list[Cluster]:
    """Greedy distance-based clustering (DBSCAN-style leader algorithm).

    Each point joins the nearest existing cluster whose centroid is within
    MERGE_RADIUS_M, else seeds a new cluster. A spatial hash grid (cell size =
    radius) keeps neighbor lookup O(1), so this scales to all records in one
    pass. Distance is measured in meters via a local equirectangular
    approximation, so clusters grow along the real street direction regardless
    of grid orientation (rotated West Philly, diagonal South Philly, etc.).
    """
    cos_lat = math.cos(math.radians(PHILLY_LAT))
    m_per_deg_lon = M_PER_DEG_LAT * cos_lat
    cell_lat = MERGE_RADIUS_M / M_PER_DEG_LAT
    cell_lon = MERGE_RADIUS_M / m_per_deg_lon

    clusters: list[Cluster] = []
    grid: dict[tuple[int, int], list[int]] = {}

    def cell_of(lat: float, lon: float) -> tuple[int, int]:
        return (int(lat / cell_lat), int(lon / cell_lon))

    for rid, lat, lon, year in points:
        ci, cj = cell_of(lat, lon)
        best_idx = None
        best_d = MERGE_RADIUS_M
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for idx in grid.get((ci + di, cj + dj), ()):
                    c = clusters[idx]
                    dy = (lat - c.lat) * M_PER_DEG_LAT
                    dx = (lon - c.lon) * m_per_deg_lon
                    d = math.hypot(dx, dy)
                    if d < best_d:
                        best_d = d
                        best_idx = idx
        if best_idx is None:
            idx = len(clusters)
            clusters.append(Cluster(rid, year, lat, lon))
            grid.setdefault((ci, cj), []).append(idx)
        else:
            c = clusters[best_idx]
            old_cell = cell_of(c.lat, c.lon)
            c.add(rid, year, lat, lon)
            new_cell = cell_of(c.lat, c.lon)
            if new_cell != old_cell:  # centroid drifted; re-bucket
                grid[old_cell].remove(best_idx)
                grid.setdefault(new_cell, []).append(best_idx)

    return clusters


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-hf", metavar="PARQUET", help="path to source_records.parquet")
    args = parser.parse_args()

    CHUNKS_DIR.mkdir(parents=True, exist_ok=True)

    source = rows_from_parquet(args.from_hf) if args.from_hf else rows_from_sqlite()

    # Collect points and per-record detail, then merge nearby photos into
    # location clusters by distance (see cluster_points). Each marker sits at
    # its cluster's centroid, on the real street position.
    points: list[tuple[str, float, float, int]] = []
    chunks: dict[int, dict] = {}
    search_ids: list[str] = []
    search_text: list[str] = []
    count = 0

    for row in source:
        rid = row["source_record_id"]
        lat = float(row["latitude"])
        lon = float(row["longitude"])
        year = int(row["circa_year"]) if row["circa_year"] else 0

        points.append((rid, lat, lon, year))

        record = build_record(row)
        chunk_id = int(rid) // CHUNK_SIZE
        chunks.setdefault(chunk_id, {})[rid] = json.loads(record.model_dump_json(exclude_none=True))

        # Search index text: lowercased, whitespace-collapsed concatenation of
        # the human-meaningful fields. Loaded lazily client-side on first search.
        text_parts = [
            record.title, record.description, record.address,
            record.neighborhood, record.photographer, record.date,
        ]
        text = " ".join(p for p in text_parts if p)
        search_ids.append(rid)
        search_text.append(" ".join(text.lower().split()))

        count += 1

    clusters = cluster_points(points)
    markers = [
        [round(c.lat, 6), round(c.lon, 6), c.ids, c.years]
        for c in clusters
    ]

    print(f"Exporting {count:,} records → {len(markers):,} locations...")

    (OUT_DIR / "markers.json").write_text(json.dumps(markers, separators=(",", ":")))

    search_index = {"ids": search_ids, "t": search_text}
    (OUT_DIR / "search.json").write_text(json.dumps(search_index, separators=(",", ":")))

    for chunk_id, records in chunks.items():
        dest = CHUNKS_DIR / f"{chunk_id}.json"
        tmp = dest.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(records, separators=(",", ":")))
        os.replace(tmp, dest)

    print(f"Wrote {OUT_DIR / 'markers.json'} ({len(markers):,} locations)")
    print(f"Wrote {OUT_DIR / 'search.json'} ({len(search_ids):,} records)")
    print(f"Wrote {len(chunks):,} chunk files to {CHUNKS_DIR}/ ({CHUNK_SIZE} records/chunk)")


if __name__ == "__main__":
    main()
