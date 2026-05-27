from __future__ import annotations

import json
from pathlib import Path

from sqlmodel import Session, select

from .config import Settings
from .db import init_db
from .models import SourceRecord

EXPORT_FIELDS = (
    "source",
    "source_record_id",
    "canonical_url",
    "detail_url",
    "title",
    "description",
    "date_display",
    "circa_year",
    "year_start",
    "year_end",
    "location_text",
    "address_text",
    "neighborhood",
    "latitude",
    "longitude",
    "thumbnail_url",
    "preview_url",
    "image_url",
    "rights_text",
    "citation_text",
    "raw_metadata_json",
)


def export_jsonl(settings: Settings, output_path: Path | None = None) -> tuple[Path, int]:
    engine = init_db(settings)
    path = output_path or settings.export_dir / "phillyhistory.jsonl"
    count = 0
    with Session(engine) as session, path.open("w", encoding="utf-8") as output:
        records = session.exec(select(SourceRecord).order_by(SourceRecord.source_record_id)).all()
        for record in records:
            payload = {field: getattr(record, field) for field in EXPORT_FIELDS}
            output.write(json.dumps(payload, ensure_ascii=True) + "\n")
            count += 1
    return path, count
