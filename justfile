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

map-views args="":
    uv run python scripts/install_datasette_views.py {{args}}

datasette args="":
    uv run python scripts/install_datasette_views.py
    uv run datasette serve --immutable data/oldphilly.sqlite --host 127.0.0.1 --port 8001 {{args}}

datasette-open args="":
    uv run python scripts/install_datasette_views.py
    uv run datasette serve --immutable data/oldphilly.sqlite --host 127.0.0.1 --port 8001 --open {{args}}

datasette-plugins:
    uv run datasette plugins

requeue-failed args="":
    uv run python scripts/requeue_failed.py {{args}}

id-scan args="":
    uv run python scripts/scan_asset_ids.py {{args}}

export:
    uv run python scripts/export_jsonl.py

release-export args="":
    uv run python scripts/export_release.py {{args}}

hf-login:
    uv run hf auth login

hf-create repo="phillyhistory-metadata" args="--public":
    uv run hf repo create {{repo}} --repo-type dataset --exist-ok {{args}}

hf-upload repo="phillyhistory-metadata" args="":
    uv run hf upload {{repo}} data/releases --repo-type dataset --exclude ".gitkeep" {{args}}

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

# --- Static site (HTML/CSS/JS) formatting & linting via Prettier ---
WEB_GLOB := "site/*.html site/*.css site/*.js"

# Check site HTML/CSS/JS formatting
web-fmt:
    npx --yes prettier@3 --check {{WEB_GLOB}}

# Lint site HTML/CSS/JS (Prettier check; nonzero exit on issues)
web-lint: web-fmt

# Auto-format site HTML/CSS/JS in place
web-fix:
    npx --yes prettier@3 --write {{WEB_GLOB}}

# Generate static site data from SQLite
build-site-data:
    uv run python scripts/generate_site_data.py

# Serve site locally at http://localhost:8080
serve-site:
    python -m http.server 8080 --directory site --bind 127.0.0.1

# Build then serve
build-site: build-site-data serve-site

# Deploy site to Cloudflare Pages (requires wrangler login)
deploy: build-site-data
    wrangler pages deploy site --project-name=oldphilly --branch=deploy --commit-dirty=true
