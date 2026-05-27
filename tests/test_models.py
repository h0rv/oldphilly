import json
from pathlib import Path
from urllib.parse import parse_qs

import httpx
from sqlalchemy import inspect
from sqlmodel import Session, select

from oldphilly.config import DEFAULT_SEARCH_URL, DETAIL_DATA_URL, SEARCH_DATA_URL, Settings
from oldphilly.crawler import Crawler
from oldphilly.db import init_db, upsert_source_record
from oldphilly.http import PoliteHttpClient
from oldphilly.models import CrawlQueue, ImageAsset, SourceRecord

FIXTURES = Path(__file__).parent / "fixtures"
DETAIL_URL = "https://www.phillyhistory.org/PhotoArchive/detail.aspx?ImageId=45557"


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path / "data",
        request_delay_seconds=0,
        request_jitter_seconds=0,
        backoff_base_seconds=0,
    )


def test_tables_and_indexes_are_created(tmp_path: Path) -> None:
    engine = init_db(_settings(tmp_path))
    inspector = inspect(engine)

    assert {"source_records", "image_assets", "crawl_queue", "crawl_pages", "crawl_runs"} <= set(
        inspector.get_table_names()
    )
    assert "idx_source_records_year" in {
        index["name"] for index in inspector.get_indexes("source_records")
    }
    assert "idx_crawl_queue_status" in {
        index["name"] for index in inspector.get_indexes("crawl_queue")
    }


def test_source_record_upsert_preserves_unique_row_and_first_seen(tmp_path: Path) -> None:
    engine = init_db(_settings(tmp_path))
    initial = SourceRecord(source_record_id="1", canonical_url=DETAIL_URL, detail_url=DETAIL_URL)
    changed = SourceRecord(
        source_record_id="1", canonical_url=DETAIL_URL, detail_url=DETAIL_URL, title="Updated"
    )
    with Session(engine) as session:
        first, inserted = upsert_source_record(session, initial)
        session.commit()
        first_seen = first.first_seen_at
        second, inserted_again = upsert_source_record(session, changed)
        session.commit()
        rows = session.exec(select(SourceRecord)).all()

    assert inserted is True
    assert inserted_again is False
    assert len(rows) == 1
    assert second.title == "Updated"
    assert second.first_seen_at == first_seen


def test_sample_crawl_is_idempotent_and_does_not_fetch_assets(tmp_path: Path) -> None:
    search_html = "<html><script src='AllSearch-min.js'></script></html>"
    detail_html = "<html><script src='AllDetail-min.js'></script></html>"
    search_json = (
        '{"success":true,"totalImages":1,"images":'
        '[{"name":"Bache School","date":"1912","url":"MediaStream.ashx?mediaId=21341",'
        '"assetId":45557}]}'
    )
    detail_json = (FIXTURES / "detail_api_sample.json").read_text(encoding="utf-8")
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if str(request.url) == SEARCH_DATA_URL:
            return httpx.Response(200, text=search_json, request=request)
        if str(request.url) == DETAIL_DATA_URL:
            return httpx.Response(200, text=detail_json, request=request)
        if "Search.aspx" in str(request.url):
            return httpx.Response(200, text=search_html, request=request)
        return httpx.Response(200, text=detail_html, request=request)

    settings = _settings(tmp_path)
    transport_client = httpx.Client(transport=httpx.MockTransport(handler))
    polite = PoliteHttpClient(settings, client=transport_client)
    with Crawler(settings, polite) as crawler:
        first = crawler.sample(max_search_pages=1, max_details=1, seed_url=DEFAULT_SEARCH_URL)
        second = crawler.one_detail("45557")
        engine = crawler.engine

    with Session(engine) as session:
        assert len(session.exec(select(SourceRecord)).all()) == 1
        assets = session.exec(select(ImageAsset)).all()
        assert len(assets) == 1
        assert assets[0].asset_kind == "preview"
        assert len(session.exec(select(CrawlQueue)).all()) == 2
        record = session.exec(select(SourceRecord)).one()
        assert record.thumbnail_url is not None
        assert record.thumbnail_url == record.preview_url
        assert record.search_result_url == DEFAULT_SEARCH_URL
    assert first.records_inserted == 1
    assert second.records_updated == 1
    assert all("MediaStream.ashx" not in url for url in requested)


def test_one_search_page_can_supply_25_bounded_detail_records(tmp_path: Path) -> None:
    search_html = "<html><script src='AllSearch-min.js'></script></html>"
    detail_html = "<html><script src='AllDetail-min.js'></script></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        params = parse_qs(request.content.decode()) if request.content else {}
        if str(request.url) == SEARCH_DATA_URL:
            first_id = 1 if params["request"] == ["Images"] else 25
            images = [
                {"assetId": value, "name": f"Record {value}", "date": "1912"}
                for value in range(first_id, first_id + 24)
            ]
            return httpx.Response(
                200,
                text=json.dumps({"success": True, "totalImages": 24, "images": images}),
                request=request,
            )
        if str(request.url) == DETAIL_DATA_URL:
            image_id = int(params["assetId"][0])
            return httpx.Response(
                200,
                text=json.dumps(
                    {
                        "assets": [
                            {
                                "assetId": image_id,
                                "date": "Date*1912",
                                "title": f"Record {image_id}",
                                "medialist": [],
                            }
                        ]
                    }
                ),
                request=request,
            )
        if "Search.aspx" in str(request.url):
            return httpx.Response(200, text=search_html, request=request)
        return httpx.Response(200, text=detail_html, request=request)

    settings = _settings(tmp_path)
    polite = PoliteHttpClient(settings, client=httpx.Client(transport=httpx.MockTransport(handler)))
    with Crawler(settings, polite) as crawler:
        summary = crawler.sample(max_search_pages=1, max_details=25)
        continued = crawler.sample(max_search_pages=1, max_details=25)
        rerun = crawler.sample(max_search_pages=1, max_details=25)
        with Session(crawler.engine) as session:
            records = session.exec(select(SourceRecord)).all()

    assert summary.records_discovered == 48
    assert summary.records_inserted == 25
    assert continued.records_inserted == 23
    assert rerun.records_inserted == 0
    assert len(records) == 48
    assert len({record.source_record_id for record in records}) == 48
