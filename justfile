export UV_CACHE_DIR := ".uv-cache"

ci: lint typecheck test

lint:
    uv run ruff check .

fmt:
    uv run ruff format --check .

fix:
    uv run ruff check --fix .
    uv run ruff format .

typecheck:
    uv run ty check

test:
    uv run pytest -q

status:
    uv run python scripts/status.py

requeue-failed args="":
    uv run python scripts/requeue_failed.py {{args}}

id-scan args="":
    uv run python scripts/scan_asset_ids.py {{args}}

export:
    uv run python scripts/export_jsonl.py

init args="":
    uv run python scripts/crawl.py --mode init {{args}}

one-detail image_id:
    uv run python scripts/crawl.py --mode one-detail --image-id {{image_id}}

one-search seed_url="" args="":
    uv run python scripts/crawl.py --mode one-search {{args}} $([ -n "{{seed_url}}" ] && echo "--seed-url {{seed_url}}")

search seed_url="" args="":
    uv run python scripts/crawl.py --mode search {{args}} $([ -n "{{seed_url}}" ] && echo "--seed-url {{seed_url}}")

sample max_search_pages max_details seed_url="" args="":
    uv run python scripts/crawl.py --mode sample --max-search-pages {{max_search_pages}} --max-details {{max_details}} {{args}} $([ -n "{{seed_url}}" ] && echo "--seed-url {{seed_url}}")

details max_details args="":
    uv run python scripts/crawl.py --mode details --max-details {{max_details}} {{args}}

details-all args="":
    uv run python scripts/crawl.py --mode details-all {{args}}

full seed_url="" args="":
    uv run python scripts/crawl.py --mode full {{args}} $([ -n "{{seed_url}}" ] && echo "--seed-url {{seed_url}}")

crawl args="":
    uv run python scripts/crawl.py {{args}}

marimo:
    uv run marimo edit notebooks/sql_explorer.py
