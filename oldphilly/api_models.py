from __future__ import annotations

import logging

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class SearchImageItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    asset_id: int = Field(alias="assetId")
    id: int | None = None
    name: str | None = None
    address: str | None = None
    date: str | None = None
    url: str | None = None
    loc: str | None = None
    label: str | None = None
    city: str | None = None
    country: str | None = None


class SearchApiResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool | None = None
    total_images: int | None = Field(default=None, alias="totalImages")
    images: list[SearchImageItem] = []


class MediaItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    media_id: int = Field(alias="mediaId")
    media_is_for_sale: bool | None = Field(default=None, alias="mediaIsForSale")
    media_has_hires: bool | None = Field(default=None, alias="mediaHasHires")
    media_is_def: bool | None = Field(default=None, alias="mediaIsDef")
    media_thumb_id: int | None = Field(default=None, alias="mediaThumbId")
    media_thumb_seq: int | None = Field(default=None, alias="mediaThumbSeq")
    media_cap: str | None = Field(default=None, alias="mediaCap")
    media_people: str | None = Field(default=None, alias="mediaPeople")
    media_purchase_link: str | None = Field(default=None, alias="mediaPurchaseLink")


class DetailAsset(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    asset_id: int = Field(alias="assetId")
    date: str | None = None
    address: str | None = None
    point: str | None = None
    medialist: list[MediaItem] = []
    notes: str | None = None
    desc: str | None = None
    title: str | None = None
    coll: str | None = None
    coll_id: str | None = Field(default=None, alias="collId")
    lon: float | None = None
    lat: float | None = None
    tags: str | None = None
    series: str | None = None
    related_list: list | None = Field(default=None, alias="relatedList")
    tab: str | None = None
    city: str | None = None
    country: str | None = None
    addl_info: str | None = Field(default=None, alias="addlInfo")
    products: str | None = None
    people_sets: list | None = Field(default=None, alias="peopleSets")
    links: str | None = None
    use_street_view: bool | None = Field(default=None, alias="useStreetView")
    sv_x: float | None = Field(default=None, alias="svX")
    sv_y: float | None = Field(default=None, alias="svY")
    sv_pitch: float | None = Field(default=None, alias="svPitch")
    sv_yaw: float | None = Field(default=None, alias="svYaw")
    sv_zoom: int | None = Field(default=None, alias="svZoom")
    use_sv: bool | None = Field(default=None, alias="useSV")
    allow_comments: bool | None = Field(default=None, alias="allowComments")
    comment_list: list | None = Field(default=None, alias="commentList")


class DetailApiResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assets: list[DetailAsset] = []


def warn_extras(item: BaseModel) -> None:
    if item.model_extra:
        logger.warning("unexpected fields in %s: %s", type(item).__name__, list(item.model_extra))
