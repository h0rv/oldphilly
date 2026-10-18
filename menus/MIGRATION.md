# Source migration into OldPhilly

The current user instruction is to keep **Old Philly Menus** inside **h0rv/oldphilly**, canonical **https://oldphilly.org/menus/**. This supersedes the earlier standalone-repository plan. No separate menu repository was created.

The starting source is the rights-safe tree at commit **553b7738c3851f1ff588eda0ff74b3ae84401c9c** in the earlier local research checkout. It was copied with `git archive` into `menus/` on an ordinary branch based on OldPhilly main **fe86106dd14f6cff153c948ffdca43ee92cea354**. No research history, private raw files, old refs, node_modules or built output was imported. Nested standalone deployment workflows were removed; the root workflow owns the combined build.

Earlier origin, retained only as provenance: https://github.com/h0rv/philly/pull/10, branch feat/historical-menu-map, commit deebfe547300a0291400097f404fa4d77919b1d5, path explorations/historical-menu-map/. That PR and repository remain untouched by this integration; this does not authorize merging it.

Four selected NYPL CSVs remain byte-identical. CIA's public metadata derivative clears only four nonempty Transcript values while preserving all other fields; the exact original and transcript-containing development history remain private in the earlier research checkout, outside OldPhilly. The 36-part NYPL transfer receipt, hashes and source identity are retained. No denied source endpoint was bypassed.

The existing photo map stays at `/`. Menu output is composed into generated `site/menus/`, and one link is added to the photo title card. Existing Cloudflare project, deployment branch and secret names are retained. This contribution is for PR review and CI; merging, production deployment and the optional subdomain redirect remain separate from this change.
