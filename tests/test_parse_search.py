from pathlib import Path

from oldphilly.parse_search import parse_search, parse_search_json

FIXTURE = Path(__file__).parent / "fixtures" / "search_sample.html"


def test_parse_search_finds_detail_records_and_next_page() -> None:
    parsed = parse_search(
        FIXTURE.read_text(encoding="utf-8"),
        "https://www.phillyhistory.org/PhotoArchive/Search.aspx",
    )

    assert [result.source_record_id for result in parsed.results] == ["45557", "45558"]
    assert parsed.results[0].title == "Broad Street north from Arch Street"
    assert parsed.results[0].circa_year == 1912
    assert parsed.results[0].thumbnail_url.endswith("/PhotoArchive/media/thumb/45557.jpg")
    assert parsed.results[1].year_start == 1910
    assert parsed.results[1].year_end == 1915
    assert parsed.next_page_url == (
        "https://www.phillyhistory.org/PhotoArchive/Search.aspx?start=20&limit=20"
    )


def test_parse_live_search_api_shape_extracts_assets_and_paging() -> None:
    parsed = parse_search_json(
        (Path(__file__).parent / "fixtures" / "search_api_sample.json").read_text(encoding="utf-8"),
        "https://www.phillyhistory.org/PhotoArchive/Search.aspx?type=area&limit=24",
        limit=24,
    )

    assert [result.source_record_id for result in parsed.results] == ["6958", "45557"]
    assert parsed.results[1].thumbnail_url.endswith("MediaStream.ashx?mediaId=21341")
    assert parsed.results[1].circa_year == 1912
    assert parsed.next_page_url is not None
    assert "start=24" in parsed.next_page_url
