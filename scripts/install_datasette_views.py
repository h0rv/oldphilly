from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

DEFAULT_DATABASE_PATH = Path("data/oldphilly.sqlite")


def install_views(database_path: Path) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            drop view if exists v_philly_map_records;
            drop view if exists v_philly_map_records_with_media;

            create view v_philly_map_records as
            select
                id,
                source_record_id as asset_id,
                title,
                description,
                date_display,
                circa_year,
                year_start,
                year_end,
                collection,
                record_group,
                photographer,
                creator,
                address_text,
                location_text,
                neighborhood,
                latitude,
                longitude,
                has_digitized_media,
                thumbnail_url,
                preview_url,
                canonical_url,
                detail_url,
                rights_text,
                citation_text
            from source_records
            where latitude is not null
              and longitude is not null
              and not (latitude = 0 and longitude = 0);

            create view v_philly_map_records_with_media as
            select *
            from v_philly_map_records
            where coalesce(preview_url, thumbnail_url) is not null;
            """
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Install Datasette-friendly SQL views.")
    parser.add_argument(
        "--database",
        type=Path,
        default=DEFAULT_DATABASE_PATH,
        help=f"SQLite database path. Defaults to {DEFAULT_DATABASE_PATH}.",
    )
    args = parser.parse_args()

    install_views(args.database)
    print(f"Installed Datasette views in {args.database}")


if __name__ == "__main__":
    main()
