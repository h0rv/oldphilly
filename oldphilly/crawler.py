from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from datetime import timedelta
from urllib.parse import parse_qsl, urlencode, urlparse

from sqlmodel import Session, select

from .config import (
    DEFAULT_SEARCH_URL,
    DETAIL_DATA_URL,
    DETAIL_URL_TEMPLATE,
    SEARCH_DATA_URL,
    Settings,
)
from .db import enqueue_url, init_db, upsert_asset, upsert_source_record
from .http import CrawlStop, FetchError, FetchResult, PoliteHttpClient
from .models import CrawlPage, CrawlQueue, CrawlRun, ImageAsset, SourceRecord, utc_now
from .parse_detail import parse_detail, parse_detail_json
from .parse_search import SearchParseResult, parse_search, parse_search_json


@dataclass
class CrawlSummary:
    mode: str
    records_discovered: int = 0
    records_inserted: int = 0
    records_updated: int = 0
    pages_fetched: int = 0
    errors: int = 0
    stopped_reason: str | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


class Crawler:
    def __init__(
        self,
        settings: Settings,
        http_client: PoliteHttpClient | None = None,
    ) -> None:
        self.settings = settings
        self.engine = init_db(settings)
        self.http = http_client or PoliteHttpClient(settings)
        self._owns_http = http_client is None

    def close(self) -> None:
        if self._owns_http:
            self.http.close()

    def __enter__(self) -> Crawler:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def _start_run(self, mode: str, seed: str | None) -> int:
        with Session(self.engine) as session:
            run = CrawlRun(mode=mode, seed=seed)
            session.add(run)
            session.commit()
            session.refresh(run)
            if run.id is None:
                raise RuntimeError("CrawlRun was not assigned an id after commit")
            return run.id

    def _finish_run(self, run_id: int, summary: CrawlSummary) -> CrawlSummary:
        with Session(self.engine) as session:
            run = session.get(CrawlRun, run_id)
            if run is not None:
                run.finished_at = utc_now()
                run.records_discovered = summary.records_discovered
                run.records_inserted = summary.records_inserted
                run.records_updated = summary.records_updated
                run.pages_fetched = summary.pages_fetched
                run.errors = summary.errors
                run.stopped_reason = summary.stopped_reason
                session.add(run)
                session.commit()
        return summary

    def _save_html(self, result: FetchResult, force: bool = False) -> str | None:
        if not self.settings.save_html and not force:
            return None
        path = self.settings.raw_html_dir / f"{result.sha256}.html"
        path.write_text(result.text, encoding="utf-8")
        return str(path)

    def _record_page(
        self,
        session: Session,
        result: FetchResult,
        url_type: str,
        force_save_html: bool = False,
    ) -> CrawlPage:
        page = CrawlPage(
            url=result.url,
            url_type=url_type,
            http_status=result.status_code,
            content_type=result.content_type,
            content_length=result.content_length,
            sha256=result.sha256,
            raw_html_path=self._save_html(result, force=force_save_html),
        )
        session.add(page)
        return page

    def _queue_for_url(
        self,
        session: Session,
        url: str,
        url_type: str,
        source_record_id: str | None = None,
    ) -> CrawlQueue:
        queue, _ = enqueue_url(
            session,
            url,
            url_type,
            source_record_id=source_record_id,
            max_attempts=self.settings.max_retries,
        )
        return queue

    def _begin_attempt(self, queue: CrawlQueue) -> None:
        queue.status = "fetching"
        queue.attempts += 1
        queue.last_attempt_at = utc_now()
        queue.updated_at = utc_now()

    def _mark_error(self, queue: CrawlQueue, exc: Exception) -> None:
        queue.last_error = f"{type(exc).__name__}: {exc}"
        queue.updated_at = utc_now()
        if queue.attempts >= queue.max_attempts:
            queue.status = "failed"
            queue.next_attempt_at = None
        else:
            queue.status = "retry"
            queue.next_attempt_at = utc_now() + timedelta(
                seconds=self.settings.backoff_base_seconds * (2 ** max(0, queue.attempts - 1))
            )

    def _fetch_search(self, url: str, summary: CrawlSummary) -> str | None:
        with Session(self.engine) as session:
            queue = self._queue_for_url(session, url, "search")
            self._begin_attempt(queue)
            queue_id = queue.id
            session.add(queue)
            session.commit()
        assert queue_id is not None
        responses: list[FetchResult] = []
        try:
            shell = self.http.get(url)
            responses.append(shell)
            if shell.status_code >= 400:
                raise FetchError(f"HTTP {shell.status_code}")
            if "AllSearch-min.js" in shell.text:
                query_pairs = parse_qsl(urlparse(url).query, keep_blank_values=True)
                page_params = dict(query_pairs)
                start = int(page_params.get("start", "0"))
                limit = int(page_params.get("limit", "24"))
                map_start = int(page_params.get("mstart", "0"))
                map_limit = int(page_params.get("mlimit", "24"))
                criteria = urlencode(
                    [
                        (key, value)
                        for key, value in query_pairs
                        if key not in {"start", "limit", "mstart", "mlimit"}
                    ]
                )
                panel_results: list[SearchParseResult] = []
                for request_type, offset, page_limit in (
                    ("Images", start, limit),
                    ("Maps", map_start, map_limit),
                ):
                    data = self.http.post(
                        SEARCH_DATA_URL,
                        {
                            "urlqs": criteria,
                            "request": request_type,
                            "start": str(offset),
                            "limit": str(page_limit),
                        },
                    )
                    responses.append(data)
                    if data.status_code >= 400:
                        raise FetchError(f"HTTP {data.status_code}")
                    panel_results.append(
                        parse_search_json(data.text, url, start=offset, limit=page_limit)
                    )
                unique_results = {
                    result.source_record_id: result
                    for panel in panel_results
                    for result in panel.results
                }
                next_url = None
                if any(panel.next_page_url for panel in panel_results):
                    paging_pairs = [
                        (key, value)
                        for key, value in query_pairs
                        if key not in {"start", "limit", "mstart", "mlimit"}
                    ]
                    paging_pairs.extend(
                        [
                            ("start", str(start + limit)),
                            ("limit", str(limit)),
                            ("mstart", str(map_start + map_limit)),
                            ("mlimit", str(map_limit)),
                        ]
                    )
                    parsed_url = urlparse(url)
                    next_url = parsed_url._replace(query=urlencode(paging_pairs)).geturl()
                parsed = SearchParseResult(
                    results=list(unique_results.values()), next_page_url=next_url
                )
            else:
                parsed = parse_search(shell.text, shell.url)
            with Session(self.engine) as session:
                queue = session.get(CrawlQueue, queue_id)
                assert queue is not None
                queue.last_http_status = responses[-1].status_code
                queue.status = "parsed"
                queue.updated_at = utc_now()
                for response in responses:
                    self._record_page(session, response, "search")
                for result in parsed.results:
                    _, created = enqueue_url(
                        session,
                        result.detail_url,
                        "detail",
                        source_record_id=result.source_record_id,
                    )
                    if result.thumbnail_url:
                        upsert_asset(
                            session,
                            ImageAsset(
                                source_record_id=result.source_record_id,
                                asset_url=result.thumbnail_url,
                                asset_kind="thumbnail",
                                discovered_from_url=url,
                                reuse_status="likely_public_preview",
                            ),
                        )
                        stored_record = session.exec(
                            select(SourceRecord).where(
                                SourceRecord.source_record_id == result.source_record_id
                            )
                        ).first()
                        if stored_record:
                            stored_record.thumbnail_url = result.thumbnail_url
                            stored_record.search_result_url = url
                            stored_record.last_seen_at = utc_now()
                            session.add(stored_record)
                    if created:
                        summary.records_discovered += 1
                session.add(queue)
                session.commit()
            summary.pages_fetched += len(responses)
            return parsed.next_page_url
        except CrawlStop:
            raise
        except Exception as exc:
            with Session(self.engine) as session:
                current = session.get(CrawlQueue, queue_id)
                assert current is not None
                if responses:
                    current.last_http_status = responses[-1].status_code
                    for response in responses:
                        self._record_page(session, response, "search", force_save_html=True)
                    summary.pages_fetched += len(responses)
                current.status = "failed"
                current.last_error = f"{type(exc).__name__}: {exc}"
                current.updated_at = utc_now()
                session.add(current)
                session.commit()
            summary.errors += 1
            return None

    def _fetch_detail(self, queue_id: int, summary: CrawlSummary) -> None:
        with Session(self.engine) as session:
            queue = session.get(CrawlQueue, queue_id)
            assert queue is not None
            self._begin_attempt(queue)
            url = queue.url
            source_record_id = queue.source_record_id
            session.add(queue)
            session.commit()
        responses: list[FetchResult] = []
        try:
            shell = self.http.get(url)
            responses.append(shell)
            if shell.status_code >= 400:
                raise FetchError(f"HTTP {shell.status_code}")
            if "AllDetail-min.js" in shell.text:
                data = self.http.post(DETAIL_DATA_URL, {"assetId": source_record_id or ""})
                responses.append(data)
                if data.status_code >= 400:
                    raise FetchError(f"HTTP {data.status_code}")
                record, assets = parse_detail_json(data.text, url)
            else:
                record, assets = parse_detail(shell.text, shell.url)
            if source_record_id and record.source_record_id != source_record_id:
                raise ValueError(
                    f"detail response ImageId {record.source_record_id} does not match "
                    f"queued ImageId {source_record_id}"
                )
            record.raw_html_sha256 = shell.sha256
            with Session(self.engine) as session:
                current = session.get(CrawlQueue, queue_id)
                assert current is not None
                existing_record = session.exec(
                    select(SourceRecord).where(
                        SourceRecord.source_record_id == record.source_record_id
                    )
                ).first()
                thumbnail = session.exec(
                    select(ImageAsset).where(
                        ImageAsset.source_record_id == record.source_record_id,
                        ImageAsset.asset_kind == "thumbnail",
                    )
                ).first()
                if thumbnail:
                    record.thumbnail_url = thumbnail.asset_url
                    record.search_result_url = thumbnail.discovered_from_url
                elif existing_record:
                    record.thumbnail_url = existing_record.thumbnail_url
                    record.search_result_url = existing_record.search_result_url
                stored, inserted = upsert_source_record(session, record)
                for asset in assets:
                    upsert_asset(session, asset)
                current.status = "parsed"
                current.last_http_status = responses[-1].status_code
                current.last_error = None
                current.updated_at = utc_now()
                for response in responses:
                    self._record_page(session, response, "detail")
                session.add(current)
                session.add(stored)
                session.commit()
            summary.pages_fetched += len(responses)
            if inserted:
                summary.records_inserted += 1
            else:
                summary.records_updated += 1
        except CrawlStop:
            raise
        except Exception as exc:
            with Session(self.engine) as session:
                current = session.get(CrawlQueue, queue_id)
                assert current is not None
                if responses:
                    current.last_http_status = responses[-1].status_code
                    for response in responses:
                        self._record_page(session, response, "detail", force_save_html=True)
                    summary.pages_fetched += len(responses)
                self._mark_error(current, exc)
                session.add(current)
                session.commit()
            summary.errors += 1

    def one_detail(self, image_id: str) -> CrawlSummary:
        url = DETAIL_URL_TEMPLATE.format(image_id=image_id)
        summary = CrawlSummary(mode="one-detail")
        run_id = self._start_run(summary.mode, url)
        with Session(self.engine) as session:
            queue = self._queue_for_url(session, url, "detail", image_id)
            session.commit()
            queue_id = queue.id
        assert queue_id is not None
        try:
            self._fetch_detail(queue_id, summary)
        except CrawlStop as exc:
            summary.stopped_reason = str(exc)
            summary.errors += 1
        return self._finish_run(run_id, summary)

    def one_search(self, seed_url: str = DEFAULT_SEARCH_URL) -> CrawlSummary:
        summary = CrawlSummary(mode="one-search")
        run_id = self._start_run(summary.mode, seed_url)
        try:
            self._fetch_search(seed_url, summary)
        except CrawlStop as exc:
            summary.stopped_reason = str(exc)
            summary.errors += 1
        return self._finish_run(run_id, summary)

    def sample(
        self, max_search_pages: int, max_details: int, seed_url: str = DEFAULT_SEARCH_URL
    ) -> CrawlSummary:
        summary = CrawlSummary(mode="sample")
        run_id = self._start_run(summary.mode, seed_url)
        url: str | None = seed_url
        try:
            for _ in range(max_search_pages):
                if url is None:
                    break
                url = self._fetch_search(url, summary)
            self._process_pending_details(max_details, summary)
        except CrawlStop as exc:
            summary.stopped_reason = str(exc)
            summary.errors += 1
        return self._finish_run(run_id, summary)

    def details(self, max_details: int) -> CrawlSummary:
        summary = CrawlSummary(mode="details")
        run_id = self._start_run(summary.mode, None)
        try:
            self._process_pending_details(max_details, summary)
        except CrawlStop as exc:
            summary.stopped_reason = str(exc)
            summary.errors += 1
        return self._finish_run(run_id, summary)

    def _process_pending_details(self, limit: int, summary: CrawlSummary) -> None:
        with Session(self.engine) as session:
            now = utc_now()
            queue_ids = session.exec(
                select(CrawlQueue.id)
                .where(
                    CrawlQueue.url_type == "detail",
                    CrawlQueue.status.in_(["pending", "retry"]),  # type: ignore[union-attr]
                    (CrawlQueue.next_attempt_at.is_(None))  # type: ignore[union-attr]
                    | (CrawlQueue.next_attempt_at <= now),
                )
                .order_by(CrawlQueue.priority, CrawlQueue.created_at)
                .limit(limit)
            ).all()
        for queue_id in queue_ids:
            assert queue_id is not None
            self._fetch_detail(queue_id, summary)


def html_sha256(html: str) -> str:
    return hashlib.sha256(html.encode("utf-8")).hexdigest()
