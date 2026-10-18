# Lossless NYPL Library transfer kit

**Received and verified, 2026-10-18:** the complete supplied export arrived as 36 individually readable JSON parts. The [receiver receipt](../snapshots/nypl-receipt.json) confirms all original hashes, **519,007 bytes**, **6,507 rows**, resolved joins and all 3,469 occurrences. [Source status](SOURCE-STATUS.md) records the complete transfer identities and audit. The producer instructions below remain reproducible transport documentation; this import is no longer pending.

Run in the environment that already holds the four authorized original CSV artifacts. No source download is performed. Node 24.19+ is required.

The standalone producer's five source files are also available as a [readable JSON Library bundle](https://chatgpt.com/api/library/files/libfile_0b3fb38a8eec8191b1902a9c702ea6f6/download), `libfile_0b3fb38a8eec8191b1902a9c702ea6f6`, 14,571 bytes. A native Library full read verified all 27 lines with `has_more: false`; parsing recovered all five complete files. Write each `files[].content` unchanged to `files[].path` under a new directory. This avoids any dependency on ZIP materialization. It contains this splitter, the shared transfer module, pinned source facts, package manifest and lockfile.

```sh
npm ci --ignore-scripts
node scripts/split-nypl.ts /absolute/path/to/original-csvs /absolute/path/to/new-chunks
```

Expected source files and data-row counts: Menu.csv 72; MenuPage.csv 432; MenuItem.csv 3469; Dish.csv 2534. `snapshots/nypl-inputs.json` pins all four original byte lengths, SHA-256 hashes and Library identities. The splitter refuses changed/truncated source bytes or row counts.

Upload `manifest.json` and every `*.partNNN.json` individually to Library as JSON, then supply their Library IDs. Do not put them only inside a ZIP: the receiving environment cannot materialize the original ZIP and its CSV reader truncates sheet extraction at 1000 rows. The code kit itself may be distributed as a ZIP; the actual data parts need to remain individually readable.

Each part is at most 24,576 UTF-8 bytes and 200 complete data rows. The largest already verified complete Library text window was 45,514 bytes. Library's read API clamps requests to 1000 rendered lines; ordinary JSON parts contain far fewer lines. The manifest is also limited to 24,576 bytes.

The envelope fields are `format` = `nypl-csv-chunk-v1`, `table`, zero-based `index`, one-based `firstDataRow`, `rowCount`, zero-based `startByte`, `byteLength`, payload `sha256`, and `csv`. `csv` is the unchanged source segment encoded as a JSON string. The first part contains the original header; later parts start with the next complete CSV record, with no repeated headers. All columns and source values remain unchanged.

The manifest format is `nypl-csv-manifest-v1`, with encoding, limits and four `tables`. Each table records the original source identity/hash/bytes/row count, parsed column names, and ordered `parts`. Each part descriptor records its canonical filename, index, row/byte ranges, CSV payload SHA-256 and serialized JSON SHA-256/byte length. This preserves CRLF, quoted newlines, UTF-8/BOM and presence/absence of a final newline.

The receiving app runs `node scripts/reconstruct-nypl.ts <chunks-directory> <new-csv-directory>`, verifies all part and original-file hashes/counts/schema, then validates the full joins. Expected joins: 72 menus, 432 source pages, 3469 item occurrences, 2534 dishes, 1488 priced occurrences. The unrelated zero-item Rosoff ad on menu 29916 page 4 is retained in source bytes and excluded only from menu display. Nothing writes app data until reconstruction and import checks succeed.

No missing rows are inferred, no source values are hand-copied, and no denied source endpoint is revisited. A single record too large for the limit produces an explicit error rather than truncation.
