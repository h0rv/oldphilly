# oldphilly

A small local crawler for public PhillyHistory metadata. It stores typed record metadata,
unmapped source fields, crawl history, and directly exposed public image URL candidates in
SQLite. It does not download images or attempt to access restricted media.

Public display images are typically preview-sized. Some records may expose a public
high-resolution viewer URI; licensable original files remain subject to PhillyHistory's paid
licensing workflow and are not retrieved by this crawler.

## Setup

This project uses `uv` and Python 3.12 or newer.

```bash
uv sync
uv run python scripts/crawl.py --mode init
```

The database is created at `data/oldphilly.sqlite`; runtime HTML samples and JSONL exports live
under `data/raw_html/` and `data/exports/`.

## Crawl Modes

The client is single threaded, allows only PhillyHistory hosts, sends a descriptive user agent,
delays requests, retries transient failures, and stops on repeated blocking statuses or challenge
pages.

```bash
uv run python scripts/crawl.py --mode one-detail --image-id 45557
uv run python scripts/crawl.py --mode one-search
uv run python scripts/crawl.py --mode sample --max-search-pages 1 --max-details 25
uv run python scripts/crawl.py --mode details --max-details 100
```

`sample` requires both limits and `details` requires `--max-details`; there is no unbounded crawl
mode. Add `--save-html` to retain fetched HTML for a small diagnostic run. Failed parsed pages are
retained automatically for inspection.

`one-search` and `sample` accept `--seed-url` for a documented public `Search.aspx` URL. The
observed advanced-search parameters, topics, series, and collections are recorded in
[docs/search_parameters.md](docs/search_parameters.md).

## Inspect And Export

```bash
uv run python scripts/status.py
uv run python scripts/export_jsonl.py
```

Exports are written to `data/exports/phillyhistory.jsonl`.

## Validate

Tests use local HTML fixtures and never contact PhillyHistory:

```bash
uv run pytest -q
uv run ruff check .
```
