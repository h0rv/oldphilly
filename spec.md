# Coding Agent Prompt: Old Philly Single Metadata Crawler

Build a **single minimal metadata crawler** for PhillyHistory.org.

The goal is to create a local SQLite metadata index of public PhillyHistory records, using stable `ImageId` detail pages and documented public search URLs.

This is **metadata-only**.

Do not build:

* full image mirror
* public website
* embeddings
* MapLibre frontend
* S3/R2 upload
* watermark removal
* auth scraping
* purchase/download bypass
* robots.txt handling

---

## Core Goal

Create one simple crawler that:

1. Seeds public PhillyHistory search URLs.
2. Extracts detail URLs / `ImageId`s.
3. Fetches public detail pages.
4. Parses tightly typed metadata.
5. Stores records in SQLite.
6. Preserves unknown fields in `raw_metadata_json`.
7. Tracks crawl status, errors, attempts, and timestamps.
8. Stores public image URL candidates without downloading images.

The main artifact is:

```text
data/oldphilly.sqlite
```

---

## Known Public URLs

Search page:

```text
https://www.phillyhistory.org/PhotoArchive/Search.aspx
```

Detail page:

```text
https://www.phillyhistory.org/PhotoArchive/detail.aspx?ImageId=<IMAGE_ID>
```

Link/search standards:

```text
https://www.phillyhistory.org/PhotoArchive/StaticContent.aspx?page=Link+Standards
```

Known search parameters:

```text
type=address
address=...

type=area
minx=...
miny=...
maxx=...
maxy=...

neighborhood=...
keywords=...
fromDate=YYYY
toDate=YYYY
collections=...
withoutMedia=true|false
withoutLocation=true|false
updateDays=0|1|3|5|7|10|30|60|90|180|365
sortOrderP=Distance|CircaDesc|CircaAsc|UpdatedDateDesc
start=<offset>
limit=12|16|20|24
mstart=<offset>
mlimit=12|16|20|24
```

Use documented public URLs first.

---

## Stack

Use:

```text
Python 3.12+
SQLite
SQLModel
httpx
selectolax or BeautifulSoup
pytest
ruff
```

Optional:

```text
rich
duckdb
pyarrow
```

Keep it light.

---

## Repo Shape

```text
.
├── README.md
├── pyproject.toml
├── oldphilly/
│   ├── __init__.py
│   ├── config.py
│   ├── db.py
│   ├── models.py
│   ├── http.py
│   ├── parse_search.py
│   ├── parse_detail.py
│   ├── crawler.py
│   └── export.py
├── scripts/
│   ├── crawl.py
│   ├── status.py
│   └── export_jsonl.py
├── tests/
│   ├── fixtures/
│   │   ├── search_sample.html
│   │   └── detail_sample.html
│   ├── test_parse_search.py
│   ├── test_parse_detail.py
│   └── test_models.py
└── data/
    ├── .gitkeep
    ├── raw_html/
    └── exports/
```

---

## Polite Crawling Rules

Do **not** implement robots.txt support.

Instead, use conservative defaults:

```python
REQUEST_DELAY_SECONDS = 1.5
REQUEST_JITTER_SECONDS = 0.75
TIMEOUT_SECONDS = 30
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 5
CONCURRENCY = 1
```

Crawler behavior:

* single-threaded by default
* no unbounded crawl unless explicitly requested
* require a max page/detail limit
* sleep between every request
* add jitter
* back off on transient errors
* stop on repeated `429`, `403`, or `503`
* never bypass auth, paywalls, CAPTCHAs, scan requests, or purchase flows
* use a clear User-Agent

Example User-Agent:

```text
oldphilly-metadata-crawler/0.1; civic archival metadata index; contact: local-dev
```

Only crawl these hosts by default:

```text
www.phillyhistory.org
phillyhistory.org
```

---

## SQLModel Requirement

Use SQLModel as the DRY source of truth for:

* typed models
* validation
* table definitions
* SQLite persistence
* future Postgres portability

Do not maintain separate Pydantic and ORM models unless absolutely necessary.

SQLite is required.

Postgres support is not required, but the models should not prevent it later.

---

## Tables

### SourceRecord

One row per PhillyHistory record.

Unique key:

```text
(source, source_record_id)
```

Where:

```text
source = phillyhistory
source_record_id = ImageId
```

Fields:

```python
id: int | None
source: str
source_record_id: str

canonical_url: str
detail_url: str
search_result_url: str | None

media_type: str | None
title: str | None
description: str | None
notes: str | None
photographer: str | None
creator: str | None
collection: str | None
record_group: str | None
negative_number: str | None
archive_id: str | None

date_display: str | None
circa_year: int | None
year_start: int | None
year_end: int | None

address_text: str | None
location_text: str | None
neighborhood: str | None

latitude: float | None
longitude: float | None
state_plane_x: float | None
state_plane_y: float | None

has_digitized_media: bool | None

thumbnail_url: str | None
preview_url: str | None
image_url: str | None

rights_text: str | None
citation_text: str | None

raw_metadata_json: dict
raw_html_sha256: str | None

first_seen_at: datetime
last_seen_at: datetime
last_fetched_at: datetime | None
```

