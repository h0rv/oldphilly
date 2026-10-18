# Astro checking boundaries

Verified against current official Astro/Oxc docs and npm metadata on 2026-10-18. Astro **7.4.0** is stable, requires Node >=22.22.0, and emits static output here. No adapter or UI framework is installed.

`npm run typecheck` runs both compiler paths:

- Native stable **TypeScript 7.0.2**, installed under the npm alias `typescript-native`, checks all application/import/test TypeScript using `tsconfig.json`. It retains `skipLibCheck: false` and all strict settings.
- Official **@astrojs/check 0.9.10** checks Astro templates and configuration using `tsconfig.astro.json`, failing on warnings. Its declared peer dependency is TypeScript `^5 || ^6`, and its implementation loads the TypeScript JavaScript API. **TypeScript 6.0.3** is retained solely for that supported API; no peer override or native preview is substituted.

Astro's standard configuration enables `skipLibCheck`. The dedicated Astro configuration retains that setting because Astro 7.4.0's published declaration graph fails full dependency checking: duplicated generated content declarations, missing internal exports and references to optional storage drivers. This setting applies to dependency declarations in the Astro checker; templates, component props and configuration still receive strict checks. It is not enabled in the independent native application check. No lint suppressions, unsafe casts or `any` are added to application code.

Oxfmt **0.73.0** explicitly enables `astro: true` and uses the pinned official `@astrojs/compiler-rs 0.5.2` runtime. Oxlint **1.88.0** discovers `.astro` files and lints their supported script/frontmatter regions; it does not replace Astro template checking. The unassigned-import rule permits CSS assets, which are intentional styling side effects; it remains enabled for code. A temporary explicit-`any` Astro frontmatter probe was rejected by the configured Oxlint rule. A temporary numeric `Page.title` prop was rejected by `astro check` with TS2322. Both probes were removed, confirming the check paths run on Astro files.

References: [Astro TypeScript](https://docs.astro.build/en/guides/typescript/), [static output](https://docs.astro.build/en/reference/configuration-reference/#output), [Oxc compatibility](https://oxc.rs/compatibility.html), [Oxfmt Astro option](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html#astro). Package metadata and the installed official checker code establish the peer/API constraint.
