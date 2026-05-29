# oldphilly

A small local crawler for public PhillyHistory metadata. It stores typed record metadata,
unmapped source fields, crawl history, and directly exposed public image URL candidates in
SQLite. It does not download images or attempt to access restricted media.

Public display images are typically preview-sized. Some records may expose a public
high-resolution viewer URI; licensable original files remain subject to PhillyHistory's paid
licensing workflow and are not retrieved by this crawler.

## Source Roadmap

- Current: PhillyHistory / Philadelphia City Archives.
- TODO: Free Library of Philadelphia, Historical Images of Philadelphia.
- TODO: Temple University Urban Archives.
- TODO: Library Company of Philadelphia digital collections.
- TODO: Historical Society of Pennsylvania digital collections.

Provider-specific crawler code lives under `oldphilly/crawlers/`. The active implementation is
`oldphilly/crawlers/phillyhistory/`.

## Setup

This project uses `uv` and Python 3.12 or newer.

```bash
uv sync
uv run python scripts/crawl.py --mode init
```

The database is created at `data/oldphilly.sqlite`; runtime HTML samples and JSONL exports live
under `data/raw_html/` and `data/exports/`.

If the database already exists, `init` asks for confirmation and preserves existing rows. To
intentionally rebuild from scratch, use `--reinit`; it also asks for confirmation unless `--yes` is
provided:

```bash
uv run python scripts/crawl.py --mode init --reinit
```

## Crawl Modes

The client allows only PhillyHistory hosts, sends a descriptive user agent, spaces request starts,
retries transient failures, and stops on repeated blocking statuses or challenge pages. Search
pagination is sequential; detail fetching uses bounded concurrency.

```bash
uv run python scripts/crawl.py --mode one-detail --image-id 45557
uv run python scripts/crawl.py --mode one-search
uv run python scripts/crawl.py --mode sample --max-search-pages 1 --max-details 25
uv run python scripts/crawl.py --mode search
uv run python scripts/crawl.py --mode details --max-details 100
uv run python scripts/crawl.py --mode details-all
uv run python scripts/crawl.py --mode full
```

`sample` requires both limits and bounded `details` requires `--max-details`. Use `search` to
follow search result pagination until exhausted, `details-all` to drain every currently eligible
detail queue item, or `full` to do both in one run. Add `--save-html` to retain fetched HTML for a
small diagnostic run. Failed parsed pages are retained automatically for inspection.

`one-search`, `sample`, `search`, and `full` accept `--seed-url` for a documented public
`Search.aspx` URL. The observed advanced-search parameters, topics, series, and collections are
recorded in
[docs/search_parameters.md](docs/search_parameters.md).

The default crawl is tuned more aggressively than the original polite settings: four concurrent
detail workers with a `0.35s` request-start delay plus up to `0.05s` jitter. Override those knobs
when needed:

```bash
uv run python scripts/crawl.py --mode full --request-delay 0.5 --request-jitter 0.1 --concurrency 2
```

## Inspect And Export

```bash
uv run python scripts/status.py
uv run python scripts/export_jsonl.py
```

Exports are written to `data/exports/phillyhistory.jsonl`.

For a local browser UI over the SQLite database:

```bash
just datasette-open
```

This installs map-friendly SQL views and serves `data/oldphilly.sqlite` read-only on
`http://127.0.0.1:8001`. The `datasette-cluster-map` plugin adds map views for tables and queries
with `latitude` and `longitude` columns.

Useful starting points:

- `v_philly_map_records`: records inside a broad Philadelphia-area bounding box.
- `v_philly_map_records_with_media`: mappable records that have a preview or thumbnail URL.

## Release To Hugging Face

Build Parquet tables, a compressed SQLite snapshot, and a dataset card:

```bash
just release-export
```

Authenticate and upload with the official Hugging Face Hub CLI:

```bash
just hf-login
just hf-create your-username/oldphilly
just hf-upload your-username/oldphilly
```

Release artifacts are generated under `data/releases/` and are not committed to this repo.

## Validate

Tests use local HTML fixtures and never contact PhillyHistory:

```bash
uv run pytest -q
uv run ruff check .
```

## Credit and Inspiration

[PhillyHistory.org](https://www.phillyhistory.org/PhotoArchive/Home.aspx)
[OldNYC](https://oldnyc.org) - [Source Code](https://github.com/danvk/oldnyc)
