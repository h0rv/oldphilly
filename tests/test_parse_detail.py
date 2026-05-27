from pathlib import Path

from oldphilly.parse_detail import parse_detail, parse_detail_json
from oldphilly.parse_search import parse_date

FIXTURE = Path(__file__).parent / "fixtures" / "detail_sample.html"
URL = "https://www.phillyhistory.org/PhotoArchive/detail.aspx?ImageId=45557"


def test_date_parsing_is_conservative() -> None:
    assert parse_date("1912") == (1912, None, None)
    assert parse_date("circa 1912") == (1912, None, None)
    assert parse_date("1910-1915") == (None, 1910, 1915)
    assert parse_date("n.d.") == (None, None, None)
    assert parse_date("probably after 1912") == (None, None, None)
    assert parse_date("12/23/1912") == (1912, None, None)


def test_parse_detail_maps_fields_and_preserves_raw_metadata() -> None:
    record, assets = parse_detail(FIXTURE.read_text(encoding="utf-8"), URL)

    assert record.source_record_id == "45557"
    assert record.canonical_url == URL
    assert record.title == "Broad Street north from Arch Street"
    assert record.date_display == "circa 1912"
    assert record.circa_year == 1912
    assert record.latitude == 39.9541
    assert record.longitude == -75.1636
    assert record.has_digitized_media is True
    assert record.raw_metadata_json["metadata"]["unmapped accession note"] == "Box 7, Folder 12"
    assert {asset.asset_kind for asset in assets} == {
        "thumbnail",
        "preview",
        "full_candidate",
    }
    assert record.thumbnail_url.endswith("/media/thumb/45557.jpg")
    assert record.preview_url.endswith("/media/preview/45557.jpg")
    assert record.image_url.endswith("/media/public-image/45557.jpg")


def test_parse_live_detail_api_shape_stores_preview_only_and_raw_data() -> None:
    record, assets = parse_detail_json(
        (Path(__file__).parent / "fixtures" / "detail_api_sample.json").read_text(
            encoding="utf-8"
        ),
        URL,
    )

    assert record.title == "Alexander D. Bache School--Medical Inspection Branch"
    assert record.circa_year == 1912
    assert record.latitude == 39.9695897905185
    assert record.preview_url.endswith("MediaStream.ashx?mediaId=21341")
    assert record.image_url is None
    assert assets[0].asset_kind == "preview"
    assert record.raw_metadata_json["metadata_api"]["extraSourceField"] == "preserve this"


def test_parse_hires_media_stores_wms_candidate_and_tile_template_uris() -> None:
    record, assets = parse_detail_json(
        (Path(__file__).parent / "fixtures" / "detail_hires_api_sample.json").read_text(
            encoding="utf-8"
        ),
        "https://www.phillyhistory.org/PhotoArchive/detail.aspx?ImageId=99999",
    )

    assert record.preview_url.endswith("MediaStream.ashx?mediaId=12345")
    assert record.image_url is not None
    assert "HiRes.ashx?mediaID=12345" in record.image_url
    assert "BBOX=0,0,5900,5000&WIDTH=5900&HEIGHT=5000" in record.image_url
    hires = [asset.asset_url for asset in assets if asset.asset_kind == "full_candidate"]
    assert len(hires) == 2
    assert any("BBOX={bbox}&WIDTH=256&HEIGHT=256" in url for url in hires)
