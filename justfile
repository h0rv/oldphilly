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

export:
    uv run python scripts/export_jsonl.py

init:
    uv run python scripts/crawl.py --mode init

one-detail image_id:
    uv run python scripts/crawl.py --mode one-detail --image-id {{image_id}}

one-search seed_url="":
    uv run python scripts/crawl.py --mode one-search $([ -n "{{seed_url}}" ] && echo "--seed-url {{seed_url}}")

sample max_search_pages max_details seed_url="":
    uv run python scripts/crawl.py --mode sample --max-search-pages {{max_search_pages}} --max-details {{max_details}} $([ -n "{{seed_url}}" ] && echo "--seed-url {{seed_url}}")

details max_details:
    uv run python scripts/crawl.py --mode details --max-details {{max_details}}

crawl args="":
    uv run python scripts/crawl.py {{args}}
