# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo>=0.23.8",
#     "polars[pyarrow]==1.40.1",
# ]
# ///

# Ruff does not model marimo SQL output cells, which bind displayed results.
# ruff: noqa: F541, F841

import marimo

__generated_with = "0.23.8"
app = marimo.App(width="full")


@app.cell
def _():
    import sqlite3
    from pathlib import Path

    import marimo as mo

    return Path, mo, sqlite3


@app.cell
def _(mo):
    mo.md("""
    # Old Philly SQLite explorer

    Read-only queries against the crawler database using marimo's SQL support.
    Each result cell is regular SQL and can be edited or duplicated for spot checks.
    """)
    return


@app.cell
def _(Path, mo):
    database_path = Path("data/oldphilly.sqlite").resolve()
    mo.md(f"**Database:** `{database_path}`")
    return (database_path,)


@app.cell
def _(database_path, sqlite3):
    if not database_path.exists():
        raise FileNotFoundError(f"Database not found: {database_path}")

    connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    return (connection,)


@app.cell
def _(mo):
    mo.md("""
    ## Table inventory
    """)
    return


@app.cell
def _(connection, mo):
    table_counts = mo.sql(
        f"""
        SELECT 'source_records' AS table_name, COUNT(*) AS row_count FROM source_records
        UNION ALL
        SELECT 'image_assets', COUNT(*) FROM image_assets
        UNION ALL
        SELECT 'crawl_queue', COUNT(*) FROM crawl_queue
        UNION ALL
        SELECT 'crawl_pages', COUNT(*) FROM crawl_pages
        UNION ALL
        SELECT 'crawl_runs', COUNT(*) FROM crawl_runs
        ORDER BY table_name;
        """,
        engine=connection,
    )
    return


@app.cell
def _(mo):
    mo.md("""
    ## Recent source records
    """)
    return


@app.cell
def _(connection, mo):
    recent_records = mo.sql(
        f"""
        SELECT
            source_record_id,
            title,
            date_display,
            circa_year,
            address_text,
            neighborhood,
            has_digitized_media,
            last_fetched_at
        FROM source_records
        ORDER BY last_fetched_at DESC, id DESC
        LIMIT 25;
        """,
        engine=connection,
    )
    return


@app.cell
def _(mo):
    mo.md("""
    ## Decade spot check
    """)
    return


@app.cell
def _(connection, mo):
    records_by_decade = mo.sql(
        f"""
        SELECT
            (circa_year / 10) * 10 AS decade,
            COUNT(*) AS records,
            SUM(CASE WHEN has_digitized_media THEN 1 ELSE 0 END) AS digitized_records
        FROM source_records
        WHERE circa_year IS NOT NULL
        GROUP BY decade
        ORDER BY decade;
        """,
        engine=connection,
    )
    return


@app.cell
def _(mo):
    mo.md("""
    ## Records and discovered image assets
    """)
    return


@app.cell
def _(connection, mo):
    asset_coverage = mo.sql(
        f"""
        SELECT
            records.source_record_id,
            records.title,
            COUNT(assets.id) AS asset_count,
            SUM(CASE WHEN assets.asset_kind = 'thumbnail' THEN 1 ELSE 0 END) AS thumbnails,
            SUM(CASE WHEN assets.asset_kind = 'preview' THEN 1 ELSE 0 END) AS previews,
            SUM(CASE WHEN assets.asset_kind = 'full_candidate' THEN 1 ELSE 0 END) AS full_candidates
        FROM source_records AS records
        LEFT JOIN image_assets AS assets
            ON assets.source = records.source
            AND assets.source_record_id = records.source_record_id
        GROUP BY records.id, records.source_record_id, records.title
        ORDER BY asset_count DESC, records.source_record_id
        LIMIT 25;
        """,
        engine=connection,
    )
    return


@app.cell
def _(mo):
    mo.md("""
    ## Crawl queue status
    """)
    return


@app.cell
def _(connection, mo):
    queue_status = mo.sql(
        f"""
        SELECT
            url_type,
            status,
            COUNT(*) AS queued_urls,
            SUM(attempts) AS attempts,
            MAX(last_attempt_at) AS most_recent_attempt
        FROM crawl_queue
        GROUP BY url_type, status
        ORDER BY url_type, status;
        """,
        engine=connection,
    )
    return


@app.cell
def _(mo):
    mo.md("""
    ## Crawl run history
    """)
    return


@app.cell
def _(connection, mo):
    crawl_runs = mo.sql(
        f"""
        SELECT
            id,
            started_at,
            finished_at,
            mode,
            seed,
            records_discovered,
            records_inserted,
            records_updated,
            pages_fetched,
            errors,
            stopped_reason
        FROM crawl_runs
        ORDER BY started_at DESC
        LIMIT 20;
        """,
        engine=connection,
    )
    return


@app.cell
def _(mo):
    mo.md("""
    ## Text and date spot check

    Edit the filters in this final query to inspect a title, year range, or location of interest.
    """)
    return


@app.cell
def _(connection, mo):
    spot_check = mo.sql(
        f"""
        SELECT
            source_record_id,
            title,
            circa_year,
            address_text,
            latitude,
            longitude
        FROM source_records
        WHERE title LIKE '%City Hall%'
           OR circa_year BETWEEN 1900 AND 1920
        ORDER BY circa_year, source_record_id
        LIMIT 25;
        """,
        engine=connection,
    )
    return


if __name__ == "__main__":
    app.run()
