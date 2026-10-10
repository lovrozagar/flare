# Bit 14 — Packaging and release

Creates every `P14` row. Chooses the packager by running the contract below, then adds that packager's config file to `files.tsv` in the same commit. The candidates are `tsdown` and `tsc` with the Solid JSX-preserve transform (B18).

## Packager spike

Both candidates are run against the contract. The one that passes is the packager. If both pass, `tsdown` is used. If neither passes, this bit stops and a new decision names the next candidate. The spike is not a third way of shipping.

The contract, asserted by `packages/core/tests/structure/exports.test.ts` and `api.test.ts`:

| test | case | result |
| --- | --- | --- |
| `subpath resolves` | every key in `03-surface.md` except the `./fonts/*` pattern | `types` and `default` resolve to files inside the tarball |
| `font subpath` | a real key of `registry.json`, imported as `@lovrozagar/flare/fonts/<id>` | the default export resolves to that generated module. The module does not import another family |
| `font barrel` | `@lovrozagar/flare/fonts` | does not resolve |
| `solid condition` | the four JSX entries | the `solid` condition resolves to source, and the source still contains JSX |
| `compiled default` | the same entries | `default` resolves to compiled ESM with no JSX |
| `no src path in dts` | every `.d.ts` | the text contains no `virtual:` and no `packages/core/src` |
| `snapshot` | each entry's public `.d.ts` | matches the committed snapshot. A change is a commit of its own |
| `tarball contents` | `npm pack` | exactly `dist`, `src`, `README.md`, `LICENSE`, `package.json` |
| `consumer strict` | a fixture with `exactOptionalPropertyTypes` and `verbatimModuleSyntax` | `tsc` exits 0 against the packed types |
| `no dependencies` | the packed `package.json` | the `dependencies` key is absent |
| `peer floors` | the same manifest | each peer in the B79 table is `>=` its devDependency version. `optional` is true only for `sharp`, `@tanstack/solid-query`, `negotiator`, `isbot`, and `@formatjs/intl-localematcher` |
| `not a peer` | the same manifest | `@babel/parser`, `tailwindcss`, `oxc-resolver`, `node-html-markdown`, `@tanstack/query-broadcast-client-experimental`, and `@types/negotiator` are absent from both peer and dependency keys |

## `scripts/release.test.ts`

| test | case | result |
| --- | --- | --- |
| `refuses dirty` | a dirty tree | non-zero |
| `refuses red` | the command is invoked with a flag that points at a failing test fixture | non-zero, nothing published |
| `tag` | a clean green tree | the published version of `@lovrozagar/flare` equals the git tag. `@lovrozagar/flare-fonts` is not published |

## `tests/e2e/golden.test.ts`

Install from the packed tarball, not from the workspace.

| test | case | result |
| --- | --- | --- |
| `node` | install the packed tarball, then `codegen`, `dev`, `build`, and `createNodeListener` on `apps/minimal` | `/` is 200. `POST /_flare/fn/<id>` of `src/fns/echo.ts` export `echo` returns the envelope whose `data` equals the JSON input. The id is the B41 hash. A data URL returns NDJSON |
| `bun` | the same build, served with `createBunFetch` | the same three requests |
| `workers` | the same build under miniflare | the same three requests |

## `features/fonts/generate.test.ts`

| test | case | result |
| --- | --- | --- |
| `fixture` | a registry of two families | exactly two modules, each a default export of that family's metadata, and no `index.ts` |
| `real registry` | `registry.json` | the generated directory's filenames equal the registry keys |
| `hyphen` | id `open-sans` | the file is `open-sans.ts` |
| `escape` | a family name containing `</style>` | the generated module's CSS helper receives the escaped name |
| `root clean` | `features/fonts/shared/index.ts` | it does not import `generated/` |

`registry.json` is the metadata moved from `_v0`'s font registry: id, weights, styles, unicode ranges, file urls, and fallback metrics. The move is a data copy checked by `real registry`. A family that cannot be expressed in those fields is dropped and named in the commit, not given a new field. The woff2 bytes are not in this package. A module holds the url.

## Done

The golden test passes on Node, Bun, and Workers from the tarball, using `apps/minimal`. The generated modules match `registry.json`. Release publishes `@lovrozagar/flare` only (B78). `create-flare` is not part of this bit (B75).

This is 1.0. anyrow can move.