Important:

* Store typed fields directly.
* Store every unknown/unmapped field in `raw_metadata_json`.
* Never discard source metadata.

---

### ImageAsset

Public image URL candidates only.

Do not download or mirror images yet.

Fields:

```python
id: int | None
source: str
source_record_id: str

asset_url: str
asset_kind: str

discovered_from_url: str | None
http_status: int | None
content_type: str | None
content_length: int | None
sha256: str | None

width: int | None
height: int | None

appears_watermarked: bool | None
reuse_status: str

local_path: str | None
r2_key: str | None

first_seen_at: datetime
last_seen_at: datetime
```

Valid `asset_kind` values:

```text
thumbnail
preview
full_candidate
unknown
```

Valid `reuse_status` values:

```text
unknown
likely_public_preview
requires_permission
avoid
```

Default:

```text
reuse_status = unknown
```

---

### CrawlQueue

Tracks URLs to fetch.

Fields:

```python
id: int | None
url: str
url_type: str
source_record_id: str | None

status: str
priority: int

attempts: int
max_attempts: int

next_attempt_at: datetime | None
last_attempt_at: datetime | None

last_http_status: int | None
last_error: str | None

created_at: datetime
updated_at: datetime
```

Valid `url_type` values:

```text
search
detail
image_probe
```

Valid `status` values:

```text
pending
fetching
fetched
parsed
skipped
retry
failed
```

---

### CrawlPage

Tracks fetched pages.

Fields:

```python
id: int | None
url: str
url_type: str

http_status: int | None
content_type: str | None
content_length: int | None
sha256: str | None

fetched_at: datetime
raw_html_path: str | None
```

Store raw HTML only for:

```text
fixtures
debugging
failed parses
small samples
```

Do not store all HTML forever by default.

---

### CrawlRun

Tracks a crawl run.

Fields:

```python
id: int | None

started_at: datetime
finished_at: datetime | None

mode: str
seed: str | None

records_discovered: int
records_inserted: int
records_updated: int
pages_fetched: int
errors: int
stopped_reason: str | None
```

---

## Indexes

Add indexes for:

```sql
CREATE INDEX IF NOT EXISTS idx_source_records_source_record_id
ON source_records (source, source_record_id);

CREATE INDEX IF NOT EXISTS idx_source_records_year
ON source_records (circa_year, year_start, year_end);

CREATE INDEX IF NOT EXISTS idx_source_records_location
ON source_records (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_crawl_queue_status
ON crawl_queue (status, priority, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_image_assets_record
ON image_assets (source, source_record_id);
```

---

## Single Crawler Script

Implement:

```text
scripts/crawl.py
```

It should support these modes:

```bash
python scripts/crawl.py --mode init
python scripts/crawl.py --mode one-detail --image-id 45557
python scripts/crawl.py --mode one-search
python scripts/crawl.py --mode sample --max-search-pages 1 --max-details 25
python scripts/crawl.py --mode details --max-details 100
```

Every crawl mode must require explicit limits, except:

```text
init
one-detail
one-search
```

No full crawl should run accidentally.

---

## HTTP Client

Implement `oldphilly/http.py`.

Requirements:

* one shared `httpx.Client`
* fixed timeout
* retry transient errors
* exponential backoff
* jitter
* clear User-Agent
* host allowlist
* status/content-type/content-length recording
* SHA256 hash recording
* clean exception handling

Back off on:

```text
429
500
502
503
504
timeouts
connection resets
```

Stop early on:

```text
repeated 429
repeated 403
repeated 503
unexpected login page
CAPTCHA page
```

---

## Search Parser

Implement `parse_search.py`.

Input:

```python
html: str
base_url: str
```

Output:

```python
SearchParseResult
```

Extract:

* `ImageId`
* detail URL
* result title if present
* date/year if present
* location text if present
* thumbnail URL if present
* next page URL if present
* raw result metadata if present

Do not assume perfect HTML.

---

## Detail Parser

Implement `parse_detail.py`.

Input:

```python
html: str
url: str
```

Output:

```python
SourceRecord
list[ImageAsset]
```

Extract:

* `ImageId`
* canonical detail URL
* title
* description
* date
* photographer
* creator
* collection
* record group
* negative number
* archive ID
* location/address
* neighborhood
* coordinates if exposed
* thumbnail URL
* preview URL
* image URL candidate if exposed
* rights text
* citation text
* all raw key/value metadata

All unknown fields go into:

