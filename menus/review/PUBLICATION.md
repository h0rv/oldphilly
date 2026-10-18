> Historical PR #1 record. The reader follow-up is documented in [READER.md](READER.md); these earlier screenshots and UI findings are not acceptance evidence for it.

# Old Philly Menus integration and hosting

The approved destination is **h0rv/oldphilly**, canonical **https://oldphilly.org/menus/**. The previous standalone-repository plan is superseded. This change prepares a reviewable PR and verifies CI; it does not authorize merging or publishing before preview review. h0rv/philly PR #10 is untouched.

The local branch feat/old-philly-menus starts at OldPhilly main fe86106dd14f6cff153c948ffdca43ee92cea354. Only the rights-safe source tree from 553b7738c3851f1ff588eda0ff74b3ae84401c9c was copied into menus/. Private CIA originals and earlier research history are absent. The menu MIT license retains its existing author and is scoped to this app, not the root photo collection.

## Existing hosting, read-only inspection

Cloudflare's authorized read-only APIs confirmed the existing oldphilly Pages project, oldphilly.pages.dev, production branch deploy and active custom domain oldphilly.org. The project uses the repository's existing direct-upload GitHub Actions workflow. The latest main deployment before this change succeeded: [run 38014742175](https://github.com/h0rv/oldphilly/actions/runs/38014742175), head fe86106dd14f6cff153c948ffdca43ee92cea354.

The deployment still publishes `site/` to the existing project/branch with existing secrets. The shared build action now checks Python and TypeScript, generates the existing full photo dataset, installs the menu app under /menus/ and tests combined navigation. PR CI runs those checks without deployment. No paid service, credential, new project, account setting or DNS record was changed.

An exact DNS lookup found no menus.oldphilly.org record, and the Pages project has no custom-domain binding for it. A future scoped proxied DNS record plus a zone Single Redirect can send that hostname to https://oldphilly.org/menus/ using existing Cloudflare facilities; no separate app is needed. It is not activated by this PR. Pages `_redirects` cannot perform domain-level redirects: [official redirects documentation](https://developers.cloudflare.com/pages/configuration/redirects/). Its nested 404 behavior does support menu-specific `menus/404.html`: [official serving documentation](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## Verification limits

The local public photo Parquet download returned HTTP 403. It was not retried or bypassed; the unchanged download route previously succeeded in the existing main workflow. Local combined photo tests therefore intercept only the existing repository fixture and serve actual pinned bytes for the unchanged photo CDN URLs, which were unavailable in the local browser. The successful CI run below establishes the full real photo-data build despite this local restriction.

Automated browser tests block OSM tiles under provider policy and source images for reproducible outage checks. They prove reading, filters, locations and navigation during failures, not successful live tiles or images. An ordinary browser preview with external access remains necessary before production approval. No menu URL is claimed live before deployment.

Draft review PR: [h0rv/oldphilly #1](https://github.com/h0rv/oldphilly/pull/1), branch feat/old-philly-menus, initial source commit 6d0b653af3b0aa0e81586a23cf68a39492176d1e. [Combined CI run 39165367328](https://github.com/h0rv/oldphilly/actions/runs/39165367328) **passed** on 640658e7179b72aa166c152dcb8d621db96219e1. It downloaded the real public Parquet input and exported **128,812 photo records, 10,284 locations and 329 chunks**, then composed the menu app and passed all **34 browser checks**. The root 14 Python tests, native/Astro checks, type-aware lint, formatting and 30 menu tests passed. [Preview screenshot artifact](https://github.com/h0rv/oldphilly/actions/runs/39165367328/artifacts/12149678984) was uploaded successfully. Later documentation-only commits do not change this tested implementation; use the PR Checks tab for their current run status. Independent Luna integration review completed with no substantive blocker; see LUNA.md.