```text
raw_metadata_json
```

---

## Date Parsing

Rules:

* preserve original value in `date_display`
* parse obvious single years into `circa_year`
* parse obvious ranges into `year_start` and `year_end`
* do not over-normalize uncertain dates
* if unsure, leave typed fields null and keep raw metadata

Examples:

```text
"1912" -> circa_year=1912
"circa 1912" -> circa_year=1912
"1910-1915" -> year_start=1910, year_end=1915
"n.d." -> typed date fields null
```

---

## Coordinate Rules

* Prefer public latitude/longitude if present.
* If only projected coordinates are exposed, store as `state_plane_x` and `state_plane_y`.
* Do not transform coordinates unless EPSG assumptions are documented and tested.
* If transformed later, keep original coordinates too.

---

## Image Rules

Allowed:

* store image URLs directly present in public HTML
* store thumbnail URLs
* store preview URLs
* store full image candidates if directly exposed
* optionally issue limited `HEAD` requests for sampled URL metadata

Not allowed:

* watermark removal
* watermark cropping
* brute forcing URL patterns
* guessing private high-res URLs
* bypassing purchase/download flows
* bulk image downloading
* public image mirroring

---

## Crawler Flow

### Init

`python scripts/crawl.py --mode init`

Should:

1. Create `data/oldphilly.sqlite`.
2. Create all SQLModel tables.
3. Create indexes.
4. Create `data/raw_html/`.
5. Create `data/exports/`.
6. Print status.

---

### One Detail

`python scripts/crawl.py --mode one-detail --image-id 45557`

Should:

1. Fetch public detail page.
2. Parse metadata.
3. Store `SourceRecord`.
4. Store `ImageAsset` candidates.
5. Save fixture HTML if configured.
6. Print parsed fields.

---

### One Search

`python scripts/crawl.py --mode one-search`

Should:

1. Fetch one documented search URL.
2. Parse search results.
3. Extract `ImageId`s.
4. Enqueue detail URLs.
5. Save fixture HTML if configured.
6. Print discovered count.

---

### Sample

`python scripts/crawl.py --mode sample --max-search-pages 1 --max-details 25`

Should:

1. Fetch one search page.
2. Enqueue detail pages.
3. Fetch max 25 detail pages.
4. Store records.
5. Store image URL candidates.
6. Print summary.
7. Be safe to rerun.

---

### Details

`python scripts/crawl.py --mode details --max-details 100`

Should:

1. Process pending detail URLs.
2. Respect delay/jitter.
3. Upsert records.
4. Persist errors.
5. Stop on repeated bad statuses.
6. Print summary.

---

## Idempotency

Upsert by:

```text
(source, source_record_id)
```

On repeated crawls:

* preserve `first_seen_at`
* update `last_seen_at`
* update `last_fetched_at`
* update changed typed fields
* update `raw_metadata_json`
* do not duplicate records
* do not duplicate image assets
* do not duplicate queue URLs

---

## Error Handling

Never crash the whole crawl because one page fails.

Persist:

* URL
* status
* HTTP code
* exception type
* error message
* attempts
* next retry time

Failed pages should be inspectable later.

---

## Export

Implement:

```text
scripts/export_jsonl.py
```

Export fields:

```text
source
source_record_id
canonical_url
detail_url
title
description
date_display
circa_year
year_start
year_end
location_text
address_text
neighborhood
latitude
longitude
thumbnail_url
preview_url
image_url
rights_text
citation_text
raw_metadata_json
```

Output:

```text
data/exports/phillyhistory.jsonl
```

---

## Status

Implement:

```text
scripts/status.py
```

Print:

* record count
* image asset count
* queue count by status
* page count
* last run summary
* most recent errors

---

## Tests

Write tests for:

* SQLModel table creation
* unique key upsert behavior
* date parsing
* search result parsing
* detail page parsing
* image asset extraction
* unknown metadata preservation

Tests must use fixtures.

No live network in tests.

---

## Acceptance Criteria

Done means:

1. `python scripts/crawl.py --mode init` creates the DB.
2. `python scripts/crawl.py --mode one-detail --image-id 45557` stores one record.
3. `python scripts/crawl.py --mode one-search` discovers detail URLs.
4. `python scripts/crawl.py --mode sample --max-search-pages 1 --max-details 25` stores at least 25 records.
5. Re-running the sample creates no duplicates.
6. Unknown fields are preserved in `raw_metadata_json`.
7. Image URLs are stored but not downloaded.
8. Status script works.
9. JSONL export works.
10. Parser tests pass.
11. No unbounded crawl runs by default.

---

## Implementation Style

Keep it:

* small
* typed
* boring
* resumable
* local-first
* inspectable

Use:

```text
SQLModel + SQLite + single-threaded httpx crawler
```

Do not overbuild.
